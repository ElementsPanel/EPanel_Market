import { toAuthUser } from '../../services/users'
import { createOAuthCode } from '../../utils/api-token'
import { appError } from '../../utils/errors'
import { resolveSessionUser } from '../../utils/session'

// 面板发起连接后，用户在插件市场登录后点「授权」时调用：为这个 state 绑定当前用户。
// 令牌不在这里签发——面板还在轮询，令牌由 /api/oauth/token 换出。

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先在插件市场登录')

  const body = (await readBody<{ state?: string }>(event)) ?? {}
  const state = typeof body.state === 'string' ? body.state.trim() : ''
  if (!STATE_PATTERN.test(state)) throw appError(400, 'VALIDATION_ERROR', '连接码无效')

  await createOAuthCode(user.id, state)

  return { ok: true, user: await toAuthUser(user) }
})
