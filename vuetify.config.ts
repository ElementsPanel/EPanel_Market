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
    // variant 使用 filled：输入框/下拉框自带浅色背景且没有阴影，
    // filled 默认会带的那条底部横线由 app/assets/css/main.css 去掉
    VAutocomplete: { rounded: 'xl', variant: 'filled' },
    VBtn: { flat: true, rounded: 'xl' },
    VCombobox: { rounded: 'xl', variant: 'filled' },
    VField: { rounded: 'xl', variant: 'filled' },
    VFileInput: { rounded: 'xl', variant: 'filled' },
    VSelect: { rounded: 'xl', variant: 'filled' },
    VTextarea: { rounded: 'xl', variant: 'filled' },
    VTextField: { rounded: 'xl', variant: 'filled' }
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
