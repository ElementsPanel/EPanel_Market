import { reviewVersion } from '../../../services/plugins'
import { requireAdminUser } from '../../../utils/api-token'
import { appError } from '../../../utils/errors'

// 通过 / 驳回。驳回需要理由，面板的作者会在「我的提交」里看到。

export default defineEventHandler(async (event) => {
  const reviewer = await requireAdminUser(event)
  const versionId = String(getRouterParam(event, 'versionId') ?? '').trim()
  if (!versionId) throw appError(400, 'VALIDATION_ERROR', '缺少版本标识')

  const body = (await readBody<{ action?: string; note?: string }>(event)) ?? {}
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null
  if (!action) throw appError(400, 'VALIDATION_ERROR', '审核动作必须是 approve 或 reject')
  if (action === 'reject' && !String(body.note ?? '').trim()) {
    throw appError(400, 'VALIDATION_ERROR', '驳回时必须填写理由')
  }

  await reviewVersion({
    versionId,
    action,
    note: body.note,
    reviewerId: reviewer.id,
  })

  return { ok: true }
})
