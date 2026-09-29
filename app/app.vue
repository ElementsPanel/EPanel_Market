<script setup lang="ts">
import { useTheme } from 'vuetify'

const theme = useTheme()
const { mode } = useColorMode()
const savedScheme = useCookie<string>('epanel-color-scheme', {
  default: () => 'light',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  path: '/'
})

// SSR 使用上次的实际配色，客户端先复用同一状态，避免 hydration 时 Logo 和主题不一致。
const initialScheme = useState('site:initial-color-scheme', () =>
  mode.value === 'system' ? (savedScheme.value === 'dark' ? 'dark' : 'light') : mode.value
)
void theme.change(initialScheme.value, false)

const mounted = ref(false)
onMounted(() => { mounted.value = true })

watchEffect(() => {
  if (!mounted.value) return
  // Vuetify 的 system 模式会持续监听系统配色变化。
  void theme.change(mode.value, false)
})

watchEffect(() => {
  if (!mounted.value) return
  savedScheme.value = theme.global.current.value.dark ? 'dark' : 'light'
})
</script>

<template>
  <NuxtLoadingIndicator color="#2982FF" :throttle="0" />
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
