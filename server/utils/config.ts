import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { AppConfig, SetupPayload } from '../../shared/types/setup'
import { appError } from './errors'
import { ensureDataDir, getConfigPath } from './paths'

export const DEFAULT_SQLITE_FILE = 'data/epanel.sqlite'

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

/** 后台密码由调用方先哈希：这里只负责组装配置，不碰明文。数据库固定 SQLite。 */
export function buildConfig(payload: SetupPayload, adminPasswordHash: string): AppConfig {
  return {
    version: 1,
    initializedAt: Date.now(),
    database: {
      driver: 'sqlite',
      sqlite: {
        file: payload.sqlite?.file?.trim() || DEFAULT_SQLITE_FILE,
      },
      // 初始化不再询问 PostgreSQL；这里留一份中性默认值，只有手工改配置的旧部署才会用到
      postgres: {
        host: '127.0.0.1',
        port: 5432,
        user: '',
        password: '',
        database: '',
        ssl: false,
      },
    },
    secret: randomBytes(32).toString('base64'),
    adminPasswordHash,
  }
}
