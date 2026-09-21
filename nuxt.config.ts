// https://nuxt.com/docs/api/configuration/nuxt-config
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
  css: ['~/assets/css/main.css']
  // Vuetify 的全局配置见根目录 vuetify.config.ts
})
