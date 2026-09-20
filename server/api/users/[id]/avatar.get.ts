import { findUserAvatar } from '../../../services/avatars'
import { appError } from '../../../utils/errors'

// 头像是公开信息（插件详情页要显示作者），所以这里只按用户 id 读取，不要登录态。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID_PATTERN.test(id)) throw appError(400, 'VALIDATION_ERROR', '用户 ID 无效')

  const avatar = await findUserAvatar(id)
  if (!avatar) throw appError(404, 'NOT_FOUND', '该用户尚未设置头像')

  // Content-Type 取库里的记录，不用请求里的任何东西
  setResponseHeaders(event, {
    'Content-Type': avatar.contentType,
    'X-Content-Type-Options': 'nosniff',
  })

  if (handleCacheHeaders(event, {
    etag: `"${avatar.version}"`,
    cacheControls: ['private', 'max-age=86400', 'must-revalidate'],
  })) return

  return avatar.data
})
