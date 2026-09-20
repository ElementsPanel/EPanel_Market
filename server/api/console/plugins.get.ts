import { listConsolePlugins } from '../../services/plugins'
import { requireAdminUser } from '../../utils/api-token'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  return { items: await listConsolePlugins() }
})
