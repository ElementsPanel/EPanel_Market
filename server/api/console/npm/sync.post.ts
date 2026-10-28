import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'
import { syncNpmIndex } from '../../../services/npm-plugins'

// 管理员手动触发一次 npm 索引同步，不必等待定时任务。

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  try {
    return await syncNpmIndex()
  } catch (error: any) {
    // 同步在拉取 registry 或写库失败时抛的是裸 Error，直接透传会变成
    // 前端看不懂的 500「网络错误」。这里记下完整堆栈，并把原因带给 toast。
    console.error('[npm-sync] 手动同步失败:', error?.stack ?? error)
    throw appError(500, 'SYNC_FAILED', `同步失败：${error?.message ?? '未知错误'}`)
  }
})
