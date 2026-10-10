import { authDialogLocation } from '../utils/nextPath'

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetched, refresh } = useAuth()
  if (!fetched.value) await refresh()

  if (!user.value) return navigateTo(authDialogLocation('login', to.fullPath))
  if (!user.value.isAdmin) {
    useToast().error('你没有访问控制台的权限')
    return navigateTo('/')
  }
})
