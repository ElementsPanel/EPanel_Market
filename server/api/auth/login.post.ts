import type { LoginBody } from '../../../shared/types/auth'
import { findUserByEmail, toAuthUser } from '../../services/users'
import { appError } from '../../utils/errors'
import { verifyPassword } from '../../utils/password'
import { createSession, setSessionCookie } from '../../utils/session'
import { requireEmail, requirePassword } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<LoginBody>>(event)) ?? {}
  const email = requireEmail(body.email)
  const password = requirePassword(body.password)

  const user = await findUserByEmail(email)
  // 邮箱不存在与密码错误返回同一错误，避免用户枚举
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw appError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误')
  }

  setSessionCookie(event, await createSession(user.id))

  return { user: toAuthUser(user) }
})
