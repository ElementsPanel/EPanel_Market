import { randomUUID } from 'node:crypto'
import { bigint, boolean, bytea, index, pgTable, text } from 'drizzle-orm/pg-core'

// ⚠ 必须与 server/db/schema.sqlite.ts 保持同构（列名、语义、TS 类型一致）。
// 时间统一为 epoch 毫秒：pg 用 bigint({mode:'number'}) 映射到 JS number。
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

/** 头像单独存放：二进制不跟着用户行走，也避免给已存在的 users 表加列。 */
export const userAvatars = pgTable('user_avatars', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  data: bytea('data').notNull(),
  /** 内容的 sha256，前端用它做缓存参数，接口用它做 ETag */
  version: text('version').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
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

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  previousEmail: text('previous_email').notNull(),
  purpose: text('purpose').notNull().default('registration'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  usedAt: bigint('used_at', { mode: 'number' }),
}, table => [
  index('idx_email_verification_user').on(table.userId),
  index('idx_email_verification_expires').on(table.expiresAt),
])

export const authCaptchaChallenges = pgTable('auth_captcha_challenges', {
  requestHash: text('request_hash').primaryKey(),
  emailHash: text('email_hash').notNull(),
  settingsHash: text('settings_hash').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  consumedAt: bigint('consumed_at', { mode: 'number' }),
}, table => [
  index('idx_auth_captcha_expires').on(table.expiresAt),
])

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

