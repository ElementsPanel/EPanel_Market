<script setup lang="ts">
import type { CaptchaChallenge, CaptchaProof } from '../../shared/types/captcha'

defineProps<{ challenge: CaptchaChallenge | null, verifying: boolean, refreshing: boolean, error: string }>()
const emit = defineEmits<{
  verified: [proof: CaptchaProof]
  error: [message: string]
  retry: []
  cancel: []
}>()
</script>

<template>
  <v-dialog
    :model-value="Boolean(challenge)"
    max-width="420"
    class="captcha-dialog"
    :scrim="true"
    :scrollable="false"
    :persistent="verifying"
    :close-on-back="false"
    :retain-focus="challenge?.provider === 'turnstile'"
    :capture-focus="false"
    aria-labelledby="auth-captcha-title"
    @update:model-value="value => { if (!value && !verifying) emit('cancel') }"
  >
    <v-card class="captcha-dialog__card">
      <v-card-item>
        <v-card-title id="auth-captcha-title" class="text-h5">安全验证</v-card-title>
      </v-card-item>
      <v-card-text class="pt-4">
        <div v-if="refreshing" class="d-flex align-center justify-center ga-3 py-5" role="status">
          <v-progress-circular indeterminate size="24" width="2" color="primary" />
          <span class="text-body-2 text-medium-emphasis">正在准备新的验证码</span>
        </div>
        <CaptchaWidget
          v-else-if="challenge && !error"
          :key="challenge.requestId"
          :challenge="challenge"
          :disabled="verifying"
          @verified="emit('verified', $event)"
          @error="emit('error', $event)"
        />
        <p v-if="verifying" class="text-body-2 text-medium-emphasis text-center mt-4 mb-0" role="status">正在验证并{{ challenge?.action === 'register' ? '注册' : '登录' }}…</p>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn v-if="error" variant="text" color="primary" :disabled="refreshing || verifying" @click="emit('retry')">重试</v-btn>
        <v-spacer />
        <v-btn variant="text" :disabled="verifying" @click="emit('cancel')">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.captcha-dialog__card {
  border-radius: 24px;
  box-shadow: none;
}

@media (max-width: 599.98px) {
  .captcha-dialog :deep(.v-overlay__content) {
    width: calc(100% - 32px);
    max-width: calc(100% - 32px);
    max-height: calc(100% - 32px);
    margin: 16px;
  }
}
</style>
