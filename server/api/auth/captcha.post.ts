import { createAuthCaptchaChallenge } from '../../utils/captcha'
import { appError } from '../../utils/errors'
import { enforceRateLimit } from '../../utils/rate-limit'
import { requireEmail } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  enforceRateLimit(event, 'auth-captcha', 30, 60)
  const body = await readBody<{ email?: unknown; action?: unknown }>(event)
  const action = body?.action ?? 'login'
  if (action !== 'login' && action !== 'register') {
    throw appError(400, 'VALIDATION_ERROR', '人机验证用途无效')
  }
  const email = requireEmail(body?.email)
  if (email.length > 254) throw appError(400, 'VALIDATION_ERROR', '邮箱地址不能超过 254 个字符')

  return createAuthCaptchaChallenge(email, action)
})
