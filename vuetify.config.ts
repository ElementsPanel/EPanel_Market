import type { VuetifyOptions } from 'vuetify'

/**
 * 全局 Vuetify 配置（会被 vuetify-nuxt-module 自动加载）。
 * defaults 里的值为组件级默认 prop，所有页面复用同一套外观，无需逐处传参。
 * https://vuetifyjs.com/en/features/global-configuration/
 */
export default {
  defaults: {
    VAppBar: {
      color: 'app-header',
      flat: true
    },
    VDialog: {
      scrim: 'rgba(0, 0, 0, 0.48)',
      scrollable: true
    },
    VCard: {
      rounded: 'xl',
      elevation: 0
    },
    // variant 使用 solo：输入框/下拉框不带底部横线，配合 flat + rounded 呈胶囊状
    VAutocomplete: { flat: true, rounded: 'xl', variant: 'solo' },
    VBtn: { flat: true, rounded: 'xl' },
    VCombobox: { flat: true, rounded: 'xl', variant: 'solo' },
    VField: { flat: true, rounded: 'xl', variant: 'solo' },
    VFileInput: { flat: true, rounded: 'xl', variant: 'solo' },
    VSelect: { flat: true, rounded: 'xl', variant: 'solo' },
    VTextarea: { flat: true, rounded: 'xl', variant: 'solo' },
    VTextField: { flat: true, rounded: 'xl', variant: 'solo' }
  },
  icons: {
    defaultSet: 'mdi'
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          'app-header': '#EEEEEE'
        }
      },
      dark: {
        colors: {
          'app-header': '#1E1E24'
        }
      }
    }
  }
} satisfies VuetifyOptions
