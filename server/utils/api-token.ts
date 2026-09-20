import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { findUserById, type UserRow } from '../services/users'
import { appError } from './errors'
import { readConfig } from './config'
import { resolveSessionUser } from './session'

/**
 * 面板发布插件用的长期令牌。明文只在签发时返回一次，库里存带 pepper 的哈希，
 * 与会话令牌的做法一致。
 */
function hashToken(token: string): string {
  const { secret } = readConfig()
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

function issueToken(): string {
  return `epm_${randomBytes(32).toString('base64url')}`
}

export async function issueApiToken(userId: string, name = 'ElementsPanel'): Promise<string> {
  const { db, tables } = await getDb()
  const token = issueToken()

  await db.insert(tables.apiTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    name,
    createdAt: Date.now(),
  })

  return token
}

/** 读取 `Authorization: Bearer <token>` 对应的用户，令牌无效时返回 null。 */
export async function resolveApiUser(event: H3Event): Promise<UserRow | null> {
  const header = getHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null

  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.apiTokens)
    .where(eq(tables.apiTokens.tokenHash, hashToken(match[1].trim())))
    .limit(1)

  const token = rows[0]
  if (!token) return null

  await db
    .update(tables.apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(tables.apiTokens.id, token.id))

  return await findUserById(token.userId)
}

export async function requireApiUser(event: H3Event): Promise<UserRow> {
  const user = await resolveApiUser(event)
  if (!user) throw appError(401, 'TOKEN_INVALID', '发布令牌无效，请重新连接插件市场账号')
  return user
}

/**
 * 控制台既能用浏览器会话访问，也能用发布令牌访问，所以两种身份都认。
 * 管理员身份一律在服务端判定，前端的路由守卫只是提前跳转。
 */
export async function requireAdminUser(event: H3Event): Promise<UserRow> {
  const user = (await resolveSessionUser(event)) ?? (await resolveApiUser(event))
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')
  if (!user.isAdmin) throw appError(403, 'FORBIDDEN', '只有管理员可以执行该操作')
  return user
}

/** 面板连接流程里生成的一次性 state。 */
export async function createOAuthCode(userId: string, state: string): Promise<void> {
  const { db, tables } = await getDb()
  await db.insert(tables.oauthCodes).values({
    state,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
}

/**
 * 消费一个 state 并签发令牌。消费是原子的：并发的轮询只会有一个拿到令牌，
 * 所以同一个 state 不可能换出两个令牌。
 */
export async function consumeOAuthCode(state: string): Promise<string | null> {
  const { db, tables } = await getDb()
  const now = Date.now()

  const updated = await db
    .update(tables.oauthCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(tables.oauthCodes.state, state),
        isNull(tables.oauthCodes.consumedAt)
      )
    )
    .returning()

  const code = updated[0]
  if (!code) return null
  if (code.expiresAt < now) return null

  return await issueApiToken(code.userId)
}
