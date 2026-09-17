import type { ApiErrorCode, AuthUser, LoginBody, RegisterBody } from '../../shared/types/auth'

function errorMessage(error: unknown): string {
  const data = (error as { data?: { message?: string } })?.data
  return data?.message ?? (error as Error)?.message ?? '请求失败'
}

function errorCode(error: unknown): ApiErrorCode | undefined {
  return (error as { data?: { code?: ApiErrorCode } })?.data?.code
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const fetched = useState<boolean>('auth:fetched', () => false)

  async function refresh(): Promise<void> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me', {
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
      })
      user.value = data.user
    } catch (error) {
      user.value = null
      // 应用尚未初始化：客户端直接引导到配置页
      if (import.meta.client && errorCode(error) === 'NOT_INITIALIZED') await navigateTo('/setup')
    } finally {
      fetched.value = true
    }
  }

  async function login(body: LoginBody): Promise<AuthUser> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body })
      user.value = data.user
      fetched.value = true
      return data.user
    } catch (error) {
      user.value = null
      throw new Error(errorMessage(error))
    }
  }

  async function register(body: RegisterBody): Promise<AuthUser> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body })
      user.value = data.user
      fetched.value = true
      return data.user
    } catch (error) {
      user.value = null
      throw new Error(errorMessage(error))
    }
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    user.value = null
    await navigateTo('/login')
  }

  return { user, fetched, refresh, login, register, logout, errorMessage }
}
