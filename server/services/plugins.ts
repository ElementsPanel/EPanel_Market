import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, like, or, type InferSelectModel } from 'drizzle-orm'
import type { AppTables } from '../db/schema'
import { getDb } from '../db/client'
import { appError } from '../utils/errors'
import {
  artifactRelativePath,
  hasArtifactIcon,
  listArtifactSides,
  readArtifactCompatibility,
  readArtifactManifest,
  readArtifactReadme,
  removeArtifactDir,
} from '../utils/artifacts'
import { renderMarkdown } from '../utils/markdown'
import type {
  PluginCompatibilityMap,
  PluginDetail,
  PublishedPluginDetail,
  PluginListResult,
  PluginSide,
  PluginSummary,
  PluginUploadManifest,
  PluginVersionStatus,
  PluginVersionSummary,
  PluginVisibility,
} from '../../shared/types/plugins'
import type { ConsolePluginItem, ConsoleReviewItem, ReviewMetadataField } from '../../shared/types/console'
import type { UserRow } from './users'

export type PluginRow = InferSelectModel<AppTables['plugins']>
export type PluginVersionRow = InferSelectModel<AppTables['pluginVersions']>

/**
 * 插件标识：发布时的 slug，也是面板与 daemon 上的安装目录名，所以 Windows 设备名不能用。
 * 规则与 ElementsPanel 的发布脚本、插件脚手架一致。
 */
const NAME_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/
const VERSION_PATTERN = /^[0-9][^\s]{0,31}$/
export const PAGE_SIZE = 12

/** 版本号里的一段：纯数字按数值比（任意长度），其余按字符串比，数字段低于字母段。 */
function compareIdentifier(a: string, b: string): number {
  const numeric = /^\d+$/
  if (numeric.test(a) && numeric.test(b)) {
    const left = a.replace(/^0+(?=\d)/, '')
    const right = b.replace(/^0+(?=\d)/, '')
    if (left.length !== right.length) return left.length < right.length ? -1 : 1
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (numeric.test(a)) return -1
  if (numeric.test(b)) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 按版本号比较，规则同 semver：主体逐段比，缺的段当 0；带预发布标记（`-beta.1`）的低于
 * 对应的正式版，预发布之间逐段比；构建元数据（`+...`）不参与。任意字符串都能比较，所以
 * 不合 semver 的版本号也有稳定的顺序。
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [core = '', ...pre] = value.split('+')[0]!.split('-')
    return { core: core.split('.'), pre: pre.join('-') }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < Math.max(left.core.length, right.core.length); index += 1) {
    const diff = compareIdentifier(left.core[index] ?? '0', right.core[index] ?? '0')
    if (diff) return diff
  }
  if (left.pre === right.pre) return 0
  if (!left.pre) return 1
  if (!right.pre) return -1
  const leftParts = left.pre.split('.')
  const rightParts = right.pre.split('.')
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if (leftParts[index] === undefined) return -1
    if (rightParts[index] === undefined) return 1
    const diff = compareIdentifier(leftParts[index]!, rightParts[index]!)
    if (diff) return diff
  }
  return 0
}

/** 发布顺序：版本号高的在前，版本号相同时后提交的在前。「最新版本」就是排在第一的。 */
function byRelease(
  a: { version: string; submittedAt: number },
  b: { version: string; submittedAt: number }
): number {
  return compareVersions(b.version, a.version) || b.submittedAt - a.submittedAt
}

function toVersionSummary(row: PluginVersionRow): PluginVersionSummary {
  return {
    id: row.id,
    version: row.version,
    status: row.status as PluginVersionStatus,
    changelog: row.changelog,
    fileCount: row.fileCount,
    sizeBytes: row.sizeBytes,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt ?? undefined,
    reviewNote: row.reviewNote ?? undefined,
    sides: listArtifactSides(row.artifactPath),
    compatibility: readArtifactCompatibility(row.artifactPath),
  }
}

function authorOf(users: Map<string, UserRow>, authorId: string) {
  const user = users.get(authorId)
  return { id: authorId, displayName: user?.displayName ?? '未知用户' }
}

/**
 * 同一插件的多个版本里取最新的：看版本号，而不是提交时间——给旧版本线补发一个修复版，
 * 不能让面板的「安装最新版」降级。
 */
