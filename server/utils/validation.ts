import { appError } from './errors'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw appError(400, 'VALIDATION_ERROR', `密码至少需要 ${MIN_PASSWORD_LENGTH} 位`)
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw appError(400, 'VALIDATION_ERROR', `密码不能超过 ${MAX_PASSWORD_LENGTH} 位`)
  }
  return value
}
