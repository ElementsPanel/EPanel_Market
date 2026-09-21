import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, like, or, type InferSelectModel } from 'drizzle-orm'
import type { AppTables } from '../db/schema'
import { getDb } from '../db/client'
import { appError } from '../utils/errors'
import { artifactRelativePath, listArtifactSides, removeArtifactDir } from '../utils/artifacts'
import type {
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
import type { ConsolePluginItem, ConsoleReviewItem } from '../../shared/types/console'
import type { UserRow } from './users'

export type PluginRow = InferSelectModel<AppTables['plugins']>
export type PluginVersionRow = InferSelectModel<AppTables['pluginVersions']>

const NAME_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/
const VERSION_PATTERN = /^[0-9][^\s]{0,31}$/
export const PAGE_SIZE = 12

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
  }
}

function authorOf(users: Map<string, UserRow>, authorId: string) {
  const user = users.get(authorId)
  return { id: authorId, displayName: user?.displayName ?? '未知用户' }
}

/** 同一插件的多个版本里取最新的：先比提交时间，再比版本号。 */
function newestVersion(rows: PluginVersionRow[]): PluginVersionRow | undefined {
  return [...rows].sort(
    (a, b) => b.submittedAt - a.submittedAt || b.version.localeCompare(a.version)
  )[0]
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
  return {
    ...toSummary(plugin, users, latest),
    description: plugin.description,
    selectedVersion: toVersionSummary(selected),
    versions: approved.map(toVersionSummary).sort(
      (a, b) => b.submittedAt - a.submittedAt || b.version.localeCompare(a.version)
    ),
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
    throw appError(400, 'VALIDATION_ERROR', '插件标识只能包含小写字母、数字、下划线与连字符')
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

/** 找到作者名下的插件，没有就创建。同名插件属于不同的人时直接拒绝。 */
export async function resolvePluginForUpload(
  authorId: string,
  manifest: PluginUploadManifest
): Promise<PluginRow> {
  const { db, tables } = await getDb()
  const existing = await db
    .select()
    .from(tables.plugins)
    .where(and(eq(tables.plugins.authorId, authorId), eq(tables.plugins.name, manifest.name)))
    .limit(1)

  const plugin = existing[0]
  if (plugin) {
    const updatedAt = Date.now()
    await db
      .update(tables.plugins)
      .set({
        displayName: manifest.displayName,
        summary: manifest.summary ?? '',
        description: manifest.description ?? '',
        category: manifest.category ?? '',
        updatedAt,
      })
      .where(eq(tables.plugins.id, plugin.id))
    return {
      ...plugin,
      displayName: manifest.displayName,
      summary: manifest.summary ?? '',
      description: manifest.description ?? '',
      category: manifest.category ?? '',
      updatedAt,
    }
  }

  const created = await db
    .insert(tables.plugins)
    .values({
      id: randomUUID(),
      name: manifest.name,
      authorId,
      displayName: manifest.displayName,
      summary: manifest.summary ?? '',
      description: manifest.description ?? '',
      category: manifest.category ?? '',
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

/** 上传写盘失败时的回退：版本记录与磁盘产物一起消失。 */
export async function deletePluginVersion(versionId: string, artifactPath: string): Promise<void> {
  const { db, tables } = await getDb()
  removeArtifactDir(artifactPath)
  await db.delete(tables.pluginVersions).where(eq(tables.pluginVersions.id, versionId))
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
        displayName: plugin?.displayName ?? '',
        category: plugin?.category ?? '',
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

  await db
    .update(tables.plugins)
    .set({ updatedAt: Date.now() })
    .where(eq(tables.plugins.id, version.pluginId))
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