function newestVersion(rows: PluginVersionRow[]): PluginVersionRow | undefined {
  return [...rows].sort(byRelease)[0]
}

async function loadAuthors(authorIds: string[]): Promise<Map<string, UserRow>> {
  const { db, tables } = await getDb()
  const unique = [...new Set(authorIds)]
  if (!unique.length) return new Map()
  const rows = await db.select().from(tables.users).where(inArray(tables.users.id, unique))
  return new Map(rows.map((row) => [row.id, row]))
}

async function loadVersions(pluginIds: string[], status?: PluginVersionStatus) {
  const { db, tables } = await getDb()
  if (!pluginIds.length) return new Map<string, PluginVersionRow[]>()
  const rows = await db
    .select()
    .from(tables.pluginVersions)
    .where(
      status
        ? and(
            inArray(tables.pluginVersions.pluginId, pluginIds),
            eq(tables.pluginVersions.status, status)
          )
        : inArray(tables.pluginVersions.pluginId, pluginIds)
    )
  const grouped = new Map<string, PluginVersionRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.pluginId) ?? []
    list.push(row)
    grouped.set(row.pluginId, list)
  }
  return grouped
}

function toSummary(
  plugin: PluginRow,
  users: Map<string, UserRow>,
  latest?: PluginVersionRow
): PluginSummary {
  const latestVersion = latest ? toVersionSummary(latest) : undefined
  return {
    id: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName,
    summary: plugin.summary,
    category: plugin.category,
    visibility: plugin.visibility as PluginVisibility,
    author: authorOf(users, plugin.authorId),
    latestVersion,
    sides: latestVersion?.sides ?? [],
    hasIcon: latest ? hasArtifactIcon(latest.artifactPath) : false,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
  }
}

/** 首页插件列表：只含有已通过版本且未被下架的插件。 */
export async function listPublishedPlugins(options: {
  q?: string
  category?: string
  page?: number
  pageSize?: number
} = {}): Promise<PluginListResult> {
  const { db, tables } = await getDb()
  const page = Math.max(1, Number(options.page) || 1)
  const pageSize = Math.min(48, Math.max(1, Number(options.pageSize) || PAGE_SIZE))

  // 先算出「谁有已通过版本」：这是首页唯一的准入条件。
  const approved = await db
    .select({ pluginId: tables.pluginVersions.pluginId })
    .from(tables.pluginVersions)
    .where(eq(tables.pluginVersions.status, 'approved'))
  const eligible = [...new Set(approved.map((row) => row.pluginId))]
  if (!eligible.length) return { items: [], categories: [], total: 0, page, pageSize }

  const conditions = [
    inArray(tables.plugins.id, eligible),
    eq(tables.plugins.visibility, 'listed'),
  ]
  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    conditions.push(
      or(
        like(tables.plugins.name, pattern),
        like(tables.plugins.displayName, pattern),
        like(tables.plugins.summary, pattern)
      )!
    )
  }
  if (options.category) conditions.push(eq(tables.plugins.category, options.category))

  const plugins = await db
    .select()
    .from(tables.plugins)
    .where(and(...conditions))
    .orderBy(desc(tables.plugins.updatedAt))

  const pagePlugins = plugins.slice((page - 1) * pageSize, page * pageSize)
  const [users, versions] = await Promise.all([
    loadAuthors(pagePlugins.map((plugin) => plugin.authorId)),
    loadVersions(pagePlugins.map((plugin) => plugin.id), 'approved'),
  ])

  return {
    items: pagePlugins.map((plugin) =>
      toSummary(plugin, users, newestVersion(versions.get(plugin.id) ?? []))
    ),
    categories: [...new Set(plugins.map((plugin) => plugin.category).filter(Boolean))].sort(),
    total: plugins.length,
    page,
    pageSize,
  }
}

