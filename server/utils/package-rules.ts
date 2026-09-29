import { posix } from 'node:path'
import {
  PLUGIN_SIDES,
  type PluginCompatibility,
  type PluginCompatibilityMap,
  type PluginSide,
} from '../../shared/types/plugins'
import { appError } from './errors'

/**
 * 上传包的内容规则。审核通过的包必须是面板和 daemon 装得上的包，所以这里照搬它们安装时
 * 的检查——ElementsPanel 的 `common/src/plugin_package.ts`（`writePluginPackage` 与清单
 * 入口检查）、面板 market 插件的 `splitPackagePath`、daemon config 插件的
 * `plugin/install`——在上架前就拒绝，而不是等到安装时才报「非法路径」「空包」。
 *
 * 扩展名白名单是 ElementsPanel `PLUGIN_PACKAGE_EXTENSIONS` 的副本，发布脚本
 * （`scripts/publish-plugin.mjs`）里也有一份，三处要一起改。
 */
export const PLUGIN_PACKAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.json',
  '.js',
  '.cjs',
  '.mjs',
  '.svg',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.wasm',
  '.css',
  '.scss',
  '.md',
  '.txt',
])

/** 包里唯一允许的 PNG：插件图标，放在某一端的根目录。 */
export const PLUGIN_ICON_FILE = 'icon.png'
export const MAX_PLUGIN_ICON_BYTES = 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 面板安装时给目录打的标记，包里不能自带一份去冒充。 */
const INSTALL_MARKER = '.market-install.json'

/** 清单里指向入口文件的字段，与面板安装时检查的一致。 */
const ENTRY_FIELDS = ['panel', 'daemon', 'backend', 'main', 'entry', 'frontend', 'ui'] as const

/** Windows 设备名做不了文件名，面板与 daemon 不分平台一律拒绝。 */
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export interface PackageEntry {
  /** 包内路径，用 `/` 分隔，首段是端。 */
  path: string
  data: Buffer
}

export interface CheckedPackage {
  sides: PluginSide[]
  /** 描述整包的清单：有 panel 端取 panel 端的，否则取 daemon 端的。 */
  manifest: Record<string, unknown>
  compatibility: PluginCompatibilityMap
}

/**
 * `elements` → 兼容性声明。没有声明返回 undefined（旧包），声明了但格式不对返回 null。
 * 市场只校验形状（版本号是正整数），具体支持哪个版本由面板决定。
 */
export function parseCompatibility(elements: unknown): PluginCompatibility | null | undefined {
  if (elements === undefined) return undefined
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) return null
  const { api, sdk } = elements as { api?: unknown, sdk?: unknown }
  const isVersion = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1
  if (!isVersion(api) || (sdk !== undefined && !isVersion(sdk))) return null
  return sdk === undefined ? { api } : { api, sdk }
}

function invalid(message: string): never {
  throw appError(400, 'VALIDATION_ERROR', message)
}

/** 一个路径段在面板与 daemon 上都能安全落盘，与 `writePluginPackage` 的检查一致。 */
function isSafeSegment(segment: string): boolean {
  return (
    segment.length > 0
    && segment !== '.'
    && segment !== '..'
    && !/[\x00-\x1f:<>"|?*\\]/.test(segment)
    && !/[. ]$/.test(segment)
    && !DEVICE_NAME.test(segment)
  )
}

function readManifest(side: PluginSide, files: Map<string, PackageEntry>): Record<string, unknown> {
  const entry = files.get(`${side}/plugin.json`)
  if (!entry) invalid(`插件包缺少 ${side}/plugin.json：每一端都要带自己的清单`)
  let value: unknown
  try {
    value = JSON.parse(entry.data.toString('utf8'))
  } catch {
    invalid(`${side}/plugin.json 不是合法的 JSON`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${side}/plugin.json 必须是一个 JSON 对象`)
  }
  return value as Record<string, unknown>
}

/** 检查整个上传包，通过时给出它的端、描述整包的清单与各端的兼容性声明。 */
export function checkPluginPackage(entries: PackageEntry[]): CheckedPackage {
  const bySide = new Map<PluginSide, Map<string, PackageEntry>>()
  const seen = new Set<string>()

  for (const entry of entries) {
    const segments = entry.path.split('/')
    const side = segments[0] as PluginSide
    if (segments.length < 2 || !PLUGIN_SIDES.includes(side)) {
      invalid(`插件包里的文件必须放在 panel/ 或 daemon/ 目录下：${entry.path}`)
    }
    const rest = segments.slice(1)
    if (!rest.every(isSafeSegment)) invalid(`插件包里有面板无法安装的文件路径：${entry.path}`)

    const relative = rest.join('/')
    if (relative.toLowerCase() === INSTALL_MARKER) {
      invalid(`插件包里不能包含 ${INSTALL_MARKER}：${entry.path}`)
    }
    // 面板与 daemon 可能装在不区分大小写的文件系统上，只差大小写的两个文件会互相覆盖
    const key = entry.path.toLowerCase()
    if (seen.has(key)) invalid(`插件包里有重复的文件：${entry.path}`)
    seen.add(key)

    if (relative === PLUGIN_ICON_FILE) {
      const { data } = entry
      if (
        data.length > MAX_PLUGIN_ICON_BYTES
        || data.length < PNG_SIGNATURE.length
        || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      ) {
        invalid(`${entry.path} 必须是不超过 1 MiB 的 PNG 图片`)
      }
    } else if (!PLUGIN_PACKAGE_EXTENSIONS.has(posix.extname(relative).toLowerCase())) {
      invalid(`插件包里有不允许的文件类型：${entry.path}（PNG 只能是某一端根目录的 icon.png）`)
    }

    const files = bySide.get(side) ?? new Map<string, PackageEntry>()
    files.set(entry.path, entry)
    bySide.set(side, files)
  }

  const sides = PLUGIN_SIDES.filter(side => bySide.has(side))
  if (!sides.length) invalid('插件包里没有文件')

  const manifests = new Map<PluginSide, Record<string, unknown>>()
  const compatibility: PluginCompatibilityMap = {}
  for (const side of sides) {
    const files = bySide.get(side)!
    const manifest = readManifest(side, files)

    const contract = parseCompatibility(manifest.elements)
    if (contract === null) invalid(`${side}/plugin.json 的 elements 不合法：api 与 sdk 须为正整数`)
    if (contract) compatibility[side] = contract

    // 清单声明的入口必须是这一端包里的文件：面板安装时会逐个检查，缺了就装不上
    for (const field of ENTRY_FIELDS) {
      const value = manifest[field]
      if (typeof value !== 'string') continue
      if (!value || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.includes('\\')) {
        invalid(`${side}/plugin.json 的 ${field} 必须是以 / 分隔的相对路径`)
      }
      const target = posix.normalize(posix.join(side, value))
      if (!target.startsWith(`${side}/`) || !files.has(target)) {
        invalid(`${side}/plugin.json 声明的 ${field}「${value}」不在包里`)
      }
    }
    manifests.set(side, manifest)
  }

  // A normal two-sided plugin keeps all market metadata in the panel manifest;
  // its daemon manifest may contain only the runtime entry. A daemon-only
  // plugin necessarily falls back to its own manifest.
  const manifest = manifests.get('panel') ?? manifests.get('daemon')
  if (!manifest) invalid('插件包里没有可读取的 plugin.json')
  return { sides, manifest, compatibility }
}
