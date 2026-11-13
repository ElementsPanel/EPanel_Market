import { adminPasswordHash, hasAdminSession } from '../../../utils/admin'

// 控制台入口只问两件事：这张 Cookie 还有效吗、后台密码设过没有。
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    authenticated: hasAdminSession(event),
    hasPassword: Boolean(adminPasswordHash()),
  }
})
