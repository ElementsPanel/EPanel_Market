import { listUsers } from '../../services/users'
import { requireAdminUser } from '../../utils/api-token'
import { countPluginsOf } from '../../services/plugins'
import type { ConsoleUserItem } from '../../../shared/types/console'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const users = await listUsers()
  const items: ConsoleUserItem[] = await Promise.all(
    users.map(async (user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      pluginCount: await countPluginsOf(user.id),
    }))
  )

  return { items }
})
