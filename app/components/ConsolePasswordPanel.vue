<script setup lang="ts">
import { apiErrorMessage } from '../utils/apiError'

const props = defineProps<{ hasPassword: boolean }>()

const toast = useToast()
const current = ref('')
const password = ref('')
const confirm = ref('')
const saving = ref(false)

async function submit() {
  if (saving.value) return
  if (props.hasPassword && !current.value) {
    toast.error('请填写当前密码')
    return
  }
  if (password.value.length < 8) {
    toast.error('新密码至少需要 8 位')
    return
  }
  if (password.value !== confirm.value) {
    toast.error('两次输入的新密码不一致')
    return
  }

  saving.value = true
  try {
    await $fetch('/api/console/password', {
      method: 'POST',
      body: {
        currentPassword: props.hasPassword ? current.value : undefined,
        password: password.value,
      },
      retry: 0,
    })
    current.value = ''
    password.value = ''
    confirm.value = ''
    toast.success('后台密码已更新，其他设备需要重新输入')
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-form class="console-password" :disabled="saving" @submit.prevent="submit">
    <v-card>
      <v-card-title class="text-h6">
        修改后台密码
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          控制台只有这一枚密码，没有账号。改完密码后，其他设备与浏览器上的登录状态会立即失效。
        </p>
        <v-text-field
          v-if="hasPassword"
          v-model="current"
          label="当前密码"
          type="password"
          autocomplete="current-password"
          required
        />
        <v-text-field
          v-model="password"
          label="新密码"
          type="password"
          autocomplete="new-password"
          hint="8-128 位"
          persistent-hint
          maxlength="128"
          :class="{ 'mt-4': hasPassword }"
          required
        />
        <v-text-field
          v-model="confirm"
          label="确认新密码"
          type="password"
          autocomplete="new-password"
          maxlength="128"
          class="mt-4"
          required
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn type="submit" color="primary" :loading="saving">
          保存
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-form>
</template>

<style scoped>
.console-password {
  max-width: 560px;
}
</style>
