<script setup lang="ts">
import { withNextPath } from '../utils/nextPath'

// ElementsPanel 的发布脚本（npm run publish-plugin）发起连接后打开的授权页。用户在市场
// 登录，确认后才把 state 绑定到账号上；令牌由发布脚本轮询 /api/oauth/token 换出，
// 本页面不接触令牌。

const route = useRoute()
const state = computed(() => (typeof route.query.state === 'string' ? route.query.state : ''))

const { user, fetched, refresh } = useAuth()
if (!fetched.value) await refresh()

const loginUrl = computed(() => withNextPath('/login', route.fullPath))
if (!user.value) await navigateTo(loginUrl.value)

const loading = ref(false)
const granted = ref(false)
const errorMessage = ref('')

async function grant() {
  errorMessage.value = ''
  loading.value = true
  try {
    await $fetch('/api/oauth/grant', { method: 'POST', body: { state: state.value } })
    granted.value = true
  } catch (error) {
    errorMessage.value = (error as { data?: { message?: string } })?.data?.message ?? (error as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="py-10">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="5">
        <v-card>
          <v-card-title class="text-h5">
            连接 ElementsPanel 发布脚本
          </v-card-title>
          <v-card-subtitle>
            授权后，这台机器上的插件发布脚本就能以你的身份上传插件
          </v-card-subtitle>

          <v-card-text>
            <template v-if="!state">
              <v-alert type="error" text="连接请求缺少 state 参数，请在终端重新运行发布命令" />
            </template>

            <template v-else-if="granted">
              <v-alert type="success" text="授权成功，请回到终端，发布脚本会自动继续上传" />
            </template>

            <template v-else>
              <div class="text-body-2 mb-2">
                即将授权给：<strong>{{ user?.displayName }}</strong>（{{ user?.email }}）
              </div>
              <div class="text-caption text-medium-emphasis">
                授权会签发一个发布令牌，它只能用来上传插件和查看你自己的提交记录。你可以随时在
                <NuxtLink to="/account">编辑资料</NuxtLink>
                页撤销它，或在终端运行 npm run publish-plugin -- --disconnect。
              </div>
              <v-alert v-if="errorMessage" type="error" class="mt-4" :text="errorMessage" />
            </template>
          </v-card-text>

          <v-card-actions v-if="state && !granted">
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="grant">
              授权
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
