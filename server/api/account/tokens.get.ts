import { listApiTokens } from '../../utils/api-token'
import { appError } from '../../utils/errors'
import { resolveSessionUser } from '../../utils/session'

// 「编辑资料」页：账号名下的发布令牌，本人可以逐个吊销。

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')

  return { items: await listApiTokens(user.id) }
})
