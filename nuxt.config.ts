// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: {
    port: 4500
  },
  modules: [
    'vuetify-nuxt-module'
  ],
  vuetify: {
    vuetifyOptions: {
      icons: {
        defaultSet: 'mdi'
      },
      theme: {
        defaultTheme: 'light'
      }
    }
  }
})
