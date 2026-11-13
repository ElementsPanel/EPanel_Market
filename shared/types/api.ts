export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'SYNC_FAILED'
  | 'DB_CONNECTION_FAILED'

export interface ApiErrorData {
  code: ApiErrorCode
  message: string
}
