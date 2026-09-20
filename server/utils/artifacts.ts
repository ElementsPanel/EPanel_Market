import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
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
