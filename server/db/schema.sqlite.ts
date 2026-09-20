import { randomUUID } from 'node:crypto'
import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ⚠ 必须与 server/db/schema.pg.ts 保持同构（列名、语义、TS 类型一致），
// 否则 client.ts 里的统一类型断言会掩盖字段不一致的问题。
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

/**
 * 头像单独存放：二进制不跟着用户行走，也避免给已存在的 users 表加列。
 * buffer 模式只接受 Buffer/Uint8Array，写入前别转字符串（会被当 hex 解析）。
 */
export const userAvatars = sqliteTable('user_avatars', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  /** 内容的 sha256，前端用它做缓存参数，接口用它做 ETag */
  version: text('version').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_expires').on(table.expiresAt),
])

/** 一个插件的身份。可见性由 `visibility` 决定，审核状态在 plugin_versions 上。 */
export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  /** `listed` 上架 / `hidden` 下架 */
  visibility: text('visibility').notNull().default('listed'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  uniqueIndex('uq_plugins_author_name').on(table.authorId, table.name),
  index('idx_plugins_author').on(table.authorId),
])

/** 每一次上传产生一个版本，`status` 为 pending 时即处于审核队列。 */
export const pluginVersions = sqliteTable('plugin_versions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  /** `pending` / `approved` / `rejected` */
  status: text('status').notNull().default('pending'),
  artifactPath: text('artifact_path').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  sizeBytes: integer('size_bytes').notNull().default(0),
  changelog: text('changelog').notNull().default(''),
  submittedAt: integer('submitted_at').notNull(),
  reviewedAt: integer('reviewed_at'),
  reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  reviewNote: text('review_note'),
}, table => [
  uniqueIndex('uq_plugin_versions_plugin_version').on(table.pluginId, table.version),
  index('idx_plugin_versions_plugin').on(table.pluginId),
  index('idx_plugin_versions_status').on(table.status),
])

/** 面板发布插件用的长期令牌，库里只存哈希。 */
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
}, table => [
  index('idx_api_tokens_user').on(table.userId),
])

/** 市场登录后为面板签发的一次性连接码，由面板轮询换取令牌。 */
export const oauthCodes = sqliteTable('oauth_codes', {
  state: text('state').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
}, table => [
  index('idx_oauth_codes_expires').on(table.expiresAt),
])
