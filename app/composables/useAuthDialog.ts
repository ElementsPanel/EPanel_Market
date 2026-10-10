import { safeNextPath } from '../utils/nextPath'

export type AuthView = 'login' | 'register'

export function useAuthDialog() {
  const route = useRoute()
  const router = useRouter()

  const view = computed<AuthView | null>(() => {
    const value = route.query.auth
    return value === 'login' || value === 'register' ? value : null
  })

  const nextPath = computed(() => route.query.next == null ? null : safeNextPath(route.query.next))

  function open(next: AuthView, options: { next?: string; replace?: boolean } = {}) {
    return navigateTo({
      path: route.path,
      query: {
        ...route.query,
        auth: next,
        ...(options.next ? { next: safeNextPath(options.next) } : {}),
      },
      hash: route.hash,
    }, { replace: options.replace })
  }

  function close() {
    const query = { ...route.query }
    delete query.auth
    delete query.next
    return navigateTo({ path: route.path, query, hash: route.hash }, { replace: true })
  }

  function complete() {
    if (!nextPath.value) return close()
    const target = router.resolve(nextPath.value)
    const query = { ...target.query }
    delete query.auth
    delete query.next
    return navigateTo({ path: target.path, query, hash: target.hash }, { replace: true })
  }

  return { view, open, close, complete }
}
