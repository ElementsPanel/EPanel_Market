import { requireAdminUser } from '../../utils/api-token'
import { getSiteSettings, parseSiteSettings, saveSiteSettings, toSiteSettingsView } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const settings = parseSiteSettings(await readBody(event), getSiteSettings())
  saveSiteSettings(settings)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return toSiteSettingsView(settings)
})
