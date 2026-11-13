import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ⚠ 必须与 server/db/schema.pg.ts 保持同构（列名、语义、TS 类型一致），
// 否则 client.ts 里的统一类型断言会掩盖字段不一致的问题。

/**
 * npm 插件索引。市场只缓存 registry 元数据，不保存插件包文件；`name` 是 npm 包名，
 * `id` 是插件标识，也是市场页面与面板安装接口使用的键。
 */
export const npmPlugins = sqliteTable('npm_plugins', {
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
  publishedAt: integer('published_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
  syncedAt: integer('synced_at').notNull().default(0),
}, table => [
  index('idx_npm_plugins_updated').on(table.updatedAt),
])

/** npm 包里 icon.png 的缓存。图标为空的行表示该版本已检查过但没有图标，无需再下载。 */
export const npmPluginIcons = sqliteTable('npm_plugin_icons', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  contentHash: text('content_hash').notNull().default(''),
  data: blob('data', { mode: 'buffer' }),
  updatedAt: integer('updated_at').notNull().default(0),
})
