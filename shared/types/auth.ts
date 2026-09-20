export interface AuthUser {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: number
}

export interface LoginBody {
  email: string
  password: string
}

export interface RegisterBody {
  email: string
  password: string
  displayName?: string
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOKEN_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'DB_CONNECTION_FAILED'

export interface ApiErrorData {
  code: ApiErrorCode
  message: string
}
