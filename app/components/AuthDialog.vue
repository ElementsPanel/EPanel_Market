<script setup lang="ts">
import type { AuthView } from '../composables/useAuthDialog'
import { apiErrorMessage } from '../utils/apiError'

const route = useRoute()
const { view, open, close, complete } = useAuthDialog()
const { user, login, register } = useAuth()
const toast = useToast()

const shownView = ref<AuthView | null>(null)
const email = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
let returnFocus: HTMLElement | null = null

const isRegister = computed(() => shownView.value === 'register')
const title = computed(() => isRegister.value ? '注册' : '登录')
const subtitle = computed(() => isRegister.value ? '创建账号后自动登录' : '使用邮箱与密码登录')

watch(view, (value, previous) => {
  password.value = ''
  confirmPassword.value = ''
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
    if (currentView && currentUser && !loading.value) void complete()
  }, { immediate: true })
}

function onAfterLeave() {
  if (view.value) return
  shownView.value = null
  email.value = ''
  displayName.value = ''
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  returnFocus = null
}

function onModelValue(value: boolean) {
  if (!value && !loading.value) void close()
}

function switchView() {
  if (loading.value) return
  return open(isRegister.value ? 'login' : 'register', { replace: true })
}

async function submit() {
  if (loading.value || !view.value) return

  const address = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    toast.error('请填写有效的邮箱地址')
    return
  }
  if (password.value.length < 8) {
    toast.error('密码至少需要 8 位')
    return
  }
  if (isRegister.value && password.value !== confirmPassword.value) {
    toast.error('两次输入的密码不一致')
    return
  }

  const registering = isRegister.value
  const requestPath = route.fullPath
  loading.value = true
  try {
    if (registering) {
      await register({
        email: address,
        password: password.value,
        displayName: displayName.value.trim() || undefined,
      })
    } else {
      await login({ email: address, password: password.value })
    }
    toast.success(registering ? '注册成功，已自动登录' : '登录成功')
    password.value = ''
    confirmPassword.value = ''
    if (route.fullPath === requestPath) await complete()
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    loading.value = false
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
    :persistent="loading"
    :close-on-back="false"
    aria-labelledby="auth-dialog-title"
    aria-describedby="auth-dialog-description"
    @update:model-value="onModelValue"
    @after-leave="onAfterLeave"
  >
    <v-card v-if="shownView" max-width="440" width="100%" class="auth-dialog__card">
      <v-card-item>
        <v-card-title id="auth-dialog-title" tag="h2" class="text-h5">{{ title }}</v-card-title>
        <v-card-subtitle id="auth-dialog-description">{{ subtitle }}</v-card-subtitle>
      </v-card-item>

      <v-card-text>
        <v-form :key="shownView" :disabled="loading" @submit.prevent="submit">
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
            :hint="isRegister ? '至少 8 位' : undefined"
            :persistent-hint="isRegister"
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
            class="mt-4"
            required
          />

          <v-btn type="submit" color="primary" block size="large" class="mt-4" :flat="false" :loading="loading" :disabled="loading">
            {{ title }}
          </v-btn>
        </v-form>

        <div class="d-flex align-center mt-4" :class="{ 'flex-wrap ga-1': !isRegister }">
          <v-spacer />
          <v-btn variant="text" size="small" :disabled="loading" @click="switchView">
            {{ isRegister ? '已有账号？登录' : '没有账号？注册' }}
          </v-btn>
          <v-spacer v-if="isRegister" />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.auth-dialog__card {
  border-radius: 24px;
  box-shadow: none;
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
