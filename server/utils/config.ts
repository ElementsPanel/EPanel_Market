import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { AppConfig, SetupPayload } from '../../shared/types/setup'
import { appError } from './errors'
import { ensureDataDir, getConfigPath } from './paths'

const DEFAULT_SQLITE_FILE = 'data/epanel.sqlite'

let cachedConfig: AppConfig | null = null
let initializedFlag: boolean | null = null

export function readConfig(): AppConfig {
  if (cachedConfig) return cachedConfig

  const file = getConfigPath()
  if (!existsSync(file)) throw appError(503, 'NOT_INITIALIZED', '应用尚未初始化')

  cachedConfig = JSON.parse(readFileSync(file, 'utf-8')) as AppConfig
  initializedFlag = true
  return cachedConfig
}

/** 只缓存 true：false 每次都查文件系统，便于用户手动放置配置后立即生效 */
export function isInitialized(): boolean {
  if (initializedFlag) return true
  return existsSync(getConfigPath())
}

export function markInitialized(): void {
  initializedFlag = true
}

export function removeConfigFile(): void {
  rmSync(getConfigPath(), { force: true })
  cachedConfig = null
  initializedFlag = null
}

export function writeConfigAtomic(config: AppConfig): void {
  ensureDataDir()

  const target = getConfigPath()
  const tmp = `${target}.tmp`
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  renameSync(tmp, target)
  chmodSync(target, 0o600)

  cachedConfig = config
  initializedFlag = true
}

export function buildConfig(payload: SetupPayload): AppConfig {
  const postgres = payload.postgres ?? {}

  return {
    version: 1,
    initializedAt: Date.now(),
    database: {
      driver: payload.driver,
      sqlite: {
        file: payload.sqlite?.file?.trim() || DEFAULT_SQLITE_FILE,
      },
      postgres: {
        host: postgres.host?.trim() || '127.0.0.1',
        port: postgres.port || 5432,
        user: postgres.user?.trim() || '',
        password: postgres.password ?? '',
        database: postgres.database?.trim() || '',
        ssl: postgres.ssl ?? false,
      },
    },
    secret: randomBytes(32).toString('base64'),
  }
}
