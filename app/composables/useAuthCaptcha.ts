import type { ApiErrorCode, RegisterBody } from '../../shared/types/auth'
import type { CaptchaAction, CaptchaChallenge, CaptchaProof, CaptchaResponse } from '../../shared/types/captcha'
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'

export function useAuthCaptcha(options: {
  active: () => boolean
  submit: (action: CaptchaAction, body: RegisterBody, signal: AbortSignal) => Promise<void>
  onCancel?: () => void
  onError?: (code: ApiErrorCode | undefined) => void
}) {
  const toast = useToast()
  const step = ref<'idle' | 'preparing' | 'challenge' | 'submitting'>('idle')
  const loading = computed(() => step.value !== 'idle')
  const challenge = ref<CaptchaChallenge | null>(null)
  const captchaError = ref('')
  let attempt: { action: CaptchaAction; credentials: Omit<RegisterBody, 'captcha'> } | null = null
  let request: AbortController | undefined
  let configurationRetried = false

  watch(options.active, (active) => {
    if (!active) cancelAttempt()
  })
  onBeforeUnmount(cancelAttempt)

  function newRequest() {
    request?.abort()
    request = new AbortController()
    return request
  }

  function isCurrent(controller: AbortController): boolean {
    return options.active() && request === controller && !controller.signal.aborted
  }

  function cancelAttempt() {
    request?.abort()
    request = undefined
    attempt = null
    challenge.value = null
    captchaError.value = ''
    step.value = 'idle'
  }

  async function cancelChallenge() {
    if (step.value === 'submitting') return
    cancelAttempt()
    await nextTick()
    if (options.active() && step.value === 'idle') options.onCancel?.()
  }

  function onCaptchaError(message: string) {
    if (!options.active() || !challenge.value || captchaError.value === message) return
    captchaError.value = message
    toast.error(message)
  }

  async function authenticate(action: CaptchaAction, credentials: Omit<RegisterBody, 'captcha'>) {
    if (loading.value || !options.active()) return
    attempt = { action, credentials: { ...credentials } }
    configurationRetried = false
    await prepareCaptcha()
  }

  async function prepareCaptcha() {
    if (!attempt || !options.active() || step.value === 'submitting') return
    const controller = newRequest()
    step.value = 'preparing'
    captchaError.value = ''

    try {
      const result = await $fetch<CaptchaResponse>('/api/auth/captcha', {
        method: 'POST',
        body: { email: attempt.credentials.email, action: attempt.action },
        signal: controller.signal,
        timeout: 15000,
        retry: 0,
      })
      if (!isCurrent(controller)) return

      if (result.enabled) {
        challenge.value = result
        step.value = 'challenge'
      } else {
        challenge.value = null
        await submitCredentials()
      }
    } catch (error) {
      if (!isCurrent(controller)) return
      if (challenge.value) {
        onCaptchaError(apiErrorMessage(error))
        step.value = 'challenge'
      } else {
        toast.error(apiErrorMessage(error))
        cancelAttempt()
      }
    }
  }

  async function completeCaptcha(proof: CaptchaProof) {
    if (step.value !== 'challenge' || proof.requestId !== challenge.value?.requestId) return
    await submitCredentials(proof)
  }

  async function submitCredentials(captcha?: CaptchaProof) {
    if (!attempt || !options.active() || step.value === 'submitting') return
    const controller = newRequest()
    step.value = 'submitting'
    captchaError.value = ''

    try {
      await options.submit(attempt.action, { ...attempt.credentials, captcha }, controller.signal)
      if (isCurrent(controller)) cancelAttempt()
    } catch (error) {
      if (!isCurrent(controller)) return
      const code = apiErrorCode(error)
      if (code === 'CAPTCHA_REQUIRED' && !captcha && !configurationRetried) {
        configurationRetried = true
        step.value = 'preparing'
        await prepareCaptcha()
      } else if (challenge.value && (!code || code.startsWith('CAPTCHA_'))) {
        onCaptchaError(apiErrorMessage(error))
        step.value = 'challenge'
      } else {
        toast.error(apiErrorMessage(error))
        cancelAttempt()
        options.onError?.(code)
      }
    }
  }

  return { step, loading, challenge, captchaError, authenticate, prepareCaptcha, completeCaptcha, onCaptchaError, cancelChallenge, cancelAttempt }
}
