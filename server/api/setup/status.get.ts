import type { SetupStatus } from '../../../shared/types/setup'
import { isInitialized, readConfig } from '../../utils/config'

export default defineEventHandler((): SetupStatus => {
  const initialized = isInitialized()
  return {
    initialized,
    driver: initialized ? readConfig().database.driver : undefined,
  }
})
