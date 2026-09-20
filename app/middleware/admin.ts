// 客户端守卫：控制台页面的接口本身也校验管理员身份，这里只是提前跳走，
// 免得未登录的用户先看到一页空表格再收到 401。

export default defineNuxtRouteMiddleware(async () => {
  const { user, fetched, refresh } = useAuth()
  if (!fetched.value) await refresh()

  if (!user.value) return navigateTo('/login?next=/console')
  if (!user.value.isAdmin) return navigateTo('/')
})
