/** 插件可见性：`listed` 上架，`hidden` 被管理员下架。 */
export type PluginVisibility = 'listed' | 'hidden'

/** 一个版本的审核状态，`pending` 即处于审核队列。 */
export type PluginVersionStatus = 'pending' | 'approved' | 'rejected'

/**
 * 插件的端：产物包里首段路径就是它（`panel/plugin.json`、`daemon/plugin.json`）。
 * 两端都在就是双端插件。
 */
export type PluginSide = 'panel' | 'daemon'

/** 固定顺序，前端展示与后端推导都用它，避免顺序随文件系统变化。 */
export const PLUGIN_SIDES = ['panel', 'daemon'] as const

/**
 * 一端声明的宿主兼容性，即 `<side>/plugin.json` 里的 `elements`：`api` 是宿主插件 API
 * 版本，`sdk` 是浏览器 SDK 版本（只有带前端的一端才有）。
 */
export interface PluginCompatibility {
  api: number
  sdk?: number
}

/** 按端列出的兼容性；没有声明 `elements` 的端（旧包）不出现在这里。 */
export type PluginCompatibilityMap = Partial<Record<PluginSide, PluginCompatibility>>

export interface PluginVersionSummary {
  id: string
  version: string
  status: PluginVersionStatus
  changelog: string
  fileCount: number
  sizeBytes: number
  submittedAt: number
  reviewedAt?: number
  reviewNote?: string
  /** 该版本的产物里实际存在的端。 */
  sides: PluginSide[]
  /** 该版本各端声明的兼容性，面板据此在安装前提示「需要其他版本的宿主」。 */
  compatibility: PluginCompatibilityMap
}

/** 列表卡片用的插件摘要。版本取自最新的已通过版本。 */
export interface PluginSummary {
  id: string
  name: string
  displayName: string
  summary: string
  category: string
  visibility: PluginVisibility
  author: {
    id: string
    displayName: string
  }
  /** 最新已通过版本（按版本号），尚无通过版本时为 undefined。 */
  latestVersion?: PluginVersionSummary
  /** 最新已通过版本的端，供卡片直接展示，不必往下钻。 */
  sides: PluginSide[]
  /**
   * 最新已通过版本的包里有没有 `icon.png`。与 `sides` 一样从产物目录推导，没有对应
   * 数据库列；为 true 时 `GET /api/plugins/:id/icon` 才有图。
   */
  hasIcon: boolean
  createdAt: number
  updatedAt: number
}

export interface PluginDetail extends PluginSummary {
  description: string
  /** 版本历史。公开详情仅含已通过版本、按版本号新在前；作者视图包含全部状态、按提交时间新在前。 */
  versions: PluginVersionSummary[]
}

/** 公开详情的选中版本始终已通过审核，默认选择最新版本。 */
export interface PublishedPluginDetail extends PluginDetail {
  selectedVersion: PluginVersionSummary
  /** 选中版本包里 `<side>/README.md` 的原文；包里没有自述时是空串。 */
  readme: string
  /** 上者渲染并净化后的 HTML；空自述同样是空串。 */
  readmeHtml: string
}

export interface PluginListResult {
  items: PluginSummary[]
  /** 当前筛选结果里出现过的分类，供首页的筛选下拉框使用。 */
  categories: string[]
  total: number
  page: number
  pageSize: number
}

/**
 * 从上传包里描述整包的 plugin.json 读出的插件信息：先 panel 端，仅在 daemon-only
 * 插件中回退到 daemon 端。双端插件的 daemon 清单可以只有运行入口。
 */
export interface PluginUploadManifest {
  name: string
  displayName: string
  version: string
  summary?: string
  description?: string
  category?: string
  changelog?: string
}

export interface PluginUploadResult {
  pluginId: string
  versionId: string
  status: PluginVersionStatus
}

/** `GET /api/plugins/:id/files` 里的一个文件：面板按 `path` 逐个下载，并用大小与摘要校验。 */
export interface PluginFileEntry {
  path: string
  size: number
  sha256: string
}

/** `GET /api/plugins/:id/files`：面板安装前取的文件清单。 */
export interface PluginFilesResult {
  pluginId: string
  name: string
  displayName: string
  versionId: string
  version: string
  compatibility: PluginCompatibilityMap
  files: PluginFileEntry[]
}
