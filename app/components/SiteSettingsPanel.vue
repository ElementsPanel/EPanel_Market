<script setup lang="ts">
import type { SiteSettings, SiteSettingsView } from '../../shared/types/settings'
import { createDefaultSiteSettings } from '../../shared/utils/mail'
import { apiErrorMessage } from '../utils/apiError'

const toast = useToast()
const origin = useRequestURL().origin
const saved = ref<SiteSettingsView | null>(null)
const settings = ref<SiteSettings>(createDefaultSiteSettings())
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const busy = computed(() => saving.value || testing.value)

function applySettings(value: SiteSettingsView) {
  saved.value = value
  settings.value = {
    siteUrl: value.siteUrl || origin,
    mail: { ...value.mail, apiKey: '', smtpPassword: '' },
  }
}

async function load() {
  loading.value = true
  try {
    applySettings(await $fetch<SiteSettingsView>('/api/console/settings'))
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function save() {
  if (busy.value) return
  saving.value = true
  try {
    applySettings(await $fetch<SiteSettingsView>('/api/console/settings', { method: 'PUT', body: settings.value, retry: 0 }))
    toast.success('邮件设置已保存并生效')
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function testEmail() {
  if (busy.value) return
  testing.value = true
  try {
    const result = await $fetch<{ message: string }>('/api/console/settings/test-email', { method: 'POST', body: settings.value, retry: 0 })
    toast.success(result.message)
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="site-settings">
    <v-progress-linear v-if="loading" indeterminate />
    <v-card v-else-if="!saved" class="text-center py-8">
      <div class="text-body-2 text-medium-emphasis mb-4">暂时无法加载邮件设置</div>
      <v-btn variant="text" @click="load">重试</v-btn>
    </v-card>

    <v-form v-else :disabled="busy" @submit.prevent="save">
      <v-card class="mb-4">
        <v-card-title class="text-h6">站点地址</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="settings.siteUrl"
            label="站点对外地址"
            placeholder="https://market.example.com"
            hint="用于邮件中的邮箱验证链接，请填写用户能够访问的完整站点地址。"
            persistent-hint
            maxlength="2048"
            required
          />
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">邮件发送</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">配置邮件服务后，访客可通过验证邮箱完成注册。已保存的密码与密钥不会显示，连接设置不变时可留空保留。</p>
          <MailSettingsForm v-model="settings.mail" :saved="saved.mail" :disabled="busy" />
        </v-card-text>
      </v-card>

      <div class="d-flex flex-wrap ga-3">
        <v-btn type="submit" color="primary" :loading="saving" :disabled="busy">保存设置</v-btn>
        <v-btn type="button" variant="tonal" prepend-icon="mdi-email-fast-outline" :loading="testing" :disabled="busy" @click="testEmail">
          发送测试邮件
        </v-btn>
      </div>
      <p class="text-body-2 text-medium-emphasis mt-3">测试邮件使用当前填写的配置，发送到你登录的管理员邮箱。</p>
    </v-form>
  </div>
</template>

<style scoped>
.site-settings {
  max-width: 880px;
}
</style>
