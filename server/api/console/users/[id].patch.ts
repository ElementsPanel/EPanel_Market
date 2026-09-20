import { setUserAdmin } from '../../../services/users'
import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'

// 改管理员 / 删除用户。管理员不能撤销自己的管理员身份。

export default defineEventHandler(async (event) => {
  const operator = await requireAdminUser(event)
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少用户标识')
  if (id === operator.id) throw appError(409, 'CONFLICT', '不能修改自己的管理员身份')

  const body = (await readBody<{ isAdmin?: boolean }>(event)) ?? {}
  if (typeof body.isAdmin !== 'boolean') {
    throw appError(400, 'VALIDATION_ERROR', '请提交布尔值 isAdmin')
  }

  await setUserAdmin(id, body.isAdmin)
  return { ok: true }
})
