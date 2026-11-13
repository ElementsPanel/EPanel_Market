import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, getRequestURL, setCookie, type H3Event } from 'h3'
import { readConfig } from './config'
import { appError } from './errors'

/**
 * 控制台凭据。
 *
 * 项目没有用户体系：唯一的门是一枚后台密码，哈希存在 data/app-config.json。
 * 登录态是一个签名 Cookie——不落库，重启不掉线；改了密码后指纹变化，旧 Cookie 立即失效。
 */

const COOKIE_NAME = 'epanel_admin'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export function adminPasswordHash(): string {
  return readConfig().adminPasswordHash ?? ''
}

/** 密码哈希的短指纹，写进 Cookie 用来一次性作废旧会话 */
function fingerprint(): string {
  const hash = adminPasswordHash()
  return hash ? createHash('sha256').update(hash).digest('base64url').slice(0, 16) : ''
}

function sign(payload: string): string {
  return createHmac('sha256', readConfig().secret).update(payload).digest('base64url')
}

function matches(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function issueAdminToken(): string {
  const payload = Buffer.from(`${Date.now() + TTL_MS}.${fingerprint()}`, 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function setAdminCookie(event: H3Event, token = issueAdminToken()): void {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestURL(event).protocol === 'https:',
    maxAge: Math.floor(TTL_MS / 1000),
  })
}

export function clearAdminCookie(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function hasAdminSession(event: H3Event): boolean {
  const owner = fingerprint()
  if (!owner) return false

  const token = getCookie(event, COOKIE_NAME)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  if (!matches(signature, sign(payload))) return false

  const [expiresAt, tokenOwner] = Buffer.from(payload, 'base64url').toString('utf8').split('.')
  if (!expiresAt || Number(expiresAt) < Date.now()) return false
  return tokenOwner === owner
}

export function requireAdmin(event: H3Event): void {
  if (!hasAdminSession(event)) throw appError(401, 'UNAUTHORIZED', '请先输入后台密码')
}
