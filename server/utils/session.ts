import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { deleteCookie, getCookie, getRequestURL, setCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { readConfig } from './config'
import type { UserRow } from '../services/users'
import { findUserById } from '../services/users'

const COOKIE_NAME = 'epanel_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 库里只存 token 的哈希，明文 token 仅存在于用户浏览器的 Cookie 中 */
function hashToken(token: string): string {
  const { secret } = readConfig()
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

export function issueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestURL(event).protocol === 'https:',
    maxAge: Math.floor(TTL_MS / 1000),
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function readSessionToken(event: H3Event): string | null {
  return getCookie(event, COOKIE_NAME) ?? null
}

export async function createSession(userId: string): Promise<string> {
  const { db, tables } = await getDb()
  const token = issueToken()
  const now = Date.now()

  await db.insert(tables.sessions).values({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: now + TTL_MS,
  })

  return token
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = readSessionToken(event)
  if (!token) return

  const { db, tables } = await getDb()
  await db.delete(tables.sessions).where(eq(tables.sessions.tokenHash, hashToken(token)))
  clearSessionCookie(event)
}

/** 读取当前请求对应的用户，过期会话会被顺带清理 */
export async function resolveSessionUser(event: H3Event): Promise<UserRow | null> {
  const token = readSessionToken(event)
  if (!token) return null

  const tokenHash = hashToken(token)
  const { db, tables } = await getDb()

  const rows = await db.select().from(tables.sessions).where(eq(tables.sessions.tokenHash, tokenHash)).limit(1)
  const session = rows[0]
  if (!session) return null

  if (session.expiresAt < Date.now()) {
    await db.delete(tables.sessions).where(eq(tables.sessions.id, session.id))
    return null
  }

  return await findUserById(session.userId)
}
