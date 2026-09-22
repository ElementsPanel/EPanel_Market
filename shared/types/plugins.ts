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
  /** 最新已通过版本，尚无通过版本时为 undefined。 */
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
  /** 版本历史，新在前。公开详情仅含已通过版本，作者视图包含全部状态。 */
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

/** 面板上传时随 multipart 一起提交的插件信息。 */
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