export async function getPluginDetail(
  id: string,
  version?: string
): Promise<PublishedPluginDetail> {
  const { db, tables } = await getDb()
  const rows = await db.select().from(tables.plugins).where(eq(tables.plugins.id, id)).limit(1)
  const plugin = rows[0]
  if (!plugin || plugin.visibility !== 'listed') {
    throw appError(404, 'NOT_FOUND', '插件不存在或已下架')
  }

  const approved = (await loadVersions([plugin.id], 'approved')).get(plugin.id) ?? []
  if (!approved.length) throw appError(404, 'NOT_FOUND', '插件尚未有已通过的版本')

  const users = await loadAuthors([plugin.authorId])
  const latest = newestVersion(approved)!
  const selected = version ? approved.find((item) => item.version === version) : latest
  if (!selected) throw appError(404, 'NOT_FOUND', '该版本不存在或尚未通过审核')
  // 自述是包里的 README.md，跟着选中的版本走；渲染后的 HTML 一并给出，页面直接用，
  // 免得把 markdown 渲染器搬进浏览器。
  const readme = readArtifactReadme(selected.artifactPath)
  return {
    ...toSummary(plugin, users, latest),
    description: plugin.description,
    selectedVersion: toVersionSummary(selected),
    versions: [...approved].sort(byRelease).map(toVersionSummary),
    readme,
    readmeHtml: renderMarkdown(readme),
  }
}

/** 面板侧「我的提交」：作者本人的全部插件，含待审核与被驳回的版本。 */
export async function listPublisherPlugins(authorId: string): Promise<PluginDetail[]> {
  const { db, tables } = await getDb()
  const plugins = await db
    .select()
    .from(tables.plugins)
    .where(eq(tables.plugins.authorId, authorId))
    .orderBy(desc(tables.plugins.updatedAt))

  const [users, versions] = await Promise.all([
    loadAuthors([authorId]),
    loadVersions(plugins.map((plugin) => plugin.id)),
  ])

  return plugins.map((plugin) => {
    const all = versions.get(plugin.id) ?? []
    const approved = all.filter((row) => row.status === 'approved')
    return {
      ...toSummary(plugin, users, newestVersion(approved)),
      description: plugin.description,
      versions: all.map(toVersionSummary).sort((a, b) => b.submittedAt - a.submittedAt),
    }
  })
}

export function validateUploadManifest(input: Partial<PluginUploadManifest>): PluginUploadManifest {
  const name = String(input.name ?? '').trim()
  const displayName = String(input.displayName ?? '').trim()
  const version = String(input.version ?? '').trim()

  if (!NAME_PATTERN.test(name)) {
    throw appError(
      400,
      'VALIDATION_ERROR',
      '插件标识须为 2-64 位小写字母、数字、下划线或连字符，并以字母开头'
    )
  }
  if (RESERVED_NAME.test(name)) {
    throw appError(400, 'VALIDATION_ERROR', `插件标识不能是 Windows 设备名：${name}`)
  }
  if (!displayName || displayName.length > 64) {
    throw appError(400, 'VALIDATION_ERROR', '请填写 1-64 个字符的插件名称')
  }
  if (!VERSION_PATTERN.test(version)) {
    throw appError(400, 'VALIDATION_ERROR', '请填写合法的版本号，例如 1.0.0')
  }

  return {
    name,
    displayName,
    version,
    summary: String(input.summary ?? '').slice(0, 200),
    description: String(input.description ?? '').slice(0, 20000),
    category: String(input.category ?? '').slice(0, 32),
    changelog: String(input.changelog ?? '').slice(0, 4000),
  }
}

/**
 * 插件信息来自包里的 `plugin.json`：包本来就是自描述的，没必要再让发布方把同一份信息
 * 单独提交一遍。取值顺序沿用发布脚本原来的写法，行为不变。
 */
export function manifestFromPluginJson(value: unknown): PluginUploadManifest {
  const raw = (value ?? {}) as Record<string, unknown>
  const id = String(raw.id ?? '').trim()
  const description = typeof raw.description === 'string' ? raw.description : ''
  return validateUploadManifest({
    name: id,
    displayName: String(raw.displayName ?? raw.name ?? id),
    version: String(raw.version ?? ''),
    summary: String(raw.summary ?? description),
    description,
    category: String(raw.category ?? ''),
    changelog: String(raw.changelog ?? ''),
  })
}

/** 插件信息里会公开展示、要经过审核的那几项。 */
function publicMetadata(manifest: PluginUploadManifest) {
  return {
    displayName: manifest.displayName,
    summary: manifest.summary ?? '',
    description: manifest.description ?? '',
    category: manifest.category ?? '',
  }
}

async function hasApprovedVersion(pluginId: string): Promise<boolean> {
  const approved = (await loadVersions([pluginId], 'approved')).get(pluginId) ?? []
  return approved.length > 0
}

