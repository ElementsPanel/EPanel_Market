import { toAuthUser } from '../../services/users'
import { appError } from '../../utils/errors'
import { resolveSessionUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '尚未登录')

  return { user: toAuthUser(user) }
})
