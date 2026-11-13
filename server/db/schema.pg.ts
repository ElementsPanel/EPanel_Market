import { bigint, bytea, index, pgTable, text } from 'drizzle-orm/pg-core'

// ⚠ 必须与 server/db/schema.sqlite.ts 保持同构（列名、语义、TS 类型一致）。
// 时间统一为 epoch 毫秒：pg 用 bigint({mode:'number'}) 映射到 JS number。

/** npm 插件索引。市场只缓存 registry 元数据，不保存插件包文件。 */
export const npmPlugins = pgTable('npm_plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  keywords: text('keywords').notNull().default('[]'),
  authorName: text('author_name').notNull().default(''),
  repository: text('repository').notNull().default(''),
  homepage: text('homepage').notNull().default(''),
  license: text('license').notNull().default(''),
  latestVersion: text('latest_version').notNull(),
  /** JSON 数组，内容与 PluginVersionSummary 同构。 */
  versions: text('versions').notNull().default('[]'),
  readme: text('readme').notNull().default(''),
  sides: text('sides').notNull().default('[]'),
  publishedAt: bigint('published_at', { mode: 'number' }).notNull().default(0),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().default(0),
  syncedAt: bigint('synced_at', { mode: 'number' }).notNull().default(0),
}, table => [
  index('idx_npm_plugins_updated').on(table.updatedAt),
])

/** npm 包里 icon.png 的缓存。图标为空的行表示该版本已检查过但没有图标，无需再下载。 */
export const npmPluginIcons = pgTable('npm_plugin_icons', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  contentHash: text('content_hash').notNull().default(''),
  data: bytea('data'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().default(0),
})
