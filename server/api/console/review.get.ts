import { listReviewQueue } from '../../services/plugins'
import { requireAdminUser } from '../../utils/api-token'

// 审核队列：所有 status 为 pending 的版本。

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  return { items: await listReviewQueue() }
})
