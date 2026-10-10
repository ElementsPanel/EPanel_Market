<script setup lang="ts">
import type { CaptchaSettings, CaptchaSettingsView } from '../../shared/types/captcha'
import { CAPTCHA_PROVIDERS } from '../../shared/utils/captcha'

const model = defineModel<CaptchaSettings>({ required: true })
const props = defineProps<{ saved?: CaptchaSettingsView, disabled?: boolean }>()
const canKeepSecret = computed(() => props.saved?.hasSecretKey && props.saved.provider === model.value.provider
  && props.saved.siteKey === model.value.siteKey.trim())
const required = (value: unknown) => Boolean(String(value ?? '').trim()) || '此项不能为空'

function changeProvider() {
  model.value.siteKey = ''
  model.value.secretKey = ''
}
</script>

<template>
  <div>
    <v-switch
      v-model="model.enabled"
      label="启用登录和注册人机验证"
      color="primary"
      :disabled="disabled"
      hide-details
      class="mb-4"
    />
    <p class="text-body-2 text-medium-emphasis mb-4">启用后，用户提交登录或注册信息时会弹出独立的验证窗口，验证通过后继续操作。</p>

    <v-expand-transition>
      <div v-if="model.enabled">
        <v-select
          v-model="model.provider"
          label="验证码服务商"
          :items="CAPTCHA_PROVIDERS"
          :disabled="disabled"
          @update:model-value="changeProvider"
        />
        <v-alert v-if="model.provider === 'recaptcha'" type="info" variant="tonal" density="comfortable" class="mb-4">
          请使用 reCAPTCHA v2 的“我不是机器人”复选框密钥。
        </v-alert>
        <v-text-field
          v-model="model.siteKey"
          label="站点密钥（Site Key）"
          autocomplete="off"
          maxlength="1024"
          :rules="[required]"
          :disabled="disabled"
          hint="请在服务商控制台添加本站域名，与上方站点对外地址保持一致。"
          persistent-hint
          required
          class="mb-4"
        />
        <v-text-field
          v-model="model.secretKey"
          label="服务端密钥（Secret Key）"
          type="password"
          autocomplete="new-password"
          maxlength="4096"
          :placeholder="canKeepSecret ? '已保存，留空保留原密钥' : '输入服务端密钥'"
          :rules="canKeepSecret ? [] : [required]"
          :disabled="disabled"
          :required="!canKeepSecret"
          hint="密钥不会返回到浏览器；服务商和站点密钥不变时，留空可保留已保存的密钥。"
          persistent-hint
        />
      </div>
    </v-expand-transition>
  </div>
</template>
