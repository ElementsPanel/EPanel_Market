import { clearAdminCookie } from '../../utils/admin'

export default defineEventHandler((event) => {
  clearAdminCookie(event)
  return { ok: true }
})
