import { verifyEmailToken } from '../../services/email-verification'
import { enforceRateLimit } from '../../utils/rate-limit'
import { destroyUserSessions } from '../../utils/session'

export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'verify-email', 30, 600)
  const body = await readBody<{ token?: unknown }>(event)
  const result = await verifyEmailToken(body?.token)
  if (result.changingEmail) await destroyUserSessions(event, result.userId)
  return { ok: true, changingEmail: result.changingEmail, message: '邮箱验证成功，请登录' }
})
