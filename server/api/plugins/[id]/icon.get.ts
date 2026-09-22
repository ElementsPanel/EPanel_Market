import { createHash } from 'node:crypto'
import { readArtifactIcon } from '../../../utils/artifacts'
import { resolveDownloadVersion } from '../../../services/plugins'
import { appError } from '../../../utils/errors'

// 插件图标：包里的 `<side>/icon.png`（先 panel 端，再看 daemon 端）。它是插件的门面，
// 卡片和详情页都显示它；插件没有图标时返回 404，页面据此回退到默认图标。
//
// 和按端下载走同一套可见性规则：只对上架的、已通过审核的版本提供图片。

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event) as Record<string, string | undefined>
  const { version } = await resolveDownloadVersion(id, query.version?.trim())

  const icon = readArtifactIcon(version.artifactPath)
  if (!icon) throw appError(404, 'NOT_FOUND', '该插件没有图标')

  // Content-Type 按文件头判定，不用请求里的任何东西
  setResponseHeaders(event, {
    'Content-Type': icon.contentType,
    'X-Content-Type-Options': 'nosniff',
  })

  // ETag 取图标内容的摘要：换版本、换图都会变，浏览器据此重新校验
  if (handleCacheHeaders(event, {
    etag: `"${createHash('sha256').update(icon.data).digest('hex')}"`,
    cacheControls: ['public', 'max-age=3600', 'must-revalidate'],
  })) return

  return icon.data
})
