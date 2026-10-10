import type { MailSettings, SiteSettings } from '../types/settings'

export function createDefaultMailSettings(): MailSettings {
  return {
    transport: 'api',
    preset: 'resend',
    from: '',
    apiUrl: 'https://api.resend.com/emails',
    apiKey: '',
    smtpHost: 'smtp.resend.com',
    smtpPort: 465,
    smtpSecurity: 'tls',
    smtpUsername: 'resend',
    smtpPassword: '',
  }
}

export function createDefaultSiteSettings(): SiteSettings {
  return { siteUrl: '', mail: createDefaultMailSettings() }
}

export function isValidSiteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return value.length <= 2048 && !/[\u0000-\u0020\u007f]/.test(value)
      && ['http:', 'https:'].includes(url.protocol)
      && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

export function isValidMailSender(value: string): boolean {
  if (value.length > 320 || /[\r\n]/.test(value)) return false
  const match = value.trim().match(/^(?:[^<>]*<([^<>]+)>|([^<>]+))$/)
  const email = (match?.[1] ?? match?.[2] ?? '').trim()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
