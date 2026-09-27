import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { PLUGIN_SIDES, type PluginCompatibilityMap, type PluginSide } from '../../shared/types/plugins'
import { getDataDir } from './paths'
import { PLUGIN_PACKAGE_EXTENSIONS, parseCompatibility } from './package-rules'

/**
 * 上传产物的落盘位置。所有路径都必须由这里生成或由 `safeRelativePath` 校验，
 * 因为文件名来自 multipart 请求，是可信边界之外的数据。
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
/**
 * 读写产物时认的扩展名。包里能放什么由上传时的 `checkPluginPackage` 决定；这里再宽出
 * 早先规则允许过的 `.ts`、`.vue` 与 `.png`，已经上架的旧包仍然取得到。
 */
const ALLOWED_EXTENSIONS = new Set([...PLUGIN_PACKAGE_EXTENSIONS, '.ts', '.vue', '.png'])

/** 图标是插件的门面：固定文件名，放在包里某一端的根目录（`<side>/icon.png`）。 */
const ICON_FILE = 'icon.png'
const ICON_MIME = 'image/png'
/** PNG 文件头。上传的内容是可信边界之外的数据，按文件头判定真实类型。 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function getArtifactsRoot(): string {
  return join(getDataDir(), 'artifacts')
}

/** 产物目录，相对项目根存放，便于迁移 data 目录。 */
export function artifactRelativePath(pluginId: string, versionId: string): string {
  if (!ID_PATTERN.test(pluginId) || !ID_PATTERN.test(versionId)) {
    throw new Error('产物标识不合法')
  }
  return join('data', 'artifacts', pluginId, versionId)
}

export function artifactAbsolutePath(relativePath: string): string {
  const root = getArtifactsRoot()
  const abs = isAbsolute(relativePath) ? normalize(relativePath) : join(getDataDir(), '..', relativePath)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error('产物路径不在产物目录之内')
  }
  return abs
}

/**
 * 把上传时的文件名归一化为产物目录内的相对路径。
 * 拒绝绝对路径、盘符、`..`、空名与不在白名单内的扩展名。
 */
export function safeRelativePath(rawName: string): string {
  const normalized = rawName.replace(/\\/g, '/').replace(/\0/g, '')
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`非法的产物文件名：${rawName}`)
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0)
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`非法的产物文件名：${rawName}`)
  }

  const extension = segments[segments.length - 1].includes('.')
    ? `.${segments[segments.length - 1].split('.').pop()?.toLowerCase()}`
    : ''
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`不允许的产物文件类型：${rawName}`)
  }

  return segments.join(sep)
}

export function ensureArtifactDir(relativePath: string): string {
  const abs = artifactAbsolutePath(relativePath)
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true })
  return abs
}

export function writeArtifactFile(relativePath: string, relativeFile: string, data: Buffer): void {
  const target = join(artifactAbsolutePath(relativePath), relativeFile)
  mkdirSync(dirname(target), { recursive: true })
  const root = artifactAbsolutePath(relativePath)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('产物路径逃逸')
  }
  writeFileSync(target, data)
}

export function removeArtifactDir(relativePath: string): void {
  if (!relativePath) return
  rmSync(artifactAbsolutePath(relativePath), { recursive: true, force: true })
  derivedCache.delete(relativePath)
}

/** 下载时逐文件取用：路径仍要过 safeRelativePath，产物目录之外一律拒绝。 */
export function readArtifactFile(relativePath: string, relativeFile: string): Buffer {
  const root = artifactAbsolutePath(relativePath)
  const target = join(root, safeRelativePath(relativeFile))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('产物路径逃逸')
  }
  return readFileSync(target)
}

/** 产物里的一个文件。`mtimeMs` 只用来认出目录变了，不对外展示。 */
interface ArtifactFile {
  path: string
  size: number
  mtimeMs: number
}

