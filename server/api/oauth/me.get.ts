import { toAuthUser } from '../../services/users'
import { requireApiUser } from '../../utils/api-token'

// 面板用令牌确认连接仍然有效，并展示「已连接为 xxx」。

export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  return { user: await toAuthUser(user) }
})
