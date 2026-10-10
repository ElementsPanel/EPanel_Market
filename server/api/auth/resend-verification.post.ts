import type { LoginBody } from '../../../shared/types/auth'
import { sendUserVerification } from '../../services/email-verification'
import { findUserByEmail } from '../../services/users'
import { appError } from '../../utils/errors'
import { verifyPassword } from '../../utils/password'
import { enforceMailRateLimit } from '../../utils/rate-limit'
import { requireMailSettings } from '../../utils/settings'
import { requireEmail, requirePassword } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<LoginBody>>(event)) ?? {}
  const email = requireEmail(body.email)
  const password = requirePassword(body.password)
  if (email.length > 254) throw appError(400, 'VALIDATION_ERROR', '邮箱地址不能超过 254 个字符')
  if (password.length > 128) throw appError(400, 'VALIDATION_ERROR', '密码不能超过 128 位')
  requireMailSettings()
  enforceMailRateLimit(event, email)

  const user = await findUserByEmail(email)
  if (user && !user.emailVerified && await verifyPassword(password, user.passwordHash)) {
    await sendUserVerification(user)
  }
  return { ok: true, message: '如果该账号需要验证，我们已发送验证邮件，请检查收件箱' }
})
