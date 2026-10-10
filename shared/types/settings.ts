import type { CaptchaSettings, CaptchaSettingsView } from './captcha'

export interface MailSettings {
  transport: 'api' | 'smtp'
  preset: 'resend' | 'custom'
  from: string
  apiUrl: string
  apiKey: string
  smtpHost: string
  smtpPort: number
  smtpSecurity: 'tls' | 'starttls' | 'none'
  smtpUsername: string
  smtpPassword: string
}

export interface MailSettingsView extends MailSettings {
  hasApiKey: boolean
  hasSmtpPassword: boolean
}

export interface SiteSettings {
  siteUrl: string
  mail: MailSettings
  captcha: CaptchaSettings
}

export interface SiteSettingsView {
  siteUrl: string
  mail: MailSettingsView
  captcha: CaptchaSettingsView
}
