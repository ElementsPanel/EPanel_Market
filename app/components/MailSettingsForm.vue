<script setup lang="ts">
import type { MailSettings, MailSettingsView } from '../../shared/types/settings'
import { createDefaultMailSettings } from '../../shared/utils/mail'

const model = defineModel<MailSettings>({ required: true })
const props = defineProps<{ saved?: MailSettingsView; disabled?: boolean }>()

const transports = [{ title: 'API', value: 'api' }, { title: 'SMTP', value: 'smtp' }]
const presets = [{ title: 'Resend', value: 'resend' }, { title: '自定义', value: 'custom' }]
const securityOptions = [
  { title: 'SSL / TLS', value: 'tls' },
  { title: 'STARTTLS', value: 'starttls' },
  { title: '不加密', value: 'none' },
]
const canKeepApiKey = computed(() => props.saved?.hasApiKey && props.saved.transport === 'api'
  && props.saved.apiUrl === model.value.apiUrl)
const canKeepSmtpPassword = computed(() => props.saved?.hasSmtpPassword && props.saved.transport === 'smtp'
  && props.saved.smtpHost === model.value.smtpHost && props.saved.smtpPort === Number(model.value.smtpPort)
  && props.saved.smtpSecurity === model.value.smtpSecurity && props.saved.smtpUsername === model.value.smtpUsername)

function applyPreset() {
  if (model.value.preset !== 'resend') return
  const defaults = createDefaultMailSettings()
  Object.assign(model.value, {
    apiUrl: defaults.apiUrl,
    smtpHost: defaults.smtpHost,
    smtpPort: defaults.smtpPort,
    smtpSecurity: defaults.smtpSecurity,
    smtpUsername: defaults.smtpUsername,
  })
}

function changeSecurity() {
  model.value.smtpPort = model.value.smtpSecurity === 'tls' ? 465 : model.value.smtpSecurity === 'starttls' ? 587 : 25
}
</script>

<template>
  <div>
    <v-row>
      <v-col cols="12" sm="6">
        <v-select v-model="model.transport" label="邮件发送方式" :items="transports" :disabled="disabled" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-select v-model="model.preset" label="服务预设" :items="presets" :disabled="disabled" @update:model-value="applyPreset" />
      </v-col>
    </v-row>

    <v-text-field
      v-model="model.from"
      label="发件人"
      placeholder="EPanel Market <hello@example.com>"
      :hint="model.preset === 'resend' ? '请使用 Resend 已验证域名下的邮箱；onboarding@resend.dev 仅可发送给 Resend 账户邮箱。' : '支持 邮箱 或 名称 <邮箱> 格式。'"
      persistent-hint
      :disabled="disabled"
      maxlength="320"
      class="mb-4"
      required
    />

    <template v-if="model.transport === 'api'">
      <v-text-field
        v-model="model.apiUrl"
        label="API 地址"
        :readonly="model.preset === 'resend'"
        :disabled="disabled"
        :hint="model.preset === 'custom' ? '自定义接口需兼容 Resend 的 JSON 发送格式，使用 Bearer 密钥认证。' : undefined"
        persistent-hint
        maxlength="2048"
        class="mb-4"
        required
      />
      <v-text-field
        v-model="model.apiKey"
        label="API 密钥"
        type="password"
        autocomplete="new-password"
        :placeholder="canKeepApiKey ? '已保存，留空保留原密钥' : '输入 API 密钥'"
        :disabled="disabled"
        maxlength="4096"
        :required="!canKeepApiKey"
      />
    </template>

    <template v-else>
      <v-row>
        <v-col cols="12" sm="8">
          <v-text-field
            v-model="model.smtpHost"
            label="SMTP 主机"
            placeholder="smtp.example.com"
            :readonly="model.preset === 'resend'"
            :disabled="disabled"
            maxlength="253"
            required
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field v-model.number="model.smtpPort" label="端口" type="number" min="1" max="65535" :disabled="disabled" required />
        </v-col>
      </v-row>
      <v-select v-model="model.smtpSecurity" label="连接加密" :items="securityOptions" :disabled="disabled" @update:model-value="changeSecurity" />
      <v-text-field
        v-model="model.smtpUsername"
        label="SMTP 用户名"
        autocomplete="off"
        :readonly="model.preset === 'resend'"
        :disabled="disabled"
        maxlength="320"
      />
      <v-text-field
        v-model="model.smtpPassword"
        :label="model.preset === 'resend' ? 'SMTP 密码（Resend API 密钥）' : 'SMTP 密码'"
        type="password"
        autocomplete="new-password"
        :placeholder="canKeepSmtpPassword ? '已保存，留空保留原密码' : '输入 SMTP 密码'"
        :disabled="disabled"
        :hint="model.preset === 'custom' ? '无需认证的 SMTP 服务可同时留空用户名和密码。' : undefined"
        persistent-hint
        maxlength="4096"
      />
    </template>
  </div>
</template>
