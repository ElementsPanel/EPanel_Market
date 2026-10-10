import type { UpdateMeBody } from '../../../shared/types/auth'
import { findUserByEmail, normalizeEmail, toAuthUser, updateUserProfile } from '../../services/users'
import { appError } from '../../utils/errors'
import { hashPassword, verifyPassword } from '../../utils/password'
import { clearEmailVerificationTokens, sendUserVerification } from '../../services/email-verification'
import { enforceMailRateLimit } from '../../utils/rate-limit'
import { requireMailSettings } from '../../utils/settings'
import { destroyOtherSessions, resolveSessionUser } from '../../utils/session'
import { optionalText, requireEmail, requirePassword } from '../../utils/validation'

// 改邮箱或更换密码都动到了登录凭据，必须证明自己还持有当前密码，
// 免得一台设备上的遗留会话就能把账户接管走。
export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')

  const body = (await readBody<Partial<UpdateMeBody>>(event)) ?? {}
  const patch: { displayName?: string, passwordHash?: string } = {}
  let pendingEmail: string | undefined

  const displayName = optionalText(body.displayName)
  if (displayName) patch.displayName = displayName

  const changingEmail = body.email !== undefined
  const changingPassword = body.newPassword !== undefined

  if (changingEmail || changingPassword) {
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    if (!(await verifyPassword(current, user.passwordHash))) {
      throw appError(400, 'INVALID_CREDENTIALS', '当前密码不正确')
    }
  }

  if (changingEmail) {
    const email = requireEmail(body.email)
    if (email.length > 254) throw appError(400, 'VALIDATION_ERROR', '邮箱地址不能超过 254 个字符')
    // 与自己的邮箱一致时不必查重，否则原样提交会撞上自己
    if (email !== normalizeEmail(user.email)) {
      const taken = await findUserByEmail(email)
      if (taken) throw appError(409, 'EMAIL_TAKEN', '该邮箱已被注册')
      pendingEmail = email
    }
  }

  if (changingPassword) {
    patch.passwordHash = await hashPassword(requirePassword(body.newPassword))
  }

  if (pendingEmail) {
    requireMailSettings()
    enforceMailRateLimit(event, pendingEmail)
  }
  if (patch.passwordHash) await clearEmailVerificationTokens(user.id)
  if (pendingEmail) await sendUserVerification(user, pendingEmail)

  const updating = Object.keys(patch).length ? await updateUserProfile(user.id, patch) : user

  // 密码换掉之后的会话都不再可信，只留当前这一次
  if (patch.passwordHash) await destroyOtherSessions(event, user.id)

  return { user: await toAuthUser(updating), pendingEmail }
})
