import { revokeApiToken } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'
import { resolveSessionUser } from '../../../utils/session'

// 吊销自己名下的一个发布令牌。只认浏览器会话：令牌不能拿来吊销别的令牌。

export default defineEventHandler(async (event) => {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')

  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少令牌标识')

  if (!(await revokeApiToken(user.id, id))) {
    throw appError(404, 'NOT_FOUND', '令牌不存在或已被撤销')
  }
  return { ok: true }
})
