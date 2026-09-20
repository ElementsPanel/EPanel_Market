import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'

export interface AvatarRecord {
  contentType: string
  data: Buffer
  version: string
}

/** 只要版本号，用来答复「有没有头像」和给前端做缓存参数，不碰二进制。 */
export async function findAvatarVersion(userId: string): Promise<string | null> {
  const { db, tables } = await getDb()
  const rows = await db
    .select({ version: tables.userAvatars.version })
    .from(tables.userAvatars)
    .where(eq(tables.userAvatars.userId, userId))
    .limit(1)

  return rows[0]?.version ?? null
}

/** 显式挑列：这张表最大 Blob 有 2MB，裸 select 会把它整体拖出来。 */
export async function findUserAvatar(userId: string): Promise<AvatarRecord | null> {
  const { db, tables } = await getDb()
  const rows = await db
    .select({
      contentType: tables.userAvatars.contentType,
      data: tables.userAvatars.data,
      version: tables.userAvatars.version,
    })
    .from(tables.userAvatars)
    .where(eq(tables.userAvatars.userId, userId))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return { contentType: row.contentType, data: Buffer.from(row.data), version: row.version }
}

export async function setUserAvatar(
  userId: string,
  avatar: { data: Buffer, contentType: string, version: string },
): Promise<void> {
  const { db, tables } = await getDb()
  const updatedAt = Date.now()

  await db.insert(tables.userAvatars).values({
    userId,
    contentType: avatar.contentType,
    data: avatar.data,
    version: avatar.version,
    updatedAt,
  }).onConflictDoUpdate({
    target: tables.userAvatars.userId,
    set: {
      contentType: avatar.contentType,
      data: avatar.data,
      version: avatar.version,
      updatedAt,
    },
  })
}

export async function deleteUserAvatar(userId: string): Promise<void> {
  const { db, tables } = await getDb()
  await db.delete(tables.userAvatars).where(eq(tables.userAvatars.userId, userId))
}
