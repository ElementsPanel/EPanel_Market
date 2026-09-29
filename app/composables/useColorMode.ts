type ColorMode = 'light' | 'dark' | 'system'

const modes = {
  light: { label: '浅色', icon: 'mdi-weather-sunny', next: 'dark' },
  dark: { label: '深色', icon: 'mdi-weather-night', next: 'system' },
  system: { label: '跟随系统', icon: 'mdi-theme-light-dark', next: 'light' }
} as const

export function useColorMode() {
  const savedMode = useCookie<string>('epanel-color-mode', {
    default: () => 'light',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })
  const mode = useState<ColorMode>('site:color-mode', () => {
    const saved = savedMode.value
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  })
  const icon = computed(() => modes[mode.value].icon)
  const label = computed(() => `当前配色：${modes[mode.value].label}；点击切换为${modes[modes[mode.value].next].label}`)

  function cycle() {
    mode.value = modes[mode.value].next
    savedMode.value = mode.value
  }

  return { mode, icon, label, cycle }
}
