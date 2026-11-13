export type DbDriver = 'sqlite' | 'postgres'

export interface SqliteDbConfig {
  file: string
}

export interface PostgresDbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

export interface AppConfig {
  version: 1
  initializedAt: number
  database: {
    driver: DbDriver
    sqlite: SqliteDbConfig
    postgres: PostgresDbConfig
  }
  /** 后台会话 Cookie 的签名密钥，初始化时随机生成 */
  secret: string
  /** 控制台后台密码的 scrypt 哈希。早期版本的配置可能没有这一项。 */
  adminPasswordHash?: string
}

export interface SetupPayload {
  /** 控制台后台密码，初始化后唯一的进入凭据 */
  password: string
  /** 高级用法：手工指定 sqlite 文件路径，默认 data/epanel.sqlite */
  sqlite?: Partial<SqliteDbConfig>
}

export interface SetupStatus {
  initialized: boolean
  /** 已初始化但还没设过后台密码（旧版本配置升上来时的状态） */
  needsPassword: boolean
}
