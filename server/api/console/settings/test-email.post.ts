import { requireAdminUser } from '../../../utils/api-token'
import { sendTestEmail } from '../../../utils/email'
import { enforceRateLimit } from '../../../utils/rate-limit'
import { getSiteSettings, parseSiteSettings } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event)
  enforceRateLimit(event, `test-email:${admin.id}`, 5, 900)
  const settings = parseSiteSettings(await readBody(event), getSiteSettings())
  await sendTestEmail(admin.email, settings.mail)
  return { message: `测试邮件已发送至 ${admin.email}，请检查收件箱` }
})
