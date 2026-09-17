import type { ApiErrorCode } from '../../shared/types/auth'

/**
 * 统一错误：HTTP 状态行用 ASCII 的 code（避免中文出现在 statusMessage），
 * 中文文案放在 data.message，由前端读取展示。
 */
export function appError(statusCode: number, code: ApiErrorCode, message: string) {
  return createError({ statusCode, statusMessage: code, data: { code, message } })
}
