import { appError } from './errors'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export function requireEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email)) throw appError(400, 'VALIDATION_ERROR', '请填写有效的邮箱地址')
  return email
}

export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw appError(400, 'VALIDATION_ERROR', `密码至少需要 ${MIN_PASSWORD_LENGTH} 位`)
  }
  return value
}

export function optionalText(value: unknown, maxLength = 64): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}
