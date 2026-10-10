import type { CaptchaProof } from './captcha'

export interface AuthUser {
  id: string
  email: string
  emailVerified: boolean
  displayName: string
  isAdmin: boolean
  createdAt: number
  /** 头像内容的 sha256，前端拼在头像地址后面做缓存参数；没有头像时为 null */
  avatarVersion: string | null
}

export interface LoginBody {
  email: string
  password: string
  captcha?: CaptchaProof
}

export interface RegisterBody {
  email: string
  password: string
  displayName?: string
  captcha?: CaptchaProof
}

export interface RegistrationResult {
  ok: true
  message: string
}

/** 改自己的资料。改邮箱或改密码时必须带 currentPassword 供服务端校验。 */
export interface UpdateMeBody {
  displayName?: string
  email?: string
  newPassword?: string
  currentPassword?: string
}

export interface UpdateMeResult {
  user: AuthUser
  pendingEmail?: string
}

/** 账号名下的一个发布令牌（发布脚本连接市场时签发）。令牌明文只在签发时出现一次。 */
export interface ApiTokenSummary {
  id: string
  name: string
  createdAt: number
  lastUsedAt?: number
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_CREDENTIALS'
  | 'CAPTCHA_REQUIRED'
  | 'CAPTCHA_INVALID'
  | 'CAPTCHA_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'MAIL_NOT_CONFIGURED'
  | 'MAIL_SEND_FAILED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'DB_CONNECTION_FAILED'

export interface ApiErrorData {
  code: ApiErrorCode
  message: string
}
