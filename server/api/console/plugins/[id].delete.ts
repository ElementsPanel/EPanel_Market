import { deletePlugin } from '../../../services/plugins'
import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'

// 删除插件：版本记录随外键级联删除，磁盘产物由 service 清理。

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  await deletePlugin(id)
  return { ok: true }
})
