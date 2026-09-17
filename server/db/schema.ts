import type { DbDriver } from '../../shared/types/setup'
import * as pgSchema from './schema.pg'
import * as sqliteSchema from './schema.sqlite'

/** 规范类型取 pg 形态，sqlite 实例在 client.ts 里做唯一一次断言 */
export type AppTables = typeof pgSchema

export function tablesFor(driver: DbDriver): AppTables {
  return (driver === 'sqlite' ? sqliteSchema : pgSchema) as unknown as AppTables
}
