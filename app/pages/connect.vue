<script setup lang="ts">
import { apiErrorMessage } from '../utils/apiError'

// ElementsPanel 的发布脚本（npm run publish-plugin）发起连接后打开的授权页。用户在市场
// 登录，确认后才把 state 绑定到账号上；令牌由发布脚本轮询 /api/oauth/token 换出，
// 本页面不接触令牌。

const route = useRoute()
const state = computed(() => (typeof route.query.state === 'string' ? route.query.state : ''))

const { user, fetched, refresh } = useAuth()
const { view: authView, open: openAuth } = useAuthDialog()
const toast = useToast()
if (!fetched.value) await refresh()

const loading = ref(false)
const granted = ref(false)

watch(state, (value) => {
  granted.value = false
  if (import.meta.client && !value) {
    toast.error('连接请求缺少 state 参数，请在终端重新运行发布命令')
  }
}, { immediate: true })

watch(() => user.value?.id, () => { granted.value = false })

onMounted(() => {
  if (state.value && !user.value && !authView.value) void openAuth('login', { replace: true })
})

async function grant() {
  if (loading.value || granted.value || !state.value) return
  if (!user.value) {
    toast.info('请先登录后再授权')
    await openAuth('login')
    return
  }
  loading.value = true
  try {
    await $fetch('/api/oauth/grant', { method: 'POST', body: { state: state.value } })
    granted.value = true
    toast.success('授权成功，请回到终端，发布脚本会自动继续上传')
  } catch (error) {
    toast.error(apiErrorMessage(error))
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
              <p class="text-body-2 text-medium-emphasis">请在终端重新运行发布命令，再打开生成的连接页面。</p>
            </template>

            <template v-else-if="granted">
              <div class="d-flex align-center ga-3">
                <v-icon icon="mdi-check-circle-outline" color="success" />
                <p class="text-body-2">可以关闭此页面，回到终端继续发布插件。</p>
              </div>
            </template>

            <template v-else-if="!user">
              <p class="text-body-2 text-medium-emphasis">登录后即可将发布脚本连接到你的账户。</p>
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
            </template>
          </v-card-text>

          <v-card-actions v-if="state && !granted">
            <v-spacer />
            <v-btn v-if="user" color="primary" :loading="loading" :disabled="loading" @click="grant">
              授权
            </v-btn>
            <template v-else>
              <v-btn variant="text" aria-haspopup="dialog" @click="openAuth('register')">注册</v-btn>
              <v-btn color="primary" aria-haspopup="dialog" @click="openAuth('login')">登录后授权</v-btn>
            </template>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
