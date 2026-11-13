import type { SetupPayload } from '../../shared/types/setup'
import { createContext, getDb, resetDb } from './client'
import { ddlFor } from './ddl'
import { buildConfig, isInitialized, markInitialized, removeConfigFile, writeConfigAtomic } from '../utils/config'
import { appError } from '../utils/errors'
import { hashPassword } from '../utils/password'
import { issueAdminToken } from '../utils/admin'

export interface InitializeResult {
  token: string
}

export async function initializeApp(payload: SetupPayload): Promise<InitializeResult> {
  if (isInitialized()) throw appError(409, 'ALREADY_INITIALIZED', '应用已初始化')

  const config = buildConfig(payload, await hashPassword(payload.password))

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

  // ② 建表；任何一步失败都要回滚，让用户能回到 /setup 重填
  try {
    const context = await getDb()
    await context.execDdl(ddlFor(config.database.driver))
    markInitialized()
    return { token: issueAdminToken() }
  } catch (error) {
    resetDb()
    removeConfigFile()
    throw error
  }
}
