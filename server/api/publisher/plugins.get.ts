import { listPublisherPlugins } from '../../services/plugins'
import { requireApiUser } from '../../utils/api-token'

// 面板「我的提交」：作者本人的插件与各版本的审核状态。

export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  return { items: await listPublisherPlugins(user.id) }
})
