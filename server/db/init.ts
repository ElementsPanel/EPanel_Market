import type { AuthUser } from '../../shared/types/auth'
import type { SetupPayload } from '../../shared/types/setup'
import { createContext, getDb, resetDb } from './client'
import { ddlFor } from './ddl'
import { createUser, findUserByEmail, toAuthUser } from '../services/users'
import { buildConfig, isInitialized, markInitialized, removeConfigFile, writeConfigAtomic } from '../utils/config'
import { appError } from '../utils/errors'
import { createSession } from '../utils/session'

export interface InitializeResult {
  user: AuthUser
  token: string
}

export async function initializeApp(payload: SetupPayload): Promise<InitializeResult> {
  if (isInitialized()) throw appError(409, 'ALREADY_INITIALIZED', '应用已初始化')

  const config = buildConfig(payload)

  // ① 先探活，失败则不落盘，避免留下半成品配置
  const probe = createContext(config)
  try {
    await probe.raw('SELECT 1')
  } catch (error) {
    throw appError(500, 'DB_CONNECTION_FAILED', `数据库连接失败：${(error as Error).message}`)
  } finally {
    await probe.close()
  }

  writeConfigAtomic(config)

  // ② 建表 + 创建管理员；任何一步失败都要回滚，让用户能回到 /setup 重填
  try {
    const context = await getDb()
    await context.execDdl(ddlFor(config.database.driver))

    if (await findUserByEmail(payload.admin.email)) {
      throw appError(409, 'EMAIL_TAKEN', '该邮箱已被注册')
    }

    const user = await createUser({
      email: payload.admin.email,
      password: payload.admin.password,
      displayName: payload.admin.displayName,
      isAdmin: true,
    })

    const token = await createSession(user.id)
    markInitialized()

    return { user: toAuthUser(user), token }
  } catch (error) {
    resetDb()
    removeConfigFile()
    throw error
  }
}
