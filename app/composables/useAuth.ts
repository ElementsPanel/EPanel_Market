import type { AuthUser, LoginBody, RegisterBody, UpdateMeBody } from '../../shared/types/auth'
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'

export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const fetched = useState<boolean>('auth:fetched', () => false)
  const loggingOut = useState<boolean>('auth:logging-out', () => false)
  const toast = useToast()

  async function refresh(): Promise<void> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me', {
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
      })
      user.value = data.user
    } catch (error) {
      user.value = null
      // 应用尚未初始化：客户端直接引导到配置页
      if (import.meta.client && apiErrorCode(error) === 'NOT_INITIALIZED') await navigateTo('/setup')
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
      throw new Error(apiErrorMessage(error))
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
      throw new Error(apiErrorMessage(error))
    }
  }

  /** 头像地址后面跟上版本号，换图后必定 miss，没换则可以命中缓存 */
  const avatarUrl = computed(() => {
    const current = user.value
    return current?.avatarVersion ? `/api/users/${current.id}/avatar?v=${current.avatarVersion}` : null
  })

  async function updateUser(body: UpdateMeBody): Promise<AuthUser> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me', { method: 'PATCH', body })
      user.value = data.user
      return data.user
    } catch (error) {
      throw new Error(apiErrorMessage(error))
    }
  }

  // File/Blob 可以直接当请求体，但 ofetch 不会替我们带上 Content-Type
  async function uploadAvatar(file: File): Promise<AuthUser> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/account/avatar', {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      })
      user.value = data.user
      return data.user
    } catch (error) {
      throw new Error(apiErrorMessage(error))
    }
  }

  async function deleteAvatar(): Promise<AuthUser> {
    try {
      const data = await $fetch<{ user: AuthUser }>('/api/account/avatar', { method: 'DELETE' })
      user.value = data.user
      return data.user
    } catch (error) {
      throw new Error(apiErrorMessage(error))
    }
  }

  async function logout(): Promise<void> {
    if (loggingOut.value) return
    loggingOut.value = true
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
      user.value = null
      toast.success('已退出登录')
      await navigateTo('/')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      loggingOut.value = false
    }
  }

  return { user, fetched, avatarUrl, loggingOut, refresh, login, register, updateUser, uploadAvatar, deleteAvatar, logout, errorMessage: apiErrorMessage }
}
