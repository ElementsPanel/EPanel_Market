import type { H3Event } from 'h3'
import type { UserRow } from '../services/users'
import { appError } from './errors'
import { resolveSessionUser } from './session'

/**
 * 控制台只认浏览器会话。管理员身份一律在服务端判定，前端的路由守卫只是提前跳转。
 */
export async function requireAdminUser(event: H3Event): Promise<UserRow> {
  const user = await resolveSessionUser(event)
  if (!user) throw appError(401, 'UNAUTHORIZED', '请先登录')
  if (!user.isAdmin) throw appError(403, 'FORBIDDEN', '只有管理员可以执行该操作')
  return user
}
