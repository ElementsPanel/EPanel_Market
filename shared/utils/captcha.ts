import type { CaptchaSettings } from '../types/captcha'

export const CAPTCHA_PROVIDERS = [
  { title: 'Google reCAPTCHA v2', value: 'recaptcha' },
  { title: 'BotFlush', value: 'botflush' },
  { title: 'Cloudflare Turnstile', value: 'turnstile' },
] as const

export function createDefaultCaptchaSettings(): CaptchaSettings {
  return { enabled: false, provider: 'turnstile', siteKey: '', secretKey: '' }
}
