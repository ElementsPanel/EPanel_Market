import { consumeOAuthCode } from '../../utils/api-token'
import { appError } from '../../utils/errors'

// 面板轮询此接口换取发布令牌。未授权时返回 404，面板据此继续等待。

export default defineEventHandler(async (event) => {
  const state = String((getQuery(event) as Record<string, unknown>).state ?? '').trim()
  if (!state) throw appError(400, 'VALIDATION_ERROR', '缺少连接码')

  const token = await consumeOAuthCode(state)
  // 授权尚未发生、连接码过期、或已被上一次轮询消费完，对面板来说都是「还没好」。
  if (!token) throw appError(404, 'NOT_FOUND', '尚未授权或连接码已失效')

  return { token }
})
