import { DatabaseSync } from 'node:sqlite'
import { Pool } from 'pg'
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import type { AppConfig, DbDriver } from '../../shared/types/setup'
import { readConfig } from '../utils/config'
import { resolveDataFile } from '../utils/paths'
import { ddlFor } from './ddl'
import { tablesFor, type AppTables } from './schema'

/**
 * 数据库统一类型：以 pg 形态为规范面，sqlite 实例在 createSqlite 里做唯一一次断言。
 * 业务层因此只需写一份查询代码（select/insert/update/delete + where/returning/limit）。
 *
 * 注意：不要使用方言特有能力（db.execute / db.run、db.transaction、sql`now()`、RQB 的 db.query.*），
 * 原生 SQL 一律走 AppContext 上的 raw() / execDdl()。
 */
export type AppDb = NodePgDatabase

export interface AppContext {
  dialect: DbDriver
  db: AppDb
  tables: AppTables
  /** 执行多语句 DDL */
  execDdl(ddl: string): Promise<void>
  raw<T = Record<string, unknown>>(sqlText: string): Promise<T[]>
  /** 关闭底层连接（仅用于初始化探活，单例不调用） */
  close(): Promise<void>
}

let cachedContext: AppContext | null = null
let schemaReady: Promise<void> | null = null

/**
 * 建表语句是幂等的（CREATE TABLE IF NOT EXISTS），所以每次启动都跑一遍：
 * 没有迁移工具，这是已初始化的库拿到新表的唯一途径。同一个进程只跑一次。
 */
function ensureSchema(context: AppContext): Promise<void> {
  if (!schemaReady) {
    schemaReady = context.execDdl(ddlFor(context.dialect)).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

export async function getDb(): Promise<AppContext> {
  if (!cachedContext) {
    // readConfig 在未初始化时抛出 NOT_INITIALIZED
    cachedContext = createContext(readConfig())
  }
  await ensureSchema(cachedContext)
  return cachedContext
}

export function createContext(config: AppConfig): AppContext {
  const dialect = config.database.driver
  const tables = tablesFor(dialect)

  if (dialect === 'sqlite') {
    const file = resolveDataFile(config.database.sqlite.file)
    const client = new DatabaseSync(file)
    client.exec('PRAGMA journal_mode = WAL;')
    client.exec('PRAGMA foreign_keys = ON;')

    return {
      dialect,
      db: drizzleSqlite({ client }) as unknown as AppDb,
      tables,
      execDdl: async (ddl: string) => {
        client.exec(ddl)
      },
      raw: async <T>(sqlText: string): Promise<T[]> => client.prepare(sqlText).all() as T[],
      close: async () => {
        client.close()
      },
    }
  }

  const pg = config.database.postgres
  const pool = new Pool({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.database,
    ssl: pg.ssl ? { rejectUnauthorized: false } : undefined,
  })

  return {
    dialect,
    db: drizzlePg({ client: pool }) as unknown as AppDb,
    tables,
    execDdl: async (ddl: string) => {
      await pool.query(ddl)
    },
    raw: async <T>(sqlText: string): Promise<T[]> => (await pool.query(sqlText)).rows as T[],
    close: async () => {
      await pool.end()
    },
  }
}

export function resetDb(): void {
  cachedContext = null
  schemaReady = null
}
