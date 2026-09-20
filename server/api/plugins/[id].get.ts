import { getPluginDetail } from '../../services/plugins'
import { appError } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  return await getPluginDetail(id)
})
