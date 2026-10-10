<script setup lang="ts">
import { useTheme } from 'vuetify'
import type { CaptchaChallenge, CaptchaProof } from '../../shared/types/captcha'
import { mountCaptchaWidget } from '../utils/captcha'

const props = defineProps<{ challenge: CaptchaChallenge, disabled?: boolean }>()
const emit = defineEmits<{
  verified: [proof: CaptchaProof]
  error: [message: string]
}>()
const theme = useTheme()
const container = ref<HTMLElement | null>(null)
const loading = ref(true)
const controller = new AbortController()
let dispose: (() => void) | undefined
let submitted = false

onMounted(async () => {
  if (!container.value) return
  const challenge = props.challenge
  try {
    const cleanup = await mountCaptchaWidget(container.value, challenge, theme.global.current.value.dark ? 'dark' : 'light', controller.signal, {
      success: (token) => {
        if (submitted || props.disabled) return
        submitted = true
        emit('verified', { requestId: challenge.requestId, token })
      },
      error: (message) => {
        if (!submitted) emit('error', message)
      }
    })
    if (controller.signal.aborted) cleanup()
    else dispose = cleanup
  } catch (cause) {
    if (!controller.signal.aborted) emit('error', cause instanceof Error ? cause.message : '验证码组件加载失败，请重试')
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
})

onBeforeUnmount(() => {
  controller.abort()
  try {
    dispose?.()
  } catch {
    container.value?.replaceChildren()
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="d-flex align-center justify-center ga-3 py-5" role="status">
      <v-progress-circular indeterminate size="24" width="2" color="primary" />
      <span class="text-body-2 text-medium-emphasis">正在加载验证码</span>
    </div>
    <div ref="container" class="captcha-widget" :inert="disabled || undefined" :aria-busy="loading" />
  </div>
</template>

<style scoped>
.captcha-widget {
  display: flex;
  justify-content: center;
  min-width: 0;
}

.captcha-widget :deep(.gc-trigger) {
  max-width: 100%;
}
</style>
