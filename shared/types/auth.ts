export interface AuthUser {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: number
  /** 头像内容的 sha256，前端拼在头像地址后面做缓存参数；没有头像时为 null */
  avatarVersion: string | null
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

/** 改自己的资料。改邮箱或改密码时必须带 currentPassword 供服务端校验。 */
export interface UpdateMeBody {
  displayName?: string
  email?: string
  newPassword?: string
  currentPassword?: string
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
