import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { findUserById, type UserRow } from '../services/users'
import type { ApiTokenSummary } from '../../shared/types/auth'
import { appError } from './errors'
import { readConfig } from './config'
import { resolveSessionUser } from './session'

/**
 * 发布脚本（ElementsPanel 的 `npm run publish-plugin`）用的长期令牌。明文只在签发时
 * 返回一次，库里存带 pepper 的哈希，与会话令牌的做法一致。令牌只能用来上传插件、查看
 * 自己的提交记录与吊销它自己，不能做管理操作；账号本人可以在「编辑资料」页随时吊销。
 */
function hashToken(token: string): string {
  const { secret } = readConfig()
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

function issueToken(): string {
  return `epm_${randomBytes(32).toString('base64url')}`
}

export async function issueApiToken(userId: string, name = 'ElementsPanel 发布脚本'): Promise<string> {
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

/** 请求头 `Authorization: Bearer <token>` 对应的令牌记录，没有或无效时返回 null。 */
async function findPresentedToken(event: H3Event) {
  const header = getHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null

  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.apiTokens)
    .where(eq(tables.apiTokens.tokenHash, hashToken(match[1].trim())))
    .limit(1)
  return rows[0] ?? null
}

/** 读取 `Authorization: Bearer <token>` 对应的用户，令牌无效时返回 null。 */
export async function resolveApiUser(event: H3Event): Promise<UserRow | null> {
  const token = await findPresentedToken(event)
  if (!token) return null

  const { db, tables } = await getDb()
  await db
    .update(tables.apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(tables.apiTokens.id, token.id))

  return await findUserById(token.userId)
}

export async function requireApiUser(event: H3Event): Promise<UserRow> {
  const user = await resolveApiUser(event)
  if (!user) throw appError(401, 'TOKEN_INVALID', '发布令牌无效或已被撤销，请重新连接插件市场账号')
  return user
}

/**
 * 控制台只认浏览器会话。发布令牌是给发布脚本上传插件用的，存在开发者本机的文件里；
 * 管理员的令牌要是也能做管理操作，一份泄露的令牌文件就等于交出整个市场。
 * 管理员身份一律在服务端判定，前端的路由守卫只是提前跳转。
 */
export async function requireAdminUser(event: H3Event): Promise<UserRow> {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')
  if (!user.isAdmin) throw appError(403, 'FORBIDDEN', '只有管理员可以执行该操作')
  return user
}

/** 账号名下的全部发布令牌，新签发的在前。 */
export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  const { db, tables } = await getDb()
  const rows = await db
    .select()
    .from(tables.apiTokens)
    .where(eq(tables.apiTokens.userId, userId))
    .orderBy(desc(tables.apiTokens.createdAt))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
  }))
}

/** 吊销账号名下的一个令牌；不存在或不属于这个账号时返回 false。 */
export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const { db, tables } = await getDb()
  const removed = await db
    .delete(tables.apiTokens)
    .where(and(eq(tables.apiTokens.id, tokenId), eq(tables.apiTokens.userId, userId)))
    .returning()
  return removed.length > 0
}

/** 吊销请求头里出示的这个令牌（发布脚本的 `--disconnect`）；令牌无效时返回 false。 */
export async function revokePresentedToken(event: H3Event): Promise<boolean> {
  const token = await findPresentedToken(event)
  if (!token) return false

  const { db, tables } = await getDb()
  await db.delete(tables.apiTokens).where(eq(tables.apiTokens.id, token.id))
  return true
}

const OAUTH_CODE_TTL_MS = 5 * 60 * 1000

/**
 * 发布脚本连接流程里生成的一次性 state，由已登录的用户在授权页绑定到自己的账号。
 *
 * 同一个人重复授权同一个 state（刷新页面后再点、连点）在令牌被取走之前什么也不改。已经
 * 换出令牌、已过期，或者别人绑定过的 state 都要拒绝：这时再说一次「授权成功」，用户会守着
 * 一个永远等不到令牌的终端。发布脚本重新运行就会换一个新的 state。
 */
export async function createOAuthCode(userId: string, state: string): Promise<void> {
  const { db, tables } = await getDb()
  const now = Date.now()
  const inserted = await db
    .insert(tables.oauthCodes)
    .values({ state, userId, createdAt: now, expiresAt: now + OAUTH_CODE_TTL_MS })
    .onConflictDoNothing()
    .returning()
  if (inserted.length) return

  const rows = await db
    .select()
    .from(tables.oauthCodes)
    .where(eq(tables.oauthCodes.state, state))
    .limit(1)
  const code = rows[0]
  if (!code || code.userId !== userId) {
    throw appError(409, 'CONFLICT', '这个连接码已被其他账号使用，请在终端重新运行发布命令')
  }
  if (code.consumedAt) {
    throw appError(
      409,
      'CONFLICT',
      '这个连接码已经用过了，发布脚本已经拿到令牌。如果终端仍在等待，请重新运行发布命令'
    )
  }
  if (code.expiresAt < now) {
    throw appError(409, 'CONFLICT', '连接码已过期，请在终端重新运行发布命令')
  }
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
