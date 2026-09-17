import type { SetupPayload } from '../../../shared/types/setup'
import { initializeApp } from '../../db/init'
import { appError } from '../../utils/errors'
import { resolveDataFile } from '../../utils/paths'
import { setSessionCookie } from '../../utils/session'
import { optionalText, requireEmail, requirePassword } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<SetupPayload>>(event)) ?? {}
  const driver = body.driver

  if (driver !== 'sqlite' && driver !== 'postgres') {
    throw appError(400, 'VALIDATION_ERROR', '请选择数据库类型')
  }

  const payload: SetupPayload = {
    driver,
    admin: {
      email: requireEmail(body.admin?.email),
      password: requirePassword(body.admin?.password),
      displayName: optionalText(body.admin?.displayName),
    },
  }

  if (driver === 'sqlite') {
    const file = body.sqlite?.file?.trim() || 'data/epanel.sqlite'
    try {
      resolveDataFile(file)
    } catch (error) {
      throw appError(400, 'VALIDATION_ERROR', (error as Error).message)
    }
    payload.sqlite = { file }
  } else {
    const pg = body.postgres ?? {}
    if (!pg.database?.trim()) throw appError(400, 'VALIDATION_ERROR', '请填写数据库名称')
    if (!pg.user?.trim()) throw appError(400, 'VALIDATION_ERROR', '请填写数据库用户名')
    payload.postgres = {
      host: pg.host?.trim() || '127.0.0.1',
      port: Number(pg.port) || 5432,
      user: pg.user.trim(),
      password: pg.password ?? '',
      database: pg.database.trim(),
      ssl: pg.ssl ?? false,
    }
  }

  const { user, token } = await initializeApp(payload)
  setSessionCookie(event, token)

  return { ok: true, user }
})
