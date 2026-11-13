import type { SetupStatus } from '../../../shared/types/setup'
import { isInitialized, readConfig } from '../../utils/config'

export default defineEventHandler((): SetupStatus => {
  const initialized = isInitialized()
  const config = initialized ? readConfig() : null
  return {
    initialized,
    driver: config?.database.driver,
    // 旧版本的配置里没有后台密码，控制台会先引导设一次
    needsPassword: Boolean(config && !config.adminPasswordHash),
  }
})
