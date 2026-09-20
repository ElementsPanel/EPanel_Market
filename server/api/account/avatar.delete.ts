import { deleteUserAvatar } from '../../services/avatars'
import { toAuthUser } from '../../services/users'
import { appError } from '../../utils/errors'
import { resolveSessionUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')

  await deleteUserAvatar(user.id)

  return { user: await toAuthUser(user) }
})
