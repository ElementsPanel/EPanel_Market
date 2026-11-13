import { adminPasswordHash, setAdminCookie } from '../../utils/admin'
import { appError } from '../../utils/errors'
import { verifyPassword } from '../../utils/password'
import { enforceRateLimit } from '../../utils/rate-limit'

// 控制台唯一的登录方式：输入后台密码。失败按 IP 限流，防爆破。
export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'console-login', 10, 900)

  const body = (await readBody<{ password?: string }>(event)) ?? {}
  const hash = adminPasswordHash()
  if (!hash) throw appError(409, 'CONFLICT', '尚未设置后台密码')

  if (typeof body.password !== 'string' || !(await verifyPassword(body.password, hash))) {
    throw appError(401, 'INVALID_CREDENTIALS', '后台密码不正确')
  }

  setAdminCookie(event)
  return { ok: true }
})
