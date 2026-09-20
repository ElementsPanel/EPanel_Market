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
    category: string
  }
  author: {
    id: string
    displayName: string
    email: string
  }
}

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
