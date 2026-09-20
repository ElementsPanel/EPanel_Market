import { deleteUser } from '../../../services/users'
import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'

// 删除用户：插件、版本、令牌与会话都随外键级联删除。

export default defineEventHandler(async (event) => {
  const operator = await requireAdminUser(event)
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少用户标识')
  if (id === operator.id) throw appError(409, 'CONFLICT', '不能删除自己')

  await deleteUser(id)
  return { ok: true }
})
