import { setPluginVisibility } from '../../../services/plugins'
import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'
import type { PluginVisibility } from '../../../../shared/types/plugins'

// 上架 / 下架。下架只是首页不再列出，产物仍保留。

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const body = (await readBody<{ visibility?: string }>(event)) ?? {}
  const visibility: PluginVisibility = body.visibility === 'hidden' ? 'hidden' : 'listed'

  await setPluginVisibility(id, visibility)
  return { ok: true }
})
