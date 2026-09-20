/** 插件可见性：`listed` 上架，`hidden` 被管理员下架。 */
export type PluginVisibility = 'listed' | 'hidden'

/** 一个版本的审核状态，`pending` 即处于审核队列。 */
export type PluginVersionStatus = 'pending' | 'approved' | 'rejected'

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
  createdAt: number
  updatedAt: number
}

export interface PluginDetail extends PluginSummary {
  description: string
  /** 版本历史，新在前。仅详情页会带上全部状态。 */
  versions: PluginVersionSummary[]
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
