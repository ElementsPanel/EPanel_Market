import { randomUUID } from 'node:crypto'
import { eq, type InferSelectModel } from 'drizzle-orm'
import type { AuthUser } from '../../shared/types/auth'
import { getDb } from '../db/client'
import type { AppTables } from '../db/schema'
import { appError } from '../utils/errors'
import { hashPassword } from '../utils/password'

export type UserRow = InferSelectModel<AppTables['users']>

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { db, tables } = await getDb()
  const rows = await db.select().from(tables.users).where(eq(tables.users.email, normalizeEmail(email))).limit(1)
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { db, tables } = await getDb()
  const rows = await db.select().from(tables.users).where(eq(tables.users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createUser(input: {
  email: string
  password: string
  displayName?: string
  isAdmin?: boolean
}): Promise<UserRow> {
  const { db, tables } = await getDb()
  const email = normalizeEmail(input.email)

  const rows = await db.insert(tables.users).values({
    id: randomUUID(),
    email,
    displayName: input.displayName?.trim() || email.split('@')[0] || email,
    passwordHash: await hashPassword(input.password),
    isAdmin: input.isAdmin ?? false,
    createdAt: Date.now(),
  }).returning()

  const row = rows[0]
  if (!row) throw appError(500, 'VALIDATION_ERROR', '创建用户失败，请重试')
  return row
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
  }
}
