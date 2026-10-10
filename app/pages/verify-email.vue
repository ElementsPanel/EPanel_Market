<script setup lang="ts">
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'

const route = useRoute()
const toast = useToast()
const { refresh } = useAuth()
const { open: openAuth } = useAuthDialog()
const status = ref<'pending' | 'success' | 'error'>('pending')
const instruction = ref('')

useSeoMeta({ title: '邮箱验证 · EPanel Market', robots: 'noindex, nofollow' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    status.value = 'error'
    instruction.value = '请从验证邮件中打开完整链接。未收到邮件时，可在登录弹窗输入邮箱与密码，点击登录后按提示重发。'
    toast.warning('链接中缺少验证令牌')
    return
  }

  try {
    const query = { ...route.query }
    delete query.token
    await navigateTo({ path: route.path, query, hash: route.hash }, { replace: true })
    const result = await $fetch<{ changingEmail: boolean; message: string }>('/api/auth/verify-email', {
      method: 'POST', body: { token }, retry: 0,
    })
    if (result.changingEmail) await refresh()
    status.value = 'success'
    instruction.value = result.changingEmail ? '邮箱已更换，请使用新邮箱重新登录。' : '邮箱已验证，现在可以登录你的账户。'
    toast.success(result.message)
  } catch (error) {
    status.value = 'error'
    instruction.value = '可在登录弹窗输入邮箱与密码，点击登录后按提示重发验证邮件；更换邮箱的验证邮件可在个人资料页重新申请。'
    if (apiErrorCode(error) === 'TOKEN_EXPIRED') toast.warning(apiErrorMessage(error))
    else toast.error(apiErrorMessage(error))
  }
})
</script>

<template>
  <v-container class="py-10">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card>
          <v-card-item>
            <v-card-title class="text-h5">邮箱验证</v-card-title>
          </v-card-item>
          <v-card-text>
            <div v-if="status === 'pending'" class="d-flex justify-center py-6">
              <v-progress-circular indeterminate color="primary" aria-label="正在验证邮箱" />
            </div>
            <template v-else>
              <v-icon :icon="status === 'success' ? 'mdi-email-check-outline' : 'mdi-email-alert-outline'" :color="status === 'success' ? 'success' : 'warning'" size="40" class="mb-4" />
              <p class="text-body-2 text-medium-emphasis mb-4">{{ instruction }}</p>
              <v-btn color="primary" block size="large" aria-haspopup="dialog" @click="openAuth('login', { next: '/' })">前往登录</v-btn>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
