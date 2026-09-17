export default defineNuxtPlugin(async () => {
  const { fetched, refresh } = useAuth()

  // 配置页不需要登录态（此时 /api/auth/me 会返回 503）
  if (useRequestURL().pathname === '/setup') return

  if (import.meta.server || !fetched.value) await refresh()
})