export function listArtifactFiles(relativePath: string): ArtifactFile[] {
  const root = artifactAbsolutePath(relativePath)
  if (!existsSync(root)) return []

  const files: ArtifactFile[] = []
  const walk = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      // 软链指向产物目录之外，只按它本身是文件还是目录来处理会读错东西。
      if (item.isSymbolicLink()) continue
      const target = join(directory, item.name)
      if (item.isDirectory()) {
        walk(target)
        continue
      }
      const stats = statSync(target)
      files.push({
        path: relative(root, target).split(sep).join('/'),
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      })
    }
  }
  walk(root)

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * 一个版本的产物是写一次就不再改的：上传把它写进一个新建的 versionId 目录，之后只会被
 * 整个删掉。所以从产物推导出来的东西——端、图标、兼容性、文件摘要——可以缓存下来，不必
 * 每个请求都重新读一遍文件；`/files` 要把整个包哈希一遍，那是公开接口，更不能每次都算。
 *
 * 缓存不是按目录名认的，而是按目录当下的样子（文件清单 + 大小 + 修改时间）：走一遍目录
 * 很便宜，读完所有字节才贵。这样即使有人在接口之外动了产物（开发时手改、测试里直接写），
 * 读到的也是新内容，缓存只省掉真正重复的那部分工作。
 *
 * 条目数有上限，超出就整个丢掉重来，免得一个长跑进程把每个见过的版本都留在内存里。
 */
const DERIVED_CACHE_LIMIT = 512
const derivedCache = new Map<string, { signature: string; values: Map<string, unknown> }>()

function signatureOf(files: ArtifactFile[]): string {
  return JSON.stringify(files.map((file) => [file.path, file.size, file.mtimeMs]))
}

function derived<T>(
  relativePath: string,
  key: string,
  compute: (files: ArtifactFile[]) => T
): T {
  const files = listArtifactFiles(relativePath)
  const signature = signatureOf(files)
  let entry = derivedCache.get(relativePath)
  if (!entry || entry.signature !== signature) {
    if (derivedCache.size >= DERIVED_CACHE_LIMIT) derivedCache.clear()
    entry = { signature, values: new Map<string, unknown>() }
    derivedCache.set(relativePath, entry)
  }
  if (!entry.values.has(key)) entry.values.set(key, compute(files))
  return entry.values.get(key) as T
}

/**
 * 文件清单附带每个文件的 SHA-256。面板安装前用它和大小核对下载到的字节，传坏的、
 * 被截断的文件在写盘之前就会被拒绝。
 */
export function listArtifactFileDigests(
  relativePath: string
): Array<{ path: string; size: number; sha256: string }> {
  return derived(relativePath, 'digests', (files) =>
    files.map((file) => {
      const data = readArtifactFile(relativePath, file.path)
      return {
        path: file.path,
        size: data.byteLength,
        sha256: createHash('sha256').update(data).digest('hex'),
      }
    })
  )
}

/** 某一端的 plugin.json；这一端不存在或清单读不出一个 JSON 对象时返回 null。 */
function readSideManifest(relativePath: string, side: PluginSide): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(
      readArtifactFile(relativePath, `${side}/plugin.json`).toString('utf8')
    )
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** 描述整包的清单：先 panel 端，再看 daemon 端，与上传时取插件信息的顺序一致。 */
export function readArtifactManifest(relativePath: string): Record<string, unknown> | null {
  for (const side of PLUGIN_SIDES) {
    const manifest = readSideManifest(relativePath, side)
    if (manifest) return manifest
  }
  return null
}

/**
 * 该版本各端声明的兼容性（`<side>/plugin.json` 的 `elements`）。与端、自述一样从产物推导，
 * 不存数据库字段。没有声明的端是旧包，不出现在结果里；声明了却读不懂的（只可能是新规则
 * 之前上传的包）报成 `api: 0`：版本号按约定从 1 起，所以它与任何客户端都不匹配
 * （`assertClientCompatible` 只认正整数），面板会把它当作不兼容。
 *
 * 版本摘要每一行都要用到它，列表和控制台一次请求会算很多行，所以同样按产物缓存。
 */
