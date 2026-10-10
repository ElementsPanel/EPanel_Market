import type { AppContext } from './client'

export async function migrateSchema(context: AppContext): Promise<void> {
  // 升级前的账户继续可用；新注册账户由 createUser 显式写入未验证状态。
  if (context.dialect === 'postgres') {
    await context.execDdl('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;')
    return
  }

  const columns = await context.raw<{ name: string }>('PRAGMA table_info(users)')
  if (columns.some(column => column.name === 'email_verified')) return
  try {
    await context.execDdl('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;')
  } catch (error) {
    const latest = await context.raw<{ name: string }>('PRAGMA table_info(users)')
    if (!latest.some(column => column.name === 'email_verified')) throw error
  }
}