/**
 * 找到作者名下的插件，没有就创建。
 *
 * 插件标识在全市场唯一：它是面板与 daemon 上的安装目录名，两个作者的同名插件没法装在
 * 同一台机器上，所以别人已经用了的标识直接拒绝。
 *
 * 已上架插件的名称、简介、说明与分类不在上传时改——它们是公开展示的内容，要等这个版本
 * 通过审核（见 `reviewVersion`）才换成新包里的那一份；「更新时间」同理。还没有任何版本
 * 通过审核的插件不公开，照常更新，作者和审核员看到的就是最新提交的信息。
 */
export async function resolvePluginForUpload(
  authorId: string,
  manifest: PluginUploadManifest
): Promise<PluginRow> {
  const { db, tables } = await getDb()
  const existing = await db
    .select()
    .from(tables.plugins)
    .where(eq(tables.plugins.name, manifest.name))

  const plugin = existing.find((row) => row.authorId === authorId)
  if (plugin) {
    if (await hasApprovedVersion(plugin.id)) return plugin
    const patch = { ...publicMetadata(manifest), updatedAt: Date.now() }
    await db.update(tables.plugins).set(patch).where(eq(tables.plugins.id, plugin.id))
    return { ...plugin, ...patch }
  }
  if (existing.length) {
    throw appError(409, 'CONFLICT', `插件标识 ${manifest.name} 已被其他作者使用，请换一个 id`)
  }

  const created = await db
    .insert(tables.plugins)
    .values({
      id: randomUUID(),
      name: manifest.name,
      authorId,
      ...publicMetadata(manifest),
      visibility: 'listed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .returning()

  const row = created[0]
  if (!row) throw appError(500, 'VALIDATION_ERROR', '创建插件失败，请重试')
  return row
}

/** 同一插件的同一版本号只能提交一次——重复上传必须先升版本号。 */
export async function assertVersionAvailable(pluginId: string, version: string): Promise<void> {
  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.pluginVersions)
    .where(
      and(eq(tables.pluginVersions.pluginId, pluginId), eq(tables.pluginVersions.version, version))
    )
    .limit(1)
  if (rows[0]) throw appError(409, 'CONFLICT', `版本 ${version} 已提交过，请先升级版本号`)
}

export async function createPluginVersion(input: {
  pluginId: string
  version: string
  changelog: string
  fileCount: number
  sizeBytes: number
}): Promise<{ id: string; artifactPath: string }> {
  const { db, tables } = await getDb()
  const id = randomUUID()
  const artifactPath = artifactRelativePath(input.pluginId, id)

  await db.insert(tables.pluginVersions).values({
    id,
    pluginId: input.pluginId,
    version: input.version,
    status: 'pending',
    artifactPath,
    fileCount: input.fileCount,
    sizeBytes: input.sizeBytes,
    changelog: input.changelog,
    submittedAt: Date.now(),
  })

  return { id, artifactPath }
}

/**
 * 下载时定位版本：不传 version 就取最新的已通过版本，传了就必须是已通过的。
 * 待审核与被驳回的版本不对外提供。
 */
export async function resolveDownloadVersion(
  pluginId: string,
  version?: string
): Promise<{ plugin: PluginRow; version: PluginVersionRow }> {
  const { db, tables } = await getDb()
  const rows = await db.select().from(tables.plugins).where(eq(tables.plugins.id, pluginId)).limit(1)
  const plugin = rows[0]
  if (!plugin || plugin.visibility !== 'listed') {
    throw appError(404, 'NOT_FOUND', '插件不存在或已下架')
  }

  const approved = (await loadVersions([pluginId], 'approved')).get(pluginId) ?? []
  const candidates = version ? approved.filter((row) => row.version === version) : approved
  const target = newestVersion(candidates)
  if (!target) {
    throw appError(404, 'NOT_FOUND', version ? `版本 ${version} 不可下载` : '该插件没有已通过的版本')
  }

  return { plugin, version: target }
}

/**
 * 下载哪个端。不指定时只有单端插件能自己决定；双端插件必须让用户选，
 * 与其默认挑一半，不如把问题交回去。
 */
export function resolveDownloadSide(sides: PluginSide[], requested?: string): PluginSide {
  const wanted = String(requested ?? '').trim()
  if (wanted) {
    if (!sides.includes(wanted as PluginSide)) {
      throw appError(404, 'NOT_FOUND', `该版本不包含 ${wanted} 端`)
    }
    return wanted as PluginSide
  }

  if (sides.length === 1) return sides[0]!
  throw appError(400, 'VALIDATION_ERROR', '请指定要下载的端：panel 或 daemon')
}

/**
 * `/files` 的兼容性协商。包声明了宿主插件 API / 浏览器 SDK 版本时，客户端要带着自己支持
 * 的 `pluginApi` / `pluginSdk` 来取，而且必须一致；不带参数的旧客户端只能取没有声明的旧包。
 * 不兼容返回 409，面板据此提示「需要其他版本的宿主」，而不是下载完才发现装不了。
 *
 * 客户端给的版本号必须是正整数，所以产物里读不懂的声明（报成 `api: 0`）与任何客户端都不
 * 匹配——否则 `?pluginApi=0` 就能把它取走。
 */
export function assertClientCompatible(
  compatibility: PluginCompatibilityMap,
  client: { pluginApi?: unknown; pluginSdk?: unknown }
): void {
  const contracts = Object.values(compatibility).filter((contract) => contract !== undefined)
  if (!contracts.length) return
  const version = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined
  }
  const api = version(client.pluginApi)
  const sdk = version(client.pluginSdk)
  for (const contract of contracts) {
    if (
      api === undefined ||
      contract.api !== api ||
      (contract.sdk !== undefined && contract.sdk !== sdk)
    ) {
      throw appError(409, 'CONFLICT', '这个插件需要其他版本的宿主插件 API 或浏览器 SDK')
    }
  }
}

