import type {
  PluginVersionStatus,
  PluginVersionSummary,
  PluginVisibility,
} from './plugins'

/** 审核队列里的一行：一个待审核版本 + 它所属的插件与作者。 */
export interface ConsoleReviewItem {
  versionId: string
  version: string
  status: PluginVersionStatus
  changelog: string
  fileCount: number
  sizeBytes: number
  submittedAt: number
  plugin: {
    id: string
    name: string
    displayName: string
    summary: string
    category: string
  }
  /**
   * 这个版本包里 plugin.json 描述的插件信息。公开展示的信息只在版本通过审核时才换成
   * 最新已通过版本的这一份，所以审核时要看得到它改了什么。
   */
  submitted: {
    displayName: string
    summary: string
    category: string
    /** 与当前公开展示的信息不同的字段。 */
    changes: ReviewMetadataField[]
  }
  author: {
    id: string
    displayName: string
    email: string
  }
}

/** 审核时关心的插件信息字段。 */
export type ReviewMetadataField = 'displayName' | 'summary' | 'description' | 'category'

/** 控制台插件管理里的一行。 */
export interface ConsolePluginItem {
  id: string
  name: string
  displayName: string
  category: string
  visibility: PluginVisibility
  author: {
    id: string
    displayName: string
    email: string
  }
  /** 各状态版本数量，供表格显示「3 个版本 / 1 个待审」。 */
  counts: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  createdAt: number
  updatedAt: number
  versions: PluginVersionSummary[]
}

export interface ConsoleUserItem {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: number
  pluginCount: number
}
