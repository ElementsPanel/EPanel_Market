import { findPluginIcon } from '../../../services/npm-plugins'
import { appError } from '../../../utils/errors'

// 图标取自 npm 包根目录的 icon.png，同步时已校验并缓存到本地，这里不访问 registry。

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const icon = await findPluginIcon(id)
  if (!icon) throw appError(404, 'NOT_FOUND', '该插件没有图标')

  setResponseHeaders(event, {
    'Content-Type': 'image/png',
    'X-Content-Type-Options': 'nosniff',
  })

  if (handleCacheHeaders(event, {
    etag: `"${icon.contentHash}"`,
    cacheControls: ['public', 'max-age=3600', 'must-revalidate'],
  })) return

  return icon.data
})
