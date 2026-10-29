import { eq, type InferSelectModel } from 'drizzle-orm'
import type { AppTables } from '../db/schema'
import { getDb } from '../db/client'
import { appError } from '../utils/errors'
import { renderMarkdown } from '../utils/markdown'
import {
  PLUGIN_SIDES,
  type PluginDetail,
  type PluginListResult,
  type PluginSide,
  type PluginSummary,
  type PluginVersionSummary,
  type PublishedPluginDetail,
} from '../../shared/types/plugins'

/**
 * npm 插件索引。
 *
 * 市场不再托管插件包：它只定时从 registry 搜索 `epanel-plugin-*` 包，把元数据缓存到本地，
 * 面板按这些元数据把包安装成自己的 npm 依赖。包内容、版本、README 与端声明全部来自 npm。
 */

export type NpmPluginRow = InferSelectModel<AppTables['npmPlugins']>

const PLUGIN_ID = /^[a-z][a-z0-9_-]{1,63}$/
const PACKAGE_NAME = /^(?:@[a-z0-9_.-]+\/)?epanel-plugin-[a-z0-9_.-]+$/
const SEARCH_SIZE = 250
const MAX_SEARCH_PAGES = 20
const MAX_VERSIONS = 50
const MAX_PACKUMENT_BYTES = 20 * 1024 * 1024
const SYNC_INTERVAL = Math.max(60_000, Number(process.env.EPANEL_MARKET_NPM_SYNC_INTERVAL) || 30 * 60 * 1000)

export const PAGE_SIZE = 12

function registry(): string {
  return (process.env.EPANEL_MARKET_NPM_REGISTRY || 'https://registry.npmjs.org').replace(/\/+$/, '')
}

function packageUrl(name: string): string {
  const encoded = name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name)
  return `${registry()}/${encoded}`
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 版本号里的一段：纯数字按数值比，其余按字符串比，数字段低于字母段。 */
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

/** 与 semver 一致的稳定排序；任意字符串都能比较，所以非 semver 版本号也有固定顺序。 */
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

/** 包名去掉 scope 与 `epanel-plugin-` 前缀后的默认插件标识。 */
export function pluginIdFromPackageName(name: string): string | null {
  const base = name.split('/').pop() ?? ''
  if (!base.startsWith('epanel-plugin-')) return null
  const id = base.slice('epanel-plugin-'.length)
  return PLUGIN_ID.test(id) ? id : null
}

function sidesOf(value: unknown): PluginSide[] {
  const elements = isObject(value) ? value : {}
  return PLUGIN_SIDES.filter(side => isObject(elements[side]))
}

function authorOf(packument: Record<string, any>, latest: Record<string, any>): string {
  for (const value of [latest.author, packument.author]) {
    if (typeof value === 'string' && value.trim()) return value.replace(/\s*<.*$/, '').trim()
    if (isObject(value) && typeof value.name === 'string' && value.name.trim()) return value.name.trim()
  }
  const maintainer = Array.isArray(packument.maintainers) ? packument.maintainers[0] : undefined
  if (isObject(maintainer) && typeof maintainer.name === 'string') return maintainer.name
  const publisher = isObject(packument._npmUser) ? packument._npmUser : undefined
  return typeof publisher?.name === 'string' ? publisher.name : 'npm'
}

function repositoryOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (isObject(value) && typeof value.url === 'string') return value.url
  return ''
}

function packageText(document: Record<string, any>, fallback: Record<string, any>, field: string): string {
  const value = typeof document[field] === 'string' ? document[field] : fallback[field]
  return typeof value === 'string' ? value : ''
}

