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
    }
  },
  modules: [
    'vuetify-nuxt-module'
  ]
  // Vuetify 的全局配置见根目录 vuetify.config.ts
})
