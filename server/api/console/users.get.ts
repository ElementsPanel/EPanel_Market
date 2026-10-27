import { listUsers } from '../../services/users'
import { requireAdminUser } from '../../utils/api-token'
import type { ConsoleUserItem } from '../../../shared/types/console'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const users = await listUsers()
  const items: ConsoleUserItem[] = users.map(user => ({
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  }))

  return { items }
})