export function readArtifactCompatibility(relativePath: string): PluginCompatibilityMap {
  return derived(relativePath, 'compatibility', () => {
    const compatibility: PluginCompatibilityMap = {}
    for (const side of PLUGIN_SIDES) {
      const manifest = readSideManifest(relativePath, side)
      if (!manifest) continue
      const contract = parseCompatibility(manifest.elements)
      if (contract !== undefined) compatibility[side] = contract ?? { api: 0 }
    }
    return compatibility
  })
}

/**
 * 该版本产物里实际存在的端。首段路径就是端，所以从文件清单推导，不需要额外的
 * 数据库列——这个项目没有迁移机制，加列会让已有的库静默缺列。
 *
 * 列表、详情与控制台的每一个版本摘要都要问一次，所以同样按产物缓存。
 */
export function listArtifactSides(relativePath: string): PluginSide[] {
  return derived(relativePath, 'sides', (files) => {
    const segments = new Set(files.map((file) => file.path.split('/')[0]))
    return PLUGIN_SIDES.filter((side) => segments.has(side))
  })
}

/**
 * 某一端的文件，名字去掉首段的端前缀——解压后可以直接放进该端的插件目录。
 * 名字仍要过 `safeRelativePath`，产物目录之外的东西一律取不到。
 */
export function listSideEntries(
  relativePath: string,
  side: PluginSide
): Array<{ name: string; data: Buffer }> {
  const prefix = `${side}/`
  return listArtifactFiles(relativePath)
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({
      name: safeRelativePath(file.path.slice(prefix.length)).split(sep).join('/'),
      data: readArtifactFile(relativePath, file.path),
    }))
}

/**
 * 包里的自述，即某一端根目录的 `README.md`（文件名大小写不敏感）。先看 panel 端再看
 * daemon 端，与 plugin.json 的取用顺序一致；两端都没有就返回空串——README.md 是可选的，
 * 不因为它缺席而让详情页报错。只认端的根目录：更深处的 readme.md 属于别的东西。
 */
export function readArtifactReadme(relativePath: string): string {
  const files = listArtifactFiles(relativePath)
  for (const side of PLUGIN_SIDES) {
    const prefix = `${side}/`
    const found = files.find(
      (file) =>
        file.path.startsWith(prefix) && file.path.slice(prefix.length).toLowerCase() === 'readme.md'
    )
    if (found) return readArtifactFile(relativePath, found.path).toString('utf8')
  }
  return ''
}

/**
 * 包里图标的完整路径。图标是插件级的（一个插件一个图标），所以先 panel 端再看 daemon 端，
 * 与 plugin.json、README.md 的取用顺序一致；两端都没有就返回 null。
 *
 * 和端、自述一样从产物目录推导，不存数据库字段——这个项目没有迁移机制，加列会让已有的库
 * 静默缺列。
 */
export function findArtifactIcon(relativePath: string): string | null {
  return derived(relativePath, 'icon', (files) => {
    for (const side of PLUGIN_SIDES) {
      const found = files.find((file) => file.path === `${side}/${ICON_FILE}`)
      if (found) return found.path
    }
    return null
  })
}

/**
 * 该版本包里有没有图标。列表卡片只需要知道有没有，不读字节——列表会为每个插件调用它。
 * 内容是否真的是 PNG 由下载时（`readArtifactIcon`）判定。
 */
export function hasArtifactIcon(relativePath: string): boolean {
  return findArtifactIcon(relativePath) !== null
}

/**
 * 图标本身，附带它的 `Content-Type`。内容不是 PNG 时返回 null，让插件页退回到默认图标，
 * 而不是把一个坏文件当图片发出去。类型以文件头为准，不采信任何客户端输入。
 */
export function readArtifactIcon(
  relativePath: string
): { data: Buffer; contentType: string } | null {
  const path = findArtifactIcon(relativePath)
  if (!path) return null

  const data = readArtifactFile(relativePath, path)
  if (data.length < PNG_SIGNATURE.length || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null
  }
  return { data, contentType: ICON_MIME }
}
