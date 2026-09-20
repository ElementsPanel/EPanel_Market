<script setup lang="ts">
// 面板发起连接后打开的授权页。用户在市场登录，确认后才把 state 绑定到账号上；
// 令牌由面板轮询 /api/oauth/token 换出，本页面不接触令牌。

const route = useRoute()
const state = computed(() => (typeof route.query.state === 'string' ? route.query.state : ''))

const { user, fetched, refresh } = useAuth()
if (!fetched.value) await refresh()

const loginUrl = computed(() => `/login?next=${encodeURIComponent(route.fullPath)}`)
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
            连接 ElementsPanel
          </v-card-title>
          <v-card-subtitle>
            授权后面板就能以你的身份把插件上传到插件市场
          </v-card-subtitle>

          <v-card-text>
            <template v-if="!state">
              <v-alert type="error" text="连接请求缺少 state 参数，请回到面板重新发起连接" />
            </template>

            <template v-else-if="granted">
              <v-alert type="success" text="授权成功，请返回面板继续上传" />
            </template>

            <template v-else>
              <div class="text-body-2 mb-2">
                即将授权给：<strong>{{ user?.displayName }}</strong>（{{ user?.email }}）
              </div>
              <div class="text-caption text-medium-emphasis">
                授权会为面板签发一个发布令牌，你可以随时在面板中断开连接。
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
