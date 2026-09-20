import { setUserAvatar } from '../../services/avatars'
import { toAuthUser } from '../../services/users'
import { readAvatarUpload } from '../../utils/avatar'
import { appError } from '../../utils/errors'
import { resolveSessionUser } from '../../utils/session'

// 头像以图片二进制直接 PUT 上来，不走 multipart。

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')

  const avatar = await readAvatarUpload(event)
  await setUserAvatar(user.id, avatar)

  return { user: await toAuthUser(user) }
})
