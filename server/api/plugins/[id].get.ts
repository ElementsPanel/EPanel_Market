import { getPluginDetail } from '../../services/plugins'
import { appError } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event)
  if (query.version !== undefined && typeof query.version !== 'string') {
    throw appError(400, 'VALIDATION_ERROR', '版本号必须是字符串')
  }

  return await getPluginDetail(id, query.version?.trim() || undefined)
})
