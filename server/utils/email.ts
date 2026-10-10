import { createTransport } from 'nodemailer'
import type { MailSettings, SiteSettings } from '../../shared/types/settings'
import { appError } from './errors'
import { requireMailSettings } from './settings'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function emailHtml(title: string, paragraphs: string[], action?: { label: string; url: string }): string {
  const body = paragraphs.map(text => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`).join('')
  const url = action ? escapeHtml(action.url) : ''
  const button = action
    ? `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2982ff;color:#fff;border-radius:12px;text-decoration:none">${escapeHtml(action.label)}</a></p><p style="font-size:13px;color:#666;overflow-wrap:anywhere">如果按钮无法点击，请复制以下链接到浏览器打开：<br>${url}</p>`
    : ''
  return `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f5f5;color:#212121;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif"><div style="max-width:560px;margin:auto;padding:32px;border-radius:24px;background:#fff"><h1 style="margin:0 0 24px;font-size:20px">${escapeHtml(title)}</h1>${body}${button}</div></body></html>`
}

export async function sendMail(input: { to: string; subject: string; html: string; text: string }, settings: MailSettings): Promise<void> {
  const message = { from: settings.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }
  try {
    if (settings.transport === 'smtp') {
      const transport = createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecurity === 'tls',
        requireTLS: settings.smtpSecurity === 'starttls',
        ignoreTLS: settings.smtpSecurity === 'none',
        auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: settings.smtpPassword } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      try {
        const result = await transport.sendMail(message)
        if (!result.accepted.length) throw new Error('Recipient rejected')
      } finally {
        transport.close()
      }
      return
    }

    const result = await $fetch<{ error?: unknown; success?: boolean; ok?: boolean }>(settings.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      body: message,
      timeout: 15000,
      retry: 0,
      redirect: 'error',
    })
    if (result?.error || result?.success === false || result?.ok === false) throw new Error('Mail API rejected the message')
  } catch {
    throw appError(502, 'MAIL_SEND_FAILED', settings.transport === 'smtp'
      ? '邮件发送失败，请联系管理员检查 SMTP 地址、端口、凭据和发件人设置'
      : '邮件发送失败，请联系管理员检查 API 地址、密钥和发件人设置')
  }
}

export function sendVerificationEmail(
  user: { displayName: string; email: string },
  token: string,
  settings: SiteSettings = requireMailSettings(),
  changingEmail = false,
): Promise<void> {
  const url = `${settings.siteUrl}/verify-email?token=${encodeURIComponent(token)}`
  const title = changingEmail ? '确认更换邮箱' : '验证你的邮箱'
  const paragraphs = [
    changingEmail ? `${user.displayName}，请确认将 EPanel Market 账户绑定到此邮箱。` : `${user.displayName}，欢迎加入 EPanel Market。`,
    '请点击下面的按钮完成邮箱验证，链接 24 小时内有效，只能使用一次。',
    '如果这不是你本人的操作，忽略本邮件即可。',
  ]
  return sendMail({
    to: user.email,
    subject: `${title} · EPanel Market`,
    html: emailHtml(title, paragraphs, { label: '验证邮箱', url }),
    text: `${paragraphs.join('\n\n')}\n\n${url}`,
  }, settings.mail)
}

export function sendTestEmail(to: string, settings: MailSettings): Promise<void> {
  const text = '如果你收到了这封邮件，说明当前邮件发送配置可以正常使用。'
  return sendMail({
    to,
    subject: 'EPanel Market 邮件配置测试',
    html: emailHtml('邮件配置测试', [text]),
    text,
  }, settings)
}
