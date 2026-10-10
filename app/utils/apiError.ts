import type { ApiErrorCode } from '../../shared/types/auth'

interface ErrorPayload {
  message?: string
  code?: ApiErrorCode
  data?: { message?: string; code?: ApiErrorCode }
}

export function apiErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  const cause = error as { data?: ErrorPayload; message?: string } | null | undefined
  const messages = [cause?.data?.data?.message, cause?.data?.message, cause?.message]
  return messages.find(message => typeof message === 'string' && message.trim()) ?? fallback
}

export function apiErrorCode(error: unknown): ApiErrorCode | undefined {
  const payload = (error as { data?: ErrorPayload } | null | undefined)?.data
  return payload?.data?.code ?? payload?.code
}
