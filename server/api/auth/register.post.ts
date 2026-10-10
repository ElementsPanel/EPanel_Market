import type { RegisterBody } from '../../../shared/types/auth'
import { createUser, findUserByEmail } from '../../services/users'
import { sendUserVerification } from '../../services/email-verification'
import { verifyAuthCaptcha } from '../../utils/captcha'
import { appError } from '../../utils/errors'
import { verifyPassword } from '../../utils/password'
import { enforceMailRateLimit } from '../../utils/rate-limit'
import { requireMailSettings } from '../../utils/settings'
import { optionalText, requireEmail, requirePassword } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<RegisterBody>>(event)) ?? {}
  const email = requireEmail(body.email)
  const password = requirePassword(body.password)
  if (email.length > 254) throw appError(400, 'VALIDATION_ERROR', '邮箱地址不能超过 254 个字符')
  if (password.length > 128) throw appError(400, 'VALIDATION_ERROR', '密码不能超过 128 位')
  await verifyAuthCaptcha(email, body.captcha, 'register')
  requireMailSettings()
  enforceMailRateLimit(event, email)

  const existing = await findUserByEmail(email)
  if (existing && (existing.emailVerified || !(await verifyPassword(password, existing.passwordHash)))) {
    throw appError(409, 'EMAIL_TAKEN', '该邮箱已被注册')
  }

  const user = existing ?? await createUser({
    email,
    password,
    displayName: optionalText(body.displayName),
  })

  await sendUserVerification(user)

  return { ok: true, message: '验证邮件已发送，请验证邮箱后登录' }
})
