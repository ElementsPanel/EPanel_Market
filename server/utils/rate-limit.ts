import { createHash } from 'node:crypto'
import { getRequestIP, setResponseHeader, type H3Event } from 'h3'
import { appError } from './errors'

const buckets = new Map<string, { count: number; expiresAt: number }>()
const MAX_BUCKETS = 10000

export function takeRateLimit(key: string, limit: number, seconds: number, now = Date.now()): number {
  const current = buckets.get(key)
  if (current && current.expiresAt > now) {
    if (current.count >= limit) return Math.ceil((current.expiresAt - now) / 1000)
    current.count++
    return 0
  }

  if (buckets.size >= MAX_BUCKETS) {
    for (const [name, bucket] of buckets) {
      if (bucket.expiresAt <= now) buckets.delete(name)
    }
    if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) return 60
  }
  buckets.set(key, { count: 1, expiresAt: now + seconds * 1000 })
  return 0
}

function enforceBucket(event: H3Event, key: string, limit: number, seconds: number): void {
  const retryAfter = takeRateLimit(key, limit, seconds)
  if (!retryAfter) return
  setResponseHeader(event, 'Retry-After', retryAfter)
  throw appError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试')
}

export function enforceRateLimit(event: H3Event, scope: string, limit: number, seconds: number): void {
  enforceBucket(event, `${scope}:${getRequestIP(event) ?? 'unknown'}`, limit, seconds)
}

export function enforceMailRateLimit(event: H3Event, email: string): void {
  enforceRateLimit(event, 'verification-mail', 30, 3600)
  const address = createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
  enforceBucket(event, `verification-cooldown:${address}`, 1, 60)
  enforceBucket(event, `verification-address:${address}`, 5, 3600)
}
