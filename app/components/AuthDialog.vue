<script setup lang="ts">
import type { RegisterBody } from '../../shared/types/auth'
import type { CaptchaAction } from '../../shared/types/captcha'
import type { AuthView } from '../composables/useAuthDialog'
import { useAuthCaptcha } from '../composables/useAuthCaptcha'
import { apiErrorMessage } from '../utils/apiError'

const route = useRoute()
const { view, open, close, complete } = useAuthDialog()
const { user, login, register, resendVerification } = useAuth()
const toast = useToast()

const shownView = ref<AuthView | null>(null)
const email = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const resending = ref(false)
const registrationSent = ref(false)
const needsVerification = ref(false)
const resendSeconds = ref(0)
const submitButton = ref<{ $el: HTMLButtonElement } | null>(null)
let resendTimer: ReturnType<typeof setInterval> | undefined
let returnFocus: HTMLElement | null = null

const {
  step, loading, challenge, captchaError,
  authenticate, prepareCaptcha, completeCaptcha, onCaptchaError, cancelChallenge, cancelAttempt,
} = useAuthCaptcha({
  active: () => Boolean(view.value),
  submit: submitCredentials,
  onCancel: () => submitButton.value?.$el.focus(),
  onError: (code) => {
    if (view.value === 'login') needsVerification.value = code === 'EMAIL_NOT_VERIFIED'
  },
})
const busy = computed(() => loading.value || resending.value)
const captchaActive = computed(() => Boolean(challenge.value))
const isRegister = computed(() => shownView.value === 'register')
const title = computed(() => isRegister.value ? '注册' : '登录')
const subtitle = computed(() => isRegister.value ? '创建账号后需要验证邮箱' : '使用邮箱与密码登录')

watch(() => route.fullPath, cancelAttempt, { flush: 'sync' })

watch(view, (value, previous) => {
  password.value = ''
  confirmPassword.value = ''
  registrationSent.value = false
  needsVerification.value = false
  if (!value) return
  shownView.value = value
  if (!previous) {
    if (import.meta.client) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    email.value = ''
    displayName.value = ''
  }
}, { immediate: true })

if (import.meta.client) {
  watch([view, user], ([currentView, currentUser]) => {
    if (currentView && currentUser && !busy.value) void complete()
  }, { immediate: true })
}

function onAfterLeave() {
  if (view.value) return
  shownView.value = null
  email.value = ''
  displayName.value = ''
  stopResendTimer()
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  returnFocus = null
}

function onModelValue(value: boolean) {
  if (!value && !busy.value) void close()
}

function switchView() {
  if (busy.value) return
  return open(isRegister.value ? 'login' : 'register', { replace: true })
}

function stopResendTimer() {
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = undefined
  resendSeconds.value = 0
}

function startResendTimer() {
  stopResendTimer()
  resendSeconds.value = 60
  resendTimer = setInterval(() => {
    if (--resendSeconds.value <= 0) stopResendTimer()
  }, 1000)
}

watch([email, password], () => { needsVerification.value = false })
onBeforeUnmount(stopResendTimer)

async function resend() {
  if (busy.value || resendSeconds.value || !needsVerification.value) return
  resending.value = true
  try {
    const result = await resendVerification({ email: email.value.trim(), password: password.value })
    toast.success(result.message)
    startResendTimer()
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    resending.value = false
  }
}

async function submit() {
  if (busy.value || !view.value) return
  needsVerification.value = false

  const address = email.value.trim()
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    toast.error('请填写有效的邮箱地址')
    return
  }
  if (password.value.length < 8) {
    toast.error('密码至少需要 8 位')
    return
  }
  if (isRegister.value && password.value.length > 128) {
    toast.error('密码不能超过 128 位')
    return
  }
  if (isRegister.value && password.value !== confirmPassword.value) {
    toast.error('两次输入的密码不一致')
    return
  }

  await authenticate(isRegister.value ? 'register' : 'login', {
    email: address,
    password: password.value,
    ...(isRegister.value ? { displayName: displayName.value.trim() || undefined } : {}),
  })
}

async function submitCredentials(action: CaptchaAction, body: RegisterBody, signal: AbortSignal) {
  const requestPath = route.fullPath
  if (action === 'register') {
    const result = await register(body, { signal })
    if (signal.aborted || route.fullPath !== requestPath) return
    password.value = ''
    confirmPassword.value = ''
    email.value = body.email
    registrationSent.value = true
    startResendTimer()
    toast.success(result.message)
  } else {
    await login(body, { signal })
    if (signal.aborted || route.fullPath !== requestPath) return
    password.value = ''
    confirmPassword.value = ''
    toast.success('登录成功')
    await complete()
  }
}
</script>

