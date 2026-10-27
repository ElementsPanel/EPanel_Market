/** 插件的端：npm 包的 `elementspanel.panel` / `elementspanel.daemon` 声明它。 */
export type PluginSide = 'panel' | 'daemon'

/** 固定顺序，前端展示与后端推导都用它，避免顺序随文件系统变化。 */
export const PLUGIN_SIDES = ['panel', 'daemon'] as const

/**
 * npm 索引里的一个版本。市场不再托管插件包，所以没有审核状态、文件数与文件清单；
 * 版本号、发布时间与端信息全部来自 npm registry。
 */
export interface PluginVersionSummary {
  /** `包名@版本号`，作为版本行在前端的唯一键。 */
  id: string
  version: string
  /** 兼容旧市场的字段：npm 包直接视为已通过。 */
  status: 'approved'
  changelog: string
  fileCount: number
  sizeBytes: number
  submittedAt: number
  /** 该版本声明的端。 */
  sides: PluginSide[]
}

/** 列表卡片用的插件摘要。 */
export interface PluginSummary {
  /** 插件标识，即 npm 包 `elementspanel.id` 或从包名推导出的 id。 */
  id: string
  /** npm 包名，面板安装时写入项目依赖的就是它。 */
  name: string
  displayName: string
  summary: string
  category: string
  author: {
    id: string
    displayName: string
  }
  /** npm `dist-tags.latest` 指向的版本。 */
  latestVersion?: PluginVersionSummary
  /** 最新版本声明的端，供卡片直接展示。 */
  sides: PluginSide[]
  /** npm 索引不托管图标，页面统一回退到默认图标。 */
  hasIcon: boolean
  createdAt: number
  updatedAt: number
}

export interface PluginDetail extends PluginSummary {
  description: string
  /** 版本历史，按版本号从新到旧。 */
  versions: PluginVersionSummary[]
}

/** 公开详情的选中版本，默认最新版本。 */
export interface PublishedPluginDetail extends PluginDetail {
  selectedVersion: PluginVersionSummary
  /** npm 包的 README 原文。 */
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
