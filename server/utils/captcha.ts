import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import type { CaptchaAction, CaptchaProvider, CaptchaProof, CaptchaResponse } from '../../shared/types/captcha'
import type { SiteSettings } from '../../shared/types/settings'
import { isValidSiteUrl } from '../../shared/utils/mail'
import { getDb } from '../db/client'
import { appError } from './errors'
import { getSiteSettings } from './settings'

const verifyUrls: Record<CaptchaProvider, string> = {
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  botflush: 'https://challenge.botflush.com/api/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
}

interface CaptchaVerification {
  success?: boolean
  hostname?: string
  action?: string
  cdata?: string
  site_key?: string
  request_id?: string
}

function captchaHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function captchaSettingsHash(settings: SiteSettings): string {
  return captchaHash(JSON.stringify([settings.siteUrl, settings.captcha.provider, settings.captcha.siteKey, settings.captcha.secretKey]))
}

function ensureCaptchaConfigured(settings: SiteSettings): void {
  if (!settings.captcha.siteKey || !settings.captcha.secretKey || !Object.hasOwn(verifyUrls, settings.captcha.provider)
    || !isValidSiteUrl(settings.siteUrl)) {
    throw appError(503, 'CAPTCHA_UNAVAILABLE', '人机验证尚未配置完成，请联系管理员')
  }
}

function invalidCaptcha(): never {
  throw appError(403, 'CAPTCHA_INVALID', '验证码无效或已过期，请重新验证')
}

export async function createAuthCaptchaChallenge(email: string, action: CaptchaAction): Promise<CaptchaResponse> {
  const settings = getSiteSettings()
  if (!settings.captcha.enabled) return { enabled: false }
  ensureCaptchaConfigured(settings)

  const now = Date.now()
  const requestId = randomBytes(32).toString('hex')
  const { db, tables } = await getDb()
  const challenges = tables.authCaptchaChallenges
  await db.delete(challenges).where(lte(challenges.expiresAt, now))
  await db.insert(challenges).values({
    requestHash: captchaHash(`${action}:${requestId}`),
    emailHash: captchaHash(email),
    settingsHash: captchaSettingsHash(settings),
    expiresAt: now + 5 * 60_000,
  })

  return { enabled: true, action, provider: settings.captcha.provider, siteKey: settings.captcha.siteKey, requestId }
}

export async function verifyAuthCaptcha(email: string, proof: unknown, action: CaptchaAction): Promise<void> {
  const settings = getSiteSettings()
  if (!settings.captcha.enabled) return
  ensureCaptchaConfigured(settings)

  const input = proof && typeof proof === 'object' && !Array.isArray(proof) ? proof as Partial<CaptchaProof> : null
  if (!input || typeof input.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(input.requestId)
    || typeof input.token !== 'string' || !input.token.trim() || input.token.length > 16384) {
    throw appError(403, 'CAPTCHA_REQUIRED', '请先完成人机验证')
  }

  const requestHash = captchaHash(`${action}:${input.requestId}`)
  const emailHash = captchaHash(email)
  const settingsHash = captchaSettingsHash(settings)
  const { db, tables } = await getDb()
  const challenges = tables.authCaptchaChallenges
  const matchingChallenge = (now: number) => and(
    eq(challenges.requestHash, requestHash),
    eq(challenges.emailHash, emailHash),
    eq(challenges.settingsHash, settingsHash),
    isNull(challenges.consumedAt),
    gt(challenges.expiresAt, now),
  )
  const [challenge] = await db.select({ requestHash: challenges.requestHash }).from(challenges)
    .where(matchingChallenge(Date.now())).limit(1)
  if (!challenge) invalidCaptcha()

  const { provider, secretKey, siteKey } = settings.captcha
  let result: CaptchaVerification
  try {
    if (provider === 'botflush') {
      result = await $fetch<CaptchaVerification>(verifyUrls.botflush, {
        method: 'POST',
        body: { secret: secretKey, token: input.token, action, request_id: input.requestId },
        timeout: 10000,
        retry: 0,
        redirect: 'error',
      })
    } else {
      result = await $fetch<CaptchaVerification>(verifyUrls[provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secretKey, response: input.token }).toString(),
        timeout: 10000,
        retry: 0,
        redirect: 'error',
      })
    }
  } catch {
    throw appError(502, 'CAPTCHA_UNAVAILABLE', '验证码服务暂时不可用，请稍后重试')
  }

  if (result?.success !== true) invalidCaptcha()
  if (provider === 'botflush') {
    if ((result.site_key !== undefined && result.site_key !== siteKey)
      || (result.action !== undefined && result.action !== action)
      || (result.request_id !== undefined && result.request_id !== input.requestId)) invalidCaptcha()
  } else {
    if (typeof result.hostname !== 'string' || result.hostname.toLowerCase() !== new URL(settings.siteUrl).hostname.toLowerCase()) invalidCaptcha()
    if (provider === 'turnstile' && (result.action !== action || result.cdata !== input.requestId)) invalidCaptcha()
  }

  const now = Date.now()
  const [consumed] = await db.update(challenges).set({ consumedAt: now }).where(matchingChallenge(now))
    .returning({ requestHash: challenges.requestHash })
  if (!consumed) invalidCaptcha()
}
