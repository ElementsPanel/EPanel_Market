import type { SetupPayload } from '../../../shared/types/setup'
import { initializeApp } from '../../db/init'
import { setAdminCookie } from '../../utils/admin'
import { DEFAULT_SQLITE_FILE } from '../../utils/config'
import { appError } from '../../utils/errors'
import { resolveDataFile } from '../../utils/paths'
import { requirePassword } from '../../utils/validation'

// 初始化不再询问数据库类型：固定 SQLite，只需要一枚后台密码。
export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<SetupPayload>>(event)) ?? {}

  const file = body.sqlite?.file?.trim() || DEFAULT_SQLITE_FILE
  try {
    resolveDataFile(file)
  } catch (error) {
    throw appError(400, 'VALIDATION_ERROR', (error as Error).message)
  }

  const { token } = await initializeApp({ password: requirePassword(body.password), sqlite: { file } })
  setAdminCookie(event, token)

  return { ok: true }
})
