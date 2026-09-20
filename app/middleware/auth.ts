// 个人资料页只在登录态下成立，这里提前跳转，避免未登录的人看到一页空表单。

export default defineNuxtRouteMiddleware(async () => {
  const { user, fetched, refresh } = useAuth()
  if (!fetched.value) await refresh()

  if (!user.value) return navigateTo('/login?next=/account')
})
