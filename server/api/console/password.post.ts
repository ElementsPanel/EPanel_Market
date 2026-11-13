import { adminPasswordHash, hasAdminSession, setAdminCookie } from '../../utils/admin'
import { readConfig, writeConfigAtomic } from '../../utils/config'
import { appError } from '../../utils/errors'
import { hashPassword, verifyPassword } from '../../utils/password'
import { enforceRateLimit } from '../../utils/rate-limit'
import { requirePassword } from '../../utils/validation'

/**
 * 设置 / 修改后台密码。
 *
 * 还没设过密码时（旧配置）允许直接设一次；设过之后必须已登录并提供当前密码。
 * 写盘后指纹变化，其他设备上的旧 Cookie 全部失效，当前设备换一张新的。
 */
export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'console-password', 10, 900)

  const body = (await readBody<{ password?: string; currentPassword?: string }>(event)) ?? {}
  const hash = adminPasswordHash()

  if (hash) {
    if (!hasAdminSession(event)) throw appError(401, 'UNAUTHORIZED', '请先输入后台密码')
    if (typeof body.currentPassword !== 'string' || !(await verifyPassword(body.currentPassword, hash))) {
      throw appError(401, 'INVALID_CREDENTIALS', '当前密码不正确')
    }
  }

  const next = requirePassword(body.password)
  writeConfigAtomic({ ...readConfig(), adminPasswordHash: await hashPassword(next) })
  setAdminCookie(event)

  return { ok: true }
})
