import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

// 128 * N * r = 16MB，低于 maxmem 默认值 32MB
const COST = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 64

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(plain, salt, KEY_LENGTH, COST)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false

  const key = await scryptAsync(plain, Buffer.from(saltB64, 'base64'), KEY_LENGTH, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  const expected = Buffer.from(keyB64, 'base64')

  return key.length === expected.length && timingSafeEqual(key, expected)
}
