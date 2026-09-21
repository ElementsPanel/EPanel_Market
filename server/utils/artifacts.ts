import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { PLUGIN_SIDES, type PluginSide } from '../../shared/types/plugins'
import { getDataDir } from './paths'

/**
 * 上传产物的落盘位置。所有路径都必须由这里生成或由 `safeRelativePath` 校验，
 * 因为文件名来自 multipart 请求，是可信边界之外的数据。
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const ALLOWED_EXTENSIONS = new Set([
  '.json',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.vue',
  '.css',
  '.scss',
  '.md',
  '.txt',
])

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

export function listArtifactFiles(relativePath: string): Array<{ path: string; size: number }> {
  const root = artifactAbsolutePath(relativePath)
  if (!existsSync(root)) return []

  const files: Array<{ path: string; size: number }> = []
  const walk = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      // 软链指向产物目录之外，只按它本身是文件还是目录来处理会读错东西。
      if (item.isSymbolicLink()) continue
      const target = join(directory, item.name)
      if (item.isDirectory()) {
        walk(target)
        continue
      }
      files.push({
        path: relative(root, target).split(sep).join('/'),
        size: statSync(target).size,
      })
    }
  }
  walk(root)

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * 该版本产物里实际存在的端。首段路径就是端，所以从文件清单推导，不需要额外的
 * 数据库列——这个项目没有迁移机制，加列会让已有的库静默缺列。
 */
export function listArtifactSides(relativePath: string): PluginSide[] {
  const segments = new Set(listArtifactFiles(relativePath).map((file) => file.path.split('/')[0]))
  return PLUGIN_SIDES.filter((side) => segments.has(side))
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
 * 包里的自述。先看 panel 端再看 daemon 端，与 plugin.json 的取用顺序一致；两端都没有
 * 就返回空串——README.md 是可选的，不因为它缺席而让详情页报错。
 *
 * 清单已按路径排序，`<side>/README.md` 会排在 `<side>/backend/...` 之前，取第一个命中
 * 即可（大小写不敏感）。
 */
export function readArtifactReadme(relativePath: string): string {
  const files = listArtifactFiles(relativePath)
  for (const side of PLUGIN_SIDES) {
    const prefix = `${side}/`
    const found = files.find(
      (file) =>
        file.path.startsWith(prefix) &&
        file.path.slice(prefix.length).split('/').pop()?.toLowerCase() === 'readme.md'
    )
    if (found) return readArtifactFile(relativePath, found.path).toString('utf8')
  }
  return ''
}