function publishedAt(time: Record<string, any>, version: string): number {
  const value = time[version]
  if (typeof value !== 'string') return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function keywordsOf(packument: Record<string, any>, latest: Record<string, any>): string[] {
  const value = Array.isArray(latest.keywords)
    ? latest.keywords
    : Array.isArray(packument.keywords)
      ? packument.keywords
      : []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function categoryOf(keywords: string[], elements: Record<string, any>): string {
  if (typeof elements.category === 'string' && elements.category.trim()) return elements.category.trim()
  return keywords.find(item => !['epanel', 'plugin', 'elementspanel'].includes(item.toLowerCase())) ?? ''
}

/**
 * 把一个 npm packument 转换成索引行。纯函数，便于不连 registry 也能测试字段映射。
 */
export function packageRecordFromPackument(
  name: string,
  packument: Record<string, any>,
  now = Date.now()
): NpmPluginRow | null {
  if (!PACKAGE_NAME.test(name) || !isObject(packument.versions)) return null
  const versionNames = Object.keys(packument.versions).filter(version => isObject(packument.versions[version]))
  if (!versionNames.length) return null

  const distTags = isObject(packument['dist-tags']) ? packument['dist-tags'] : {}
  const sorted = [...versionNames].sort(compareVersions).reverse()
  const latestVersion =
    typeof distTags.latest === 'string' && versionNames.includes(distTags.latest) ? distTags.latest : sorted[0]!
  const latest = packument.versions[latestVersion] as Record<string, any>
  const elements = isObject(latest.elementspanel)
    ? latest.elementspanel
    : isObject(packument.elementspanel)
      ? packument.elementspanel
      : {}
  const id =
    typeof elements.id === 'string' && PLUGIN_ID.test(elements.id)
      ? elements.id
      : pluginIdFromPackageName(name)
  if (!id) return null

  const time = isObject(packument.time) ? packument.time : {}
  const versions: PluginVersionSummary[] = sorted.slice(0, MAX_VERSIONS).map(version => {
    const document = packument.versions[version] as Record<string, any>
    const dist = isObject(document.dist) ? document.dist : {}
    return {
      id: `${name}@${version}`,
      version,
      status: 'approved',
      changelog: packageText(document, isObject(document.elementspanel) ? document.elementspanel : {}, 'changelog'),
      fileCount: Number.isFinite(Number(dist.fileCount)) ? Number(dist.fileCount) : 0,
      sizeBytes: Number.isFinite(Number(dist.unpackedSize)) ? Number(dist.unpackedSize) : 0,
      submittedAt: publishedAt(time, version),
      sides: sidesOf(document.elementspanel ?? elements),
    }
  })
  const selected = versions.find(item => item.version === latestVersion) ?? versions[0]!
  // npm version documents contain the published package.json. Runtime entry
  // manifests are never a source of market metadata.
  const description = packageText(latest, packument, 'description')
  const keywords = keywordsOf(packument, latest)
  const displayName = packageText(latest, packument, 'displayName').trim() || id
  const created = publishedAt(time, 'created')
  const modified = publishedAt(time, 'modified')

  return {
    id,
    name,
    displayName,
    summary: description.slice(0, 200),
    description,
    category: categoryOf(keywords, elements),
    keywords: JSON.stringify(keywords),
    authorName: authorOf(packument, latest),
    repository: repositoryOf(latest.repository) || repositoryOf(packument.repository),
    homepage: packageText(latest, packument, 'homepage'),
    license: packageText(latest, packument, 'license'),
    latestVersion: selected.version,
    versions: JSON.stringify(versions),
    readme: typeof packument.readme === 'string' ? packument.readme.slice(0, 512 * 1024) : '',
    sides: JSON.stringify(sidesOf(elements)),
    publishedAt: created || publishedAt(time, latestVersion),
    updatedAt: modified || now,
    syncedAt: now,
  }
}

async function fetchJson(url: string, timeout = 30_000): Promise<Record<string, any>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
    const text = await response.text()
    if (text.length > MAX_PACKUMENT_BYTES) throw new Error(`Response too large: ${url}`)
    return JSON.parse(text) as Record<string, any>
  } finally {
    clearTimeout(timer)
  }
}

/** registry 搜索能同时覆盖 scope 包与无 scope 包。 */
async function discoverPackageNames(): Promise<string[]> {
  const names = new Set<string>()
  for (const text of ['epanel-plugin', '@elementspanel']) {
    for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
      const from = page * SEARCH_SIZE
      const data = await fetchJson(
        `${registry()}/-/v1/search?text=${encodeURIComponent(text)}&size=${SEARCH_SIZE}&from=${from}`
      )
      const objects = Array.isArray(data.objects) ? data.objects : []
      for (const item of objects) {
        const name = isObject(item.package) && typeof item.package.name === 'string' ? item.package.name : ''
        if (PACKAGE_NAME.test(name)) names.add(name)
      }
      const total = Number(data.total) || 0
      if (!objects.length || from + objects.length >= total || objects.length < SEARCH_SIZE) break
    }
  }
  return [...names]
}

function preferPackage(current: NpmPluginRow, next: NpmPluginRow): NpmPluginRow {
  const official = (name: string) => name.startsWith('@elementspanel/')
  if (official(current.name) !== official(next.name)) return official(current.name) ? current : next
  return current.name.localeCompare(next.name) <= 0 ? current : next
}

export interface NpmSyncResult {
  total: number
  updatedAt: number
}

let running: Promise<NpmSyncResult> | null = null

/** 拉取一次索引。并发调用共用同一次同步，避免同时改写同一批行。 */
export function syncNpmIndex(): Promise<NpmSyncResult> {
  if (!running) running = syncNpmIndexNow().finally(() => (running = null))
  return running
}

