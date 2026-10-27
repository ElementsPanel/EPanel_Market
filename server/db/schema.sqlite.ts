import { randomUUID } from 'node:crypto'
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ⚠ 必须与 server/db/schema.pg.ts 保持同构（列名、语义、TS 类型一致），
// 否则 client.ts 里的统一类型断言会掩盖字段不一致的问题。
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
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

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  previousEmail: text('previous_email').notNull(),
  purpose: text('purpose').notNull().default('registration'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
}, table => [
  index('idx_email_verification_user').on(table.userId),
  index('idx_email_verification_expires').on(table.expiresAt),
])

export const authCaptchaChallenges = sqliteTable('auth_captcha_challenges', {
  requestHash: text('request_hash').primaryKey(),
  emailHash: text('email_hash').notNull(),
  settingsHash: text('settings_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
}, table => [
  index('idx_auth_captcha_expires').on(table.expiresAt),
])

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

