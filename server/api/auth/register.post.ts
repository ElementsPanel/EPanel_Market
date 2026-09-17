import type { RegisterBody } from '../../../shared/types/auth'
import { createUser, findUserByEmail, toAuthUser } from '../../services/users'
import { appError } from '../../utils/errors'
import { createSession, setSessionCookie } from '../../utils/session'
import { optionalText, requireEmail, requirePassword } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<RegisterBody>>(event)) ?? {}
  const email = requireEmail(body.email)
  const password = requirePassword(body.password)

  if (await findUserByEmail(email)) {
    throw appError(409, 'EMAIL_TAKEN', '该邮箱已被注册')
  }

  const user = await createUser({
    email,
    password,
    displayName: optionalText(body.displayName),
  })

  setSessionCookie(event, await createSession(user.id))

  return { user: toAuthUser(user) }
})