async function syncNpmIndexNow(): Promise<NpmSyncResult> {
  const names = await discoverPackageNames()
  const records = new Map<string, NpmPluginRow>()
  for (let index = 0; index < names.length; index += 4) {
    const batch = names.slice(index, index + 4)
    const results = await Promise.all(
      batch.map(async name => {
        try {
          return packageRecordFromPackument(name, await fetchJson(packageUrl(name)))
        } catch (error) {
          console.warn(`[npm-index] failed to read ${name}:`, (error as Error).message)
          return null
        }
      })
    )
    for (const record of results) {
      if (!record) continue
      const current = records.get(record.id)
      records.set(record.id, current ? preferPackage(current, record) : record)
    }
  }

  const { db, tables } = await getDb()
  const existing = await db.select().from(tables.npmPlugins)
  const known = new Map(existing.map(row => [row.id, row]))
  const byName = new Map(existing.map(row => [row.name, row]))
  for (const record of records.values()) {
    // A package that changes its declared plugin id still owns its name: drop the
    // old id first so the unique name column is not written twice.
    const previousName = byName.get(record.name)
    if (previousName && previousName.id !== record.id) {
      await db.delete(tables.npmPlugins).where(eq(tables.npmPlugins.id, previousName.id))
      known.delete(previousName.id)
    }
    if (known.has(record.id)) {
      await db.update(tables.npmPlugins).set(record).where(eq(tables.npmPlugins.id, record.id))
    } else {
      await db.insert(tables.npmPlugins).values(record)
    }
  }
  // 只有本轮确实成功读到包时才清理下架项，避免一次网络故障清空整个索引。
  if (records.size) {
    for (const row of existing) {
      if (!records.has(row.id))
        await db.delete(tables.npmPlugins).where(eq(tables.npmPlugins.id, row.id))
    }
  }

  return { total: records.size, updatedAt: Date.now() }
}

export function npmSyncInterval(): number {
  return SYNC_INTERVAL
}

function parseVersions(row: NpmPluginRow): PluginVersionSummary[] {
  try {
    const parsed = JSON.parse(row.versions)
    return Array.isArray(parsed) ? (parsed as PluginVersionSummary[]) : []
  } catch {
    return []
  }
}

function parseSides(row: NpmPluginRow): PluginSide[] {
  try {
    const parsed = JSON.parse(row.sides)
    return Array.isArray(parsed)
      ? parsed.filter((side): side is PluginSide => side === 'panel' || side === 'daemon')
      : []
  } catch {
    return []
  }
}

function toSummary(row: NpmPluginRow): PluginSummary {
  const versions = parseVersions(row)
  const latestVersion = versions.find(item => item.version === row.latestVersion) ?? versions[0]
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    summary: row.summary,
    category: row.category,
    author: { id: row.name, displayName: row.authorName || 'npm' },
    latestVersion,
    sides: parseSides(row),
    hasIcon: false,
    createdAt: row.publishedAt,
    updatedAt: row.updatedAt,
  }
}

/** 首页插件列表。索引本身很小，筛选与分页在内存里完成，跨数据库方言一致。 */
export async function listIndexedPlugins(options: {
  q?: string
  category?: string
  page?: number
  pageSize?: number
} = {}): Promise<PluginListResult> {
  const { db, tables } = await getDb()
  const page = Math.max(1, Number(options.page) || 1)
  const pageSize = Math.min(48, Math.max(1, Number(options.pageSize) || PAGE_SIZE))
  const q = options.q?.trim().toLowerCase() ?? ''

  const rows = (await db.select().from(tables.npmPlugins)).sort((a, b) => b.updatedAt - a.updatedAt)
  const matched = rows.filter(row => {
    if (options.category && row.category !== options.category) return false
    if (!q) return true
    return [row.name, row.displayName, row.summary, row.category, row.description].some(field =>
      String(field ?? '').toLowerCase().includes(q)
    )
  })

  return {
    items: matched.slice((page - 1) * pageSize, page * pageSize).map(toSummary),
    categories: [...new Set(matched.map(row => row.category).filter(Boolean))].sort(),
    total: matched.length,
    page,
    pageSize,
  }
}

export async function getIndexedPlugin(id: string, version?: string): Promise<PublishedPluginDetail> {
  const { db, tables } = await getDb()
  const rows = await db.select().from(tables.npmPlugins).where(eq(tables.npmPlugins.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw appError(404, 'NOT_FOUND', '插件不存在或尚未同步到索引')

  const versions = parseVersions(row)
  const selected = version ? versions.find(item => item.version === version) : versions.find(item => item.version === row.latestVersion) ?? versions[0]
  if (!selected) throw appError(404, 'NOT_FOUND', '该版本不存在')
  const detail: PluginDetail = {
    ...toSummary(row),
    description: row.description,
    versions,
  }
  return {
    ...detail,
    selectedVersion: selected,
    readme: row.readme,
    readmeHtml: renderMarkdown(row.readme),
  }
}
