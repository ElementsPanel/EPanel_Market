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
  /** 会话 token 哈希使用的 pepper，初始化时随机生成 */
  secret: string
}

export interface SetupPayload {
  driver: DbDriver
  sqlite?: Partial<SqliteDbConfig>
  postgres?: Partial<PostgresDbConfig>
  admin: {
    email: string
    password: string
    displayName?: string
  }
}

export interface SetupStatus {
  initialized: boolean
  driver?: DbDriver
}
