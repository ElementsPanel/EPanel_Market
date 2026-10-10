import { requireAdminUser } from '../../utils/api-token'
import { getSiteSettings, toSiteSettingsView } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return toSiteSettingsView(getSiteSettings())
})