<template>
  <v-dialog
    :model-value="Boolean(view) && !user"
    max-width="440"
    class="auth-dialog"
    :scrim="true"
    :scrollable="false"
    :persistent="busy"
    :retain-focus="!captchaActive"
    :capture-focus="!captchaActive"
    :close-on-back="false"
    aria-labelledby="auth-dialog-title"
    aria-describedby="auth-dialog-description"
    @update:model-value="onModelValue"
    @after-leave="onAfterLeave"
  >
    <v-card
      v-if="shownView"
      max-width="440"
      width="100%"
      class="auth-dialog__card"
      :class="{ 'auth-dialog__card--receded': captchaActive }"
      :inert="captchaActive || undefined"
      :aria-hidden="captchaActive || undefined"
    >
      <v-card-item>
        <v-card-title id="auth-dialog-title" tag="h2" class="text-h5">{{ title }}</v-card-title>
        <v-card-subtitle id="auth-dialog-description">{{ subtitle }}</v-card-subtitle>
      </v-card-item>

      <v-card-text>
        <template v-if="isRegister && registrationSent">
          <p class="text-body-2 text-medium-emphasis mb-4">请到 {{ email }} 查收验证邮件，链接 24 小时内有效。完成验证后即可登录。</p>
          <p class="text-body-2 text-medium-emphasis mb-4">未收到邮件时，可前往登录并按提示重新发送。</p>
          <v-btn color="primary" block size="large" :flat="false" @click="switchView">前往登录</v-btn>
        </template>

        <v-form v-else :key="shownView" :disabled="busy" @submit.prevent="submit">
          <v-text-field
            v-if="isRegister"
            v-model="displayName"
            label="显示名称（可选）"
            autocomplete="nickname"
            prepend-inner-icon="mdi-account"
            maxlength="64"
            autofocus
          />
          <v-text-field
            v-model="email"
            label="邮箱"
            type="email"
            autocomplete="email"
            prepend-inner-icon="mdi-email"
            maxlength="254"
            :class="{ 'mt-4': isRegister }"
            :autofocus="!isRegister"
            required
          />
          <v-text-field
            v-model="password"
            label="密码"
            type="password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            prepend-inner-icon="mdi-lock"
            :hint="isRegister ? '8-128 位' : undefined"
            :persistent-hint="isRegister"
            :maxlength="isRegister ? 128 : undefined"
            :class="{ 'mt-2': !isRegister }"
            required
          />
          <v-text-field
            v-if="isRegister"
            v-model="confirmPassword"
            label="确认密码"
            type="password"
            autocomplete="new-password"
            prepend-inner-icon="mdi-lock-check"
            maxlength="128"
            class="mt-4"
            required
          />

          <v-btn ref="submitButton" type="submit" color="primary" block size="large" class="mt-4" :flat="false" :loading="loading" :disabled="busy">
            {{ title }}
          </v-btn>
        </v-form>

        <div v-if="!isRegister || !registrationSent" class="d-flex align-center mt-4" :class="{ 'flex-wrap ga-1': !isRegister }">
          <v-btn
            v-if="!isRegister && needsVerification"
            variant="text"
            size="small"
            :loading="resending"
            :disabled="busy || resendSeconds > 0"
            @click="resend"
          >
            {{ resendSeconds ? `${resendSeconds} 秒后可重发` : '重新发送验证邮件' }}
          </v-btn>
          <v-spacer />
          <v-btn variant="text" size="small" :disabled="busy" @click="switchView">
            {{ isRegister ? '已有账号？登录' : '没有账号？注册' }}
          </v-btn>
          <v-spacer v-if="isRegister" />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <CaptchaDialog
    :challenge="challenge"
    :verifying="step === 'submitting'"
    :refreshing="step === 'preparing'"
    :error="captchaError"
    @verified="completeCaptcha"
    @error="onCaptchaError"
    @retry="prepareCaptcha"
    @cancel="cancelChallenge"
  />
</template>

<style scoped>
.auth-dialog__card {
  border-radius: 24px;
  box-shadow: none;
  transform-origin: center;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease;
}

.auth-dialog__card--receded {
  transform: scale(0.94);
  opacity: 0.8;
}

@media (prefers-reduced-motion: reduce) {
  .auth-dialog__card {
    transition: none;
  }
}

@media (max-width: 599.98px) {
  .auth-dialog :deep(.v-overlay__content) {
    width: calc(100% - 32px);
    max-width: calc(100% - 32px);
    max-height: calc(100% - 32px);
    margin: 16px;
  }

  .auth-dialog__card :deep(.v-card-title),
  .auth-dialog__card :deep(.v-card-subtitle) {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
