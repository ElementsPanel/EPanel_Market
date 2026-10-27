import { requireAdminUser } from '../../../utils/api-token'
import { syncNpmIndex } from '../../../services/npm-plugins'

// 管理员手动触发一次 npm 索引同步，不必等待定时任务。

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  return await syncNpmIndex()
})
