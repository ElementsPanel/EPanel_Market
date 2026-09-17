import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// 项目根判定标记：构建产物目录里不会存在这些文件
const ROOT_MARKERS = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs', 'nuxt.config.cjs'] as const
// 构建/开发产物目录：任何候选路径只要含这些段就不承认是项目根，
// 保证 data 目录永远落在 .output 之外
const FORBIDDEN_SEGMENTS = new Set(['.output', '.nuxt', '.nitro', 'dist'])

function segments(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean)
}

function containsForbidden(p: string): boolean {
  return segments(p).some(segment => FORBIDDEN_SEGMENTS.has(segment))
}

function hasRootMarker(dir: string): boolean {
  return ROOT_MARKERS.some(marker => existsSync(join(dir, marker)))
}

function stripFromOutput(p: string): string | null {
  const parts = segments(p)
  const index = parts.indexOf('.output')
  if (index <= 0) return null
  return sep + parts.slice(0, index).join(sep)
}

/** 向上寻找项目根。导出为纯函数，便于用虚构起点做校验。 */
export function resolveRootFrom(startDir: string): string {
  let current = resolve(startDir)
  for (;;) {
    if (!containsForbidden(current) && hasRootMarker(current)) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  const stripped = stripFromOutput(resolve(startDir))
  if (stripped && !containsForbidden(stripped)) return stripped

  throw new Error(`[paths] 无法定位项目根目录（起点：${startDir}），请以项目根目录为工作目录启动应用。`)
}

let cachedRoot: string | null = null

export function getProjectRoot(): string {
  if (cachedRoot) return cachedRoot

  let root: string
  try {
    root = resolveRootFrom(dirname(fileURLToPath(import.meta.url)))
  } catch {
    root = resolveRootFrom(process.cwd())
  }

  cachedRoot = root
  return root
}

export function getDataDir(): string {
  return join(getProjectRoot(), 'data')
}

/** 仅在真正要落盘时调用 */
export function ensureDataDir(): string {
  const dir = getDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 把配置里的 sqlite 文件路径解析为绝对路径（相对路径按项目根解析），
 * 并拒绝逃逸出项目根的路径。
 */
export function resolveDataFile(relOrAbs: string): string {
  const root = getProjectRoot()
  const abs = isAbsolute(relOrAbs) ? resolve(relOrAbs) : join(root, relOrAbs)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`[paths] 数据文件路径必须位于项目根目录之内：${abs}`)
  }
  const parent = dirname(abs)
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  return abs
}

export function getConfigPath(): string {
  return join(getDataDir(), 'app-config.json')
}
