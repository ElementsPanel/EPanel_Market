import { randomUUID } from 'node:crypto'
import { bigint, boolean, index, pgTable, text } from 'drizzle-orm/pg-core'

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
