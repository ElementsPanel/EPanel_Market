import { createHash, randomBytes } from 'node:crypto'
import { and, eq, exists, gt, isNull, lt } from 'drizzle-orm'
import { getDb } from '../db/client'
import type { UserRow } from './users'
import { readConfig } from '../utils/config'
import { sendVerificationEmail } from '../utils/email'
import { appError } from '../utils/errors'
import { requireMailSettings } from '../utils/settings'

const TTL_MS = 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(`${readConfig().secret}:verify-email:${token}`).digest('hex')
}

export async function sendUserVerification(user: UserRow, newEmail?: string): Promise<void> {
  const settings = requireMailSettings()
  const { db, tables } = await getDb()
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const now = Date.now()

  await db.delete(tables.emailVerificationTokens).where(lt(tables.emailVerificationTokens.expiresAt, now - TTL_MS))
  await db.insert(tables.emailVerificationTokens).values({
    tokenHash,
    userId: user.id,
    email: newEmail ?? user.email,
    previousEmail: user.email,
    purpose: newEmail ? 'email_change' : 'registration',
    createdAt: now,
    expiresAt: now + TTL_MS,
  })

  try {
    await sendVerificationEmail({ ...user, email: newEmail ?? user.email }, token, settings, Boolean(newEmail))
  } catch (error) {
    await db.delete(tables.emailVerificationTokens).where(eq(tables.emailVerificationTokens.tokenHash, tokenHash)).catch(() => undefined)
    throw error
  }
}

export async function clearEmailVerificationTokens(userId: string): Promise<void> {
  const { db, tables } = await getDb()
  await db.delete(tables.emailVerificationTokens).where(eq(tables.emailVerificationTokens.userId, userId))
}

export async function verifyEmailToken(value: unknown): Promise<{ userId: string; changingEmail: boolean }> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw appError(400, 'TOKEN_INVALID', '验证链接无效或已被使用，请重新发送验证邮件')
  }
  const { db, tables } = await getDb()
  const tokens = tables.emailVerificationTokens
  const tokenHash = hashToken(value)
  const [existing] = await db.select().from(tokens).where(eq(tokens.tokenHash, tokenHash)).limit(1)
  if (!existing || existing.usedAt !== null || !['registration', 'email_change'].includes(existing.purpose)) {
    throw appError(400, 'TOKEN_INVALID', '验证链接无效或已被使用，请重新发送验证邮件')
  }
  const now = Date.now()
  if (existing.expiresAt <= now) throw appError(410, 'TOKEN_EXPIRED', '验证链接已过期，请重新发送验证邮件')

  const [claimed] = await db.update(tokens).set({ usedAt: now }).where(and(
    eq(tokens.tokenHash, tokenHash), isNull(tokens.usedAt), gt(tokens.expiresAt, now),
  )).returning()
  if (!claimed) throw appError(400, 'TOKEN_INVALID', '验证链接无效或已被使用，请重新发送验证邮件')

  const changingEmail = claimed.purpose === 'email_change'
  if (changingEmail) {
    const [taken] = await db.select().from(tables.users).where(eq(tables.users.email, claimed.email)).limit(1)
    if (taken && taken.id !== claimed.userId) throw appError(409, 'EMAIL_TAKEN', '该邮箱已被其他账户使用，请重新选择邮箱')
  }

  let updated: UserRow | undefined
  try {
    const rows = await db.update(tables.users).set({ email: claimed.email, emailVerified: true }).where(and(
      eq(tables.users.id, claimed.userId),
      eq(tables.users.email, claimed.previousEmail),
      eq(tables.users.emailVerified, changingEmail),
      // 改密码或另一个验证请求可能已删除令牌，不能再凭之前读到的值修改账户。
      exists(db.select({ tokenHash: tokens.tokenHash }).from(tokens).where(eq(tokens.tokenHash, tokenHash))),
    )).returning()
    updated = rows[0]
  } catch (error) {
    // 查重与更新之间仍可能有人抢先使用邮箱，转换成可操作的提示。
    if (changingEmail) {
      const [taken] = await db.select().from(tables.users).where(eq(tables.users.email, claimed.email)).limit(1)
      if (taken && taken.id !== claimed.userId) throw appError(409, 'EMAIL_TAKEN', '该邮箱已被其他账户使用，请重新选择邮箱')
    }
    throw error
  }
  if (!updated) throw appError(400, 'TOKEN_INVALID', '账户信息已变更或邮箱已验证，请重新登录')
  await clearEmailVerificationTokens(updated.id)
  return { userId: updated.id, changingEmail }
}
