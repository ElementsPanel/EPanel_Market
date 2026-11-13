<script setup lang="ts">
import type { SetupPayload } from '../../shared/types/setup'
import { apiErrorMessage } from '../utils/apiError'

definePageMeta({ layout: 'blank' })

useHead({ title: '初始化' })

const password = ref('')
const confirm = ref('')

const loading = ref(false)
const toast = useToast()

onMounted(async () => {
  try {
    const status = await $fetch<{ initialized: boolean }>('/api/setup/status')
    if (status.initialized) await navigateTo('/console')
  } catch (error) {
    toast.error(apiErrorMessage(error))
  }
})

async function submit() {
  if (loading.value) return

  if (password.value.length < 8) {
    toast.error('后台密码至少需要 8 位')
    return
  }
  if (password.value !== confirm.value) {
    toast.error('两次输入的密码不一致')
    return
  }

  loading.value = true
  try {
    const body: SetupPayload = { password: password.value }

    await $fetch('/api/setup/initialize', { method: 'POST', body })
    password.value = ''
    confirm.value = ''
    toast.success('初始化完成')
    await navigateTo('/console', { replace: true })
  } catch (error: unknown) {
    toast.error(apiErrorMessage(error, '初始化失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="py-10">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-title class="text-h5">
            初始化 EPanel Market
          </v-card-title>
          <v-card-subtitle>
            首次启动只需设置后台密码。数据存放在项目根目录的 <code>data/epanel.sqlite</code>（SQLite，位于构建产物之外）。
          </v-card-subtitle>

          <v-card-text>
            <div class="text-subtitle-1 mb-2">
              后台密码
            </div>
            <p class="text-body-2 text-medium-emphasis mb-4">
              控制台不设账号，进入 <code>/console</code> 时输入这枚密码即可。密码以哈希形式保存在配置文件中，忘记后只能手工改配置。
            </p>
            <v-text-field
              v-model="password"
              label="后台密码"
              type="password"
              autocomplete="new-password"
              hint="8-128 位"
              persistent-hint
              maxlength="128"
              autofocus
              required
            />
            <v-text-field
              v-model="confirm"
              label="确认后台密码"
              type="password"
              autocomplete="new-password"
              maxlength="128"
              class="mt-4"
              required
            />
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submit">
              完成初始化
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
