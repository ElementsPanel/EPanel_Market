import { authDialogLocation } from '../utils/nextPath'

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetched, refresh } = useAuth()
  if (!fetched.value) await refresh()

  if (!user.value) return navigateTo(authDialogLocation('login', to.fullPath))
})
