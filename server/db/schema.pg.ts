import { randomUUID } from 'node:crypto'
import { bigint, boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

// ⚠ 必须与 server/db/schema.sqlite.ts 保持同构（列名、语义、TS 类型一致）。
// 时间统一为 epoch 毫秒：pg 用 bigint({mode:'number'}) 映射到 JS number。
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_expires').on(table.expiresAt),
])

/** 一个插件的身份。可见性由 `visibility` 决定，审核状态在 plugin_versions 上。 */
export const plugins = pgTable('plugins', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  /** `listed` 上架 / `hidden` 下架 */
  visibility: text('visibility').notNull().default('listed'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, table => [
  uniqueIndex('uq_plugins_author_name').on(table.authorId, table.name),
  index('idx_plugins_author').on(table.authorId),
])

/** 每一次上传产生一个版本，`status` 为 pending 时即处于审核队列。 */
export const pluginVersions = pgTable('plugin_versions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  /** `pending` / `approved` / `rejected` */
  status: text('status').notNull().default('pending'),
  artifactPath: text('artifact_path').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  changelog: text('changelog').notNull().default(''),
  submittedAt: bigint('submitted_at', { mode: 'number' }).notNull(),
  reviewedAt: bigint('reviewed_at', { mode: 'number' }),
  reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  reviewNote: text('review_note'),
}, table => [
  uniqueIndex('uq_plugin_versions_plugin_version').on(table.pluginId, table.version),
  index('idx_plugin_versions_plugin').on(table.pluginId),
  index('idx_plugin_versions_status').on(table.status),
])

/** 面板发布插件用的长期令牌，库里只存哈希。 */
export const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull().default(''),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  lastUsedAt: bigint('last_used_at', { mode: 'number' }),
}, table => [
  index('idx_api_tokens_user').on(table.userId),
])

/** 市场登录后为面板签发的一次性连接码，由面板轮询换取令牌。 */
export const oauthCodes = pgTable('oauth_codes', {
  state: text('state').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  consumedAt: bigint('consumed_at', { mode: 'number' }),
}, table => [
  index('idx_oauth_codes_expires').on(table.expiresAt),
])
