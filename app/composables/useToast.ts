export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastMessage {
  text: string
  color: ToastType
  prependIcon: string
}

const icons: Record<ToastType, string> = {
  success: 'mdi-check-circle-outline',
  error: 'mdi-alert-circle-outline',
  info: 'mdi-information-outline',
  warning: 'mdi-alert-outline',
}

export function useToast() {
  const messages = useState<ToastMessage[]>('app-toast-messages', () => [])

  function show(message: string, type: ToastType = 'info') {
    const text = message.trim()
    if (!text) return
    messages.value.push({ text, color: type, prependIcon: icons[type] })
  }

  return {
    messages,
    show,
    success: (message: string) => show(message, 'success'),
    error: (message: string) => show(message, 'error'),
    info: (message: string) => show(message, 'info'),
    warning: (message: string) => show(message, 'warning'),
  }
}