/** 上传写盘失败时的回退：版本记录与磁盘产物一起消失。 */
export async function deletePluginVersion(versionId: string, artifactPath: string): Promise<void> {
  const { db, tables } = await getDb()
  removeArtifactDir(artifactPath)
  await db.delete(tables.pluginVersions).where(eq(tables.pluginVersions.id, versionId))
}

const REVIEW_METADATA_FIELDS: ReviewMetadataField[] = ['displayName', 'summary', 'description', 'category']

/** 一个版本包里 plugin.json 描述的插件信息；读不出合法的信息时返回 null。 */
function versionMetadata(version: PluginVersionRow) {
  const raw = readArtifactManifest(version.artifactPath)
  if (!raw) return null
  try {
    return publicMetadata(manifestFromPluginJson(raw))
  } catch {
    return null
  }
}

export async function listReviewQueue(): Promise<ConsoleReviewItem[]> {
  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.pluginVersions)
    .where(eq(tables.pluginVersions.status, 'pending'))
    .orderBy(desc(tables.pluginVersions.submittedAt))

  const plugins = await loadPluginsByIds([...new Set(rows.map((row) => row.pluginId))])
  const authors = await loadAuthors(plugins.map((plugin) => plugin.authorId))

  return rows.map((version) => {
    const plugin = plugins.find((candidate) => candidate.id === version.pluginId)
    const author = authors.get(plugin?.authorId ?? '')
    const current = {
      displayName: plugin?.displayName ?? '',
      summary: plugin?.summary ?? '',
      description: plugin?.description ?? '',
      category: plugin?.category ?? '',
    }
    // 审核员要看得到这个版本通过后公开信息会变成什么
    const submitted = versionMetadata(version) ?? current
    return {
      versionId: version.id,
      version: version.version,
      status: version.status as PluginVersionStatus,
      changelog: version.changelog,
      fileCount: version.fileCount,
      sizeBytes: version.sizeBytes,
      submittedAt: version.submittedAt,
      plugin: {
        id: plugin?.id ?? version.pluginId,
        name: plugin?.name ?? '',
        displayName: current.displayName,
        summary: current.summary,
        category: current.category,
      },
      submitted: {
        displayName: submitted.displayName,
        summary: submitted.summary,
        category: submitted.category,
        changes: REVIEW_METADATA_FIELDS.filter((field) => submitted[field] !== current[field]),
      },
      author: {
        id: plugin?.authorId ?? '',
        displayName: author?.displayName ?? '未知用户',
        email: author?.email ?? '',
      },
    }
  })
}

