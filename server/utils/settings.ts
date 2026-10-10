import type { MailSettings, SiteSettings, SiteSettingsView } from '../../shared/types/settings'
import { createDefaultMailSettings, createDefaultSiteSettings, isValidMailSender, isValidSiteUrl } from '../../shared/utils/mail'
import { readConfig, writeConfigAtomic } from './config'
import { appError } from './errors'

export function getSiteSettings(): SiteSettings {
  const stored = readConfig().site
  return {
    ...createDefaultSiteSettings(),
    ...stored,
    mail: { ...createDefaultMailSettings(), ...stored?.mail },
  }
}

export function toSiteSettingsView(settings: SiteSettings): SiteSettingsView {
  return {
    siteUrl: settings.siteUrl,
    mail: {
      ...settings.mail,
      apiKey: '',
      smtpPassword: '',
      hasApiKey: Boolean(settings.mail.apiKey),
      hasSmtpPassword: Boolean(settings.mail.smtpPassword),
    },
  }
}

function invalid(message: string): never {
  throw appError(400, 'VALIDATION_ERROR', message)
}

function settingsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('设置格式不正确')
  return value as Record<string, unknown>
}

function settingsText(value: unknown, maximum = 2048): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') invalid('设置字段格式不正确')
  if (value.length > maximum) invalid('设置内容超出长度限制')
  return value.trim()
}

function parseMailSettings(input: unknown, previous?: MailSettings): MailSettings {
  const body = settingsObject(input)
  if (body.transport !== 'api' && body.transport !== 'smtp') invalid('请选择 API 或 SMTP 发送邮件')
  if (body.preset !== 'resend' && body.preset !== 'custom') invalid('邮件服务预设无效')

  const mail = createDefaultMailSettings()
  mail.transport = body.transport
  mail.preset = body.preset
  mail.from = settingsText(body.from, 320)
  if (!isValidMailSender(mail.from)) invalid('请填写有效的发件人邮箱，可使用 名称 <邮箱> 格式')

  if (mail.transport === 'api') {
    mail.apiUrl = mail.preset === 'resend' ? mail.apiUrl : settingsText(body.apiUrl)
    try {
      const url = new URL(mail.apiUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
        || /[\u0000-\u0020\u007f]/.test(mail.apiUrl)) throw new Error()
    } catch {
      invalid('请填写有效的 HTTP 或 HTTPS 邮件 API 地址')
    }
    mail.apiKey = settingsText(body.apiKey, 4096)
      || (previous?.transport === 'api' && previous.apiUrl === mail.apiUrl ? previous.apiKey : '')
    if (!mail.apiKey || /[\r\n]/.test(mail.apiKey)) invalid('请填写有效的 API 密钥')
    return mail
  }

  mail.smtpHost = mail.preset === 'resend' ? mail.smtpHost : settingsText(body.smtpHost, 253)
  if (!mail.smtpHost || /[\s/\\?#@]/.test(mail.smtpHost)) invalid('SMTP 主机地址无效')
  if (typeof body.smtpPort !== 'number' && typeof body.smtpPort !== 'string') invalid('SMTP 端口格式不正确')
  mail.smtpPort = Number(body.smtpPort)
  if (!Number.isInteger(mail.smtpPort) || mail.smtpPort < 1 || mail.smtpPort > 65535) invalid('SMTP 端口需为 1-65535')
  if (body.smtpSecurity !== 'tls' && body.smtpSecurity !== 'starttls' && body.smtpSecurity !== 'none') invalid('SMTP 加密方式无效')
  mail.smtpSecurity = body.smtpSecurity
  mail.smtpUsername = mail.preset === 'resend' ? mail.smtpUsername : settingsText(body.smtpUsername, 320)
  if (/[\r\n]/.test(mail.smtpUsername)) invalid('SMTP 用户名格式不正确')
  if (body.smtpPassword !== undefined && typeof body.smtpPassword !== 'string') invalid('SMTP 密码格式不正确')
  mail.smtpPassword = typeof body.smtpPassword === 'string' ? body.smtpPassword : ''
  if (mail.smtpPassword.length > 4096) invalid('SMTP 密码超出长度限制')
  if (!mail.smtpPassword && previous?.transport === 'smtp' && previous.smtpHost === mail.smtpHost
    && previous.smtpPort === mail.smtpPort && previous.smtpSecurity === mail.smtpSecurity
    && previous.smtpUsername === mail.smtpUsername) {
    mail.smtpPassword = previous.smtpPassword
  }
  if (Boolean(mail.smtpUsername) !== Boolean(mail.smtpPassword) || (mail.preset === 'resend' && !mail.smtpPassword)) {
    invalid('请同时填写 SMTP 用户名与密码；Resend 的 SMTP 密码为 API 密钥')
  }
  return mail
}

export function parseSiteSettings(input: unknown, previous?: SiteSettings): SiteSettings {
  const body = settingsObject(input)
  const siteUrl = settingsText(body.siteUrl)
  if (!isValidSiteUrl(siteUrl)) invalid('请填写有效的站点对外地址，不包含查询参数或锚点')
  return {
    siteUrl: new URL(siteUrl).href.replace(/\/+$/, ''),
    mail: parseMailSettings(body.mail, previous?.mail),
  }
}

export function saveSiteSettings(settings: SiteSettings): void {
  writeConfigAtomic({ ...readConfig(), site: settings })
}

export function requireMailSettings(): SiteSettings {
  const settings = getSiteSettings()
  try {
    return parseSiteSettings(settings)
  } catch {
    throw appError(503, 'MAIL_NOT_CONFIGURED', '邮件服务尚未配置，请联系管理员')
  }
}
