import type { CaptchaProvider, CaptchaChallenge } from '../../shared/types/captcha'

interface WidgetOptions {
  sitekey: string
  theme: 'light' | 'dark'
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

interface RecaptchaSdk {
  render: (container: HTMLElement, options: WidgetOptions & { size: 'normal' | 'compact' }) => number
  reset: (id: number) => void
}

interface TurnstileSdk {
  render: (container: HTMLElement, options: WidgetOptions & {
    action: string
    cData: string
    size: 'flexible' | 'compact'
    'timeout-callback': () => void
  }) => string | undefined
  remove: (id: string) => void
}

interface BotFlushWidget {
  destroy?: () => void
  closeModal?: () => void
  resetTrigger?: () => void
  openModal?: (data: unknown) => void
}

interface BotFlushSdk {
  render: (containerId: string, options: {
    siteKey: string
    action: string
    requestId: string
    callback: (token: string) => void
    onError: () => void
    'expired-callback': () => void
    'error-callback': () => void
  }) => BotFlushWidget | undefined
}

type CaptchaSdk = RecaptchaSdk | TurnstileSdk | BotFlushSdk
type CaptchaWindow = Window & {
  grecaptcha?: RecaptchaSdk | BotFlushSdk
  turnstile?: TurnstileSdk
  BotFlush?: BotFlushSdk
  __epanelRecaptchaReady?: () => void
  __epanelTurnstileReady?: () => void
}

const scripts: Record<CaptchaProvider, string> = {
  recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__epanelRecaptchaReady&hl=zh-CN',
  botflush: 'https://challenge.botflush.com/widget.js',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__epanelTurnstileReady'
}

const sdkCache = new Map<CaptchaProvider, Promise<CaptchaSdk>>()
let loadingQueue = Promise.resolve()

function loadCaptchaSdk(provider: CaptchaProvider): Promise<CaptchaSdk> {
  const cached = sdkCache.get(provider)
  if (cached) return cached

  const promise = loadingQueue.then(() => new Promise<CaptchaSdk>((resolve, reject) => {
    const globals = window as CaptchaWindow
    const previousRecaptcha = globals.grecaptcha
    const script = document.createElement('script')
    let settled = false
    const timer = setTimeout(fail, 15000)

    function restoreRecaptcha() {
      if (provider !== 'botflush' || globals.grecaptcha !== globals.BotFlush) return
      if (previousRecaptcha) globals.grecaptcha = previousRecaptcha
      else delete globals.grecaptcha
    }

    function fail() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      restoreRecaptcha()
      script.remove()
      reject(new Error('验证码组件加载失败，请检查网络后重试'))
    }

    function ready() {
      restoreRecaptcha()
      if (settled) return
      const sdk = provider === 'recaptcha' ? globals.grecaptcha : provider === 'turnstile' ? globals.turnstile : globals.BotFlush
      if (!sdk || typeof sdk.render !== 'function' || (provider === 'recaptcha' && !('reset' in sdk))) {
        fail()
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(sdk)
    }

    if (provider === 'recaptcha') globals.__epanelRecaptchaReady = ready
    else if (provider === 'turnstile') globals.__epanelTurnstileReady = ready
    else script.onload = ready

    script.src = scripts[provider]
    script.async = true
    script.defer = true
    script.onerror = fail
    document.head.appendChild(script)
  }))

  sdkCache.set(provider, promise)
  loadingQueue = promise.then(() => undefined, () => undefined)
  void promise.catch(() => {
    if (sdkCache.get(provider) === promise) sdkCache.delete(provider)
  })
  return promise
}

export async function mountCaptchaWidget(
  container: HTMLElement,
  challenge: CaptchaChallenge,
  theme: 'light' | 'dark',
  signal: AbortSignal,
  callbacks: { success: (token: string) => void, error: (message: string) => void }
) {
  const sdk = await loadCaptchaSdk(challenge.provider)
  if (signal.aborted) return () => {}
  let active = true
  const notifyError = (message: string) => {
    if (active && !signal.aborted) callbacks.error(message)
  }
  const options: WidgetOptions = {
    sitekey: challenge.siteKey,
    theme,
    callback: (token) => {
      if (active && !signal.aborted && typeof token === 'string' && token) callbacks.success(token)
    },
    'expired-callback': () => notifyError('验证码已过期，请重新验证'),
    'error-callback': () => notifyError('验证码加载或验证失败，请重试')
  }

  let remove: () => void
  if (challenge.provider === 'recaptcha') {
    const api = sdk as RecaptchaSdk
    const id = api.render(container, { ...options, size: container.clientWidth < 304 ? 'compact' : 'normal' })
    remove = () => api.reset(id)
  } else if (challenge.provider === 'turnstile') {
    const api = sdk as TurnstileSdk
    const id = api.render(container, {
      ...options,
      action: challenge.action,
      cData: challenge.requestId,
      size: container.clientWidth < 300 ? 'compact' : 'flexible',
      'timeout-callback': options['expired-callback']
    })
    if (!id) throw new Error('验证码组件加载失败，请重试')
    remove = () => api.remove(id)
  } else {
    container.id = `auth-captcha-${challenge.requestId}`
    const widget = (sdk as BotFlushSdk).render(container.id, {
      siteKey: challenge.siteKey,
      action: challenge.action,
      requestId: challenge.requestId,
      callback: options.callback,
      onError: options['error-callback'],
      'expired-callback': options['expired-callback'],
      'error-callback': options['error-callback']
    })
    if (widget?.openModal) {
      const openModal = widget.openModal.bind(widget)
      widget.openModal = (data) => {
        if (active && !signal.aborted) openModal(data)
      }
    }
    remove = () => {
      if (widget?.destroy) widget.destroy()
      else {
        widget?.closeModal?.()
        widget?.resetTrigger?.()
      }
    }
  }

  return () => {
    active = false
    try {
      remove()
    } finally {
      container.replaceChildren()
    }
  }
}
