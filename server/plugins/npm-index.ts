import { npmSyncInterval, syncNpmIndex } from '../services/npm-plugins'

// 定时从 npm registry 拉取 epanel-plugin-* 包并写入本地索引。
// 市场不再托管插件包，索引只是 registry 元数据的一份缓存。

export default defineNitroPlugin(() => {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const schedule = (delay: number) => {
    timer = setTimeout(tick, delay)
    timer.unref?.()
  }

  async function tick() {
    if (stopped) return
    try {
      const result = await syncNpmIndex()
      console.info(`[npm-index] synced ${result.total} plugins`)
      schedule(npmSyncInterval())
    } catch (error: any) {
      // 初始化完成前数据库还不存在，稍后重试；其余失败按正常周期等待下一轮。
      if (error?.statusCode === 503 || error?.code === 'NOT_INITIALIZED') {
        schedule(60_000)
      } else {
        console.warn('[npm-index] sync failed:', error?.message ?? error)
        schedule(npmSyncInterval())
      }
    }
  }

  schedule(5_000)
})
