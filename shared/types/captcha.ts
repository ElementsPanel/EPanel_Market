export type CaptchaProvider = 'recaptcha' | 'botflush' | 'turnstile'

export type CaptchaAction = 'login' | 'register'

export interface CaptchaSettings {
  enabled: boolean
  provider: CaptchaProvider
  siteKey: string
  secretKey: string
}

export interface CaptchaSettingsView extends CaptchaSettings {
  hasSecretKey: boolean
}

export interface CaptchaChallenge {
  enabled: true
  action: CaptchaAction
  provider: CaptchaProvider
  siteKey: string
  requestId: string
}

export type CaptchaResponse = { enabled: false } | CaptchaChallenge

export interface CaptchaProof {
  requestId: string
  token: string
}