async function loadPluginsByIds(ids: string[]): Promise<PluginRow[]> {
  const { db, tables } = await getDb()
  if (!ids.length) return []
  return await db.select().from(tables.plugins).where(inArray(tables.plugins.id, ids))
}

export async function reviewVersion(input: {
  versionId: string
  action: 'approve' | 'reject'
  note?: string
  reviewerId: string
}): Promise<void> {
  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.pluginVersions)
    .where(eq(tables.pluginVersions.id, input.versionId))
    .limit(1)
  const version = rows[0]
  if (!version) throw appError(404, 'NOT_FOUND', '待审核的版本不存在')
  if (version.status !== 'pending') throw appError(409, 'CONFLICT', '该版本已经审核过了')

  const status: PluginVersionStatus = input.action === 'approve' ? 'approved' : 'rejected'
  await db
    .update(tables.pluginVersions)
    .set({
      status,
      reviewedAt: Date.now(),
      reviewerId: input.reviewerId,
      reviewNote: input.note?.trim() ? input.note.trim().slice(0, 2000) : null,
    })
    .where(eq(tables.pluginVersions.id, input.versionId))

  // 驳回不改变任何公开内容，已上架的插件照旧。
  if (status === 'approved') await syncPublishedMetadata(version.pluginId)
}

/**
 * 公开展示的插件信息跟着最新的已通过版本走：审核通过后，把它包里 plugin.json 的名称、
 * 简介、说明与分类写回插件，并刷新「更新时间」。读不出合法信息的旧包保留现有信息。
 */
async function syncPublishedMetadata(pluginId: string): Promise<void> {
  const { db, tables } = await getDb()
  const approved = (await loadVersions([pluginId], 'approved')).get(pluginId) ?? []
  const latest = newestVersion(approved)
  const metadata = latest ? versionMetadata(latest) : null
  await db
    .update(tables.plugins)
    .set({ ...(metadata ?? {}), updatedAt: Date.now() })
    .where(eq(tables.plugins.id, pluginId))
}

export async function listConsolePlugins(): Promise<ConsolePluginItem[]> {
  const { db, tables } = await getDb()
  const plugins = await db
    .select()
    .from(tables.plugins)
    .orderBy(desc(tables.plugins.updatedAt))

  const [users, versions] = await Promise.all([
    loadAuthors(plugins.map((plugin) => plugin.authorId)),
    loadVersions(plugins.map((plugin) => plugin.id)),
  ])

  return plugins.map((plugin) => {
    const all = versions.get(plugin.id) ?? []
    return {
      id: plugin.id,
      name: plugin.name,
      displayName: plugin.displayName,
      category: plugin.category,
      visibility: plugin.visibility as PluginVisibility,
      author: {
        id: plugin.authorId,
        displayName: users.get(plugin.authorId)?.displayName ?? '未知用户',
        email: users.get(plugin.authorId)?.email ?? '',
      },
      counts: {
        total: all.length,
        pending: all.filter((row) => row.status === 'pending').length,
        approved: all.filter((row) => row.status === 'approved').length,
        rejected: all.filter((row) => row.status === 'rejected').length,
      },
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
      versions: all.map(toVersionSummary).sort((a, b) => b.submittedAt - a.submittedAt),
    }
  })
}

export async function setPluginVisibility(
  pluginId: string,
  visibility: PluginVisibility
): Promise<void> {
  const { db, tables } = await getDb()
  await db
    .update(tables.plugins)
    .set({ visibility, updatedAt: Date.now() })
    .where(eq(tables.plugins.id, pluginId))
}

/** 删除插件：版本行随外键级联删除，磁盘产物要自己清。 */
export async function deletePlugin(pluginId: string): Promise<void> {
  const { db, tables } = await getDb()
  const versions = await db
    .select()
    .from(tables.pluginVersions)
    .where(eq(tables.pluginVersions.pluginId, pluginId))

  for (const version of versions) removeArtifactDir(version.artifactPath)
  await db.delete(tables.plugins).where(eq(tables.plugins.id, pluginId))
}

export async function countPluginsOf(authorId: string): Promise<number> {
  const { db, tables } = await getDb()
  const rows = await db
    .select({ id: tables.plugins.id })
    .from(tables.plugins)
    .where(eq(tables.plugins.authorId, authorId))
  return rows.length
}
