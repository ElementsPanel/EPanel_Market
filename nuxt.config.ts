// https://nuxt.com/docs/api/configuration/nuxt-config
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sharedDir = fileURLToPath(new URL('./shared', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: {
    port: 4500
  },
  nitro: {
    // 让 ORM 与数据库驱动走 external，避免被打包时内联导致动态 require 失败
    externals: {
      external: ['drizzle-orm', 'pg']
    },
    rollupConfig: {
      onwarn(warning, warn) {
        // node:sqlite 是较新的 Node 内置模块，Nitro 用来判断「是不是内置模块」的 mlly
        // 还不认识它（Node 的 module.builtinModules 里也没有 sqlite），于是 rollup 报一次
        // 「无法解析，按外部依赖处理」。按外部依赖处理正是我们要的结果——node:sqlite 就该
        // 是运行时外部的，所以只把这一条已知告警放过去，其余仍然照常输出。
        if (warning.code === 'UNRESOLVED_IMPORT' && warning.exporter === 'node:sqlite') return
        warn(warning)
      }
    }
  },
  vuetify: {
    moduleOptions: {
      // Vuetify 也导出 useLayout，会和 Nuxt 内置的 useLayout 撞名（Nuxt 会警告内置的
      // 被忽略）。本项目没有用 Vuetify 的这些组合式函数，直接关掉自动导入，需要时按
      // `import { useDisplay } from 'vuetify'` 显式引入。
      importComposables: false
    }
  },
  modules: [
    'vuetify-nuxt-module'
  ],
  css: ['~/assets/css/main.css'],
  hooks: {
    // Nuxt 会把 shared/ 目录在 SSR 构建里标成 external，交给 nitro 去解析。但 rolldown
    // 渲染这些绝对路径时会算错相对层级（产物 chunk 放在 dist/server/_nuxt/ 下，它却按
    // dist/ 计算），nitro 打包时就找不到文件，报
    // "Could not resolve '../../../../../shared/utils/avatar.ts'"。
    // 这里去掉 shared 的 external 规则，让它和客户端构建一样直接内联进 SSR 产物。
    // 代价是服务端会存在两份 shared/ 代码（nitro 侧与 SSR 侧各一份），本项目 shared/
    // 里只有类型和常量，没有共享状态，不受影响。
    'vite:extendConfig'(config, { isServer }) {
      if (!isServer) return

      // Nuxt 的那条 external 规则是 shared 目录的绝对路径前缀正则，用目录里的一个
      // 假路径就能把它试出来
      const sharedProbe = join(sharedDir, 'probe')
      const environments = (config as unknown as { environments?: Record<string, { build?: unknown }> }).environments ?? {}
      const builds: unknown[] = [config.build, ...Object.values(environments).map(environment => environment?.build)]

      for (const build of builds) {
        const options = (build as { rolldownOptions?: { external?: unknown[] } })?.rolldownOptions
          ?? (build as { rollupOptions?: { external?: unknown[] } })?.rollupOptions
        if (!options || !Array.isArray(options.external)) continue

        options.external = options.external.filter(
          entry => entry !== '#shared' && !(entry instanceof RegExp && entry.test(sharedProbe))
        )
      }
    }
  }
  // Vuetify 的全局配置见根目录 vuetify.config.ts
})
