<script setup lang="ts">
import { apiErrorCode, apiErrorMessage } from '../utils/apiError'

type TabKey = 'index' | 'password'

useHead({ title: '控制台' })

interface ConsoleSession {
  authenticated: boolean
  hasPassword: boolean
}

const toast = useToast()

// SSR 时 $fetch 不会自动带上浏览器 Cookie，控制台接口靠 Cookie 鉴权，必须显式转发
function sessionHeaders() {
  return import.meta.server ? useRequestHeaders(['cookie']) : undefined
}

// 服务端先问一次登录态，避免整页渲染完才闪出一个密码框
const { data: session } = await useAsyncData<ConsoleSession>(
  'console-session',
  () => $fetch<ConsoleSession>('/api/console/session', { headers: sessionHeaders() }),
  { default: () => ({ authenticated: false, hasPassword: true }) },
)

const authenticated = ref(session.value.authenticated)
const hasPassword = ref(session.value.hasPassword)

/** 首次渲染用 SSR 的结果，客户端再核一次：退出后从别的页面回来不会拿到旧数据 */
async function refreshSession() {
  try {
    const data = await $fetch<ConsoleSession>('/api/console/session', { headers: sessionHeaders() })
    authenticated.value = data.authenticated
    hasPassword.value = data.hasPassword
  } catch {
    authenticated.value = false
  }
}

onMounted(refreshSession)

const gatePassword = ref('')
const gateConfirm = ref('')
const gateLoading = ref(false)

const tab = ref<TabKey>('index')
const syncing = ref(false)
const syncResult = ref<{ total: number; updatedAt: number } | null>(null)

const gateTitle = computed(() => hasPassword.value ? '输入后台密码' : '设置后台密码')
const gateHint = computed(() => hasPassword.value
  ? '控制台不设账号，输入后台密码即可进入。'
  : '这处部署还没有后台密码，先设置一枚；之后进入控制台都靠它。')

function formatDate(timestamp?: number) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN')
}

async function submitGate() {
  if (gateLoading.value) return

  if (!hasPassword.value) {
    if (gatePassword.value.length < 8) {
      toast.error('后台密码至少需要 8 位')
      return
    }
    if (gatePassword.value !== gateConfirm.value) {
      toast.error('两次输入的密码不一致')
      return
    }
  } else if (!gatePassword.value) {
    toast.error('请输入后台密码')
    return
  }

  const firstTime = !hasPassword.value
  gateLoading.value = true
  try {
    await $fetch(firstTime ? '/api/console/password' : '/api/console/login', {
      method: 'POST',
      body: { password: gatePassword.value },
      retry: 0,
    })
    authenticated.value = true
    hasPassword.value = true
    gatePassword.value = ''
    gateConfirm.value = ''
    toast.success(firstTime ? '后台密码已设置' : '已进入控制台')
  } catch (error) {
    // 并发情况下别人先设了密码，切回输入模式
    if (apiErrorCode(error) === 'CONFLICT') hasPassword.value = true
    toast.error(apiErrorMessage(error))
  } finally {
    gateLoading.value = false
  }
}

async function logout() {
  try {
    await $fetch('/api/console/logout', { method: 'POST', retry: 0 })
    authenticated.value = false
    tab.value = 'index'
    syncResult.value = null
    toast.success('已退出控制台')
  } catch (error) {
    toast.error(apiErrorMessage(error))
  }
}

async function syncIndex() {
  if (syncing.value) return
  syncing.value = true
  try {
    syncResult.value = await $fetch<{ total: number; updatedAt: number }>('/api/console/npm/sync', {
      method: 'POST',
      headers: sessionHeaders(),
    })
    toast.success(`索引已更新，共 ${syncResult.value.total} 个插件`)
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <v-container class="py-8">
    <v-row v-if="!authenticated" justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card>
          <v-card-title class="text-h5">
            {{ gateTitle }}
          </v-card-title>
          <v-card-subtitle class="text-body-2">
            {{ gateHint }}
          </v-card-subtitle>
          <v-card-text>
            <v-form :disabled="gateLoading" @submit.prevent="submitGate">
              <v-text-field
                v-model="gatePassword"
                label="后台密码"
                type="password"
                :autocomplete="hasPassword ? 'current-password' : 'new-password'"
                maxlength="128"
                autofocus
                required
              />
              <v-text-field
                v-if="!hasPassword"
                v-model="gateConfirm"
                label="确认密码"
                type="password"
                autocomplete="new-password"
                maxlength="128"
                class="mt-4"
                required
              />
              <v-btn type="submit" color="primary" block size="large" class="mt-4" :loading="gateLoading">
                {{ hasPassword ? '进入控制台' : '设置并进入' }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <template v-else>
      <div class="d-flex align-center mb-4">
        <div class="text-h5">
          控制台
        </div>
        <v-spacer />
        <v-btn variant="text" prepend-icon="mdi-logout" @click="logout">
          退出
        </v-btn>
      </div>

      <v-tabs v-model="tab" color="primary" show-arrows>
        <v-tab value="index">
          插件索引
        </v-tab>
        <v-tab value="password">
          后台密码
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="tab" class="mt-4">
        <v-tabs-window-item value="index">
          <v-card>
            <v-card-text>
              <div class="text-body-2 text-medium-emphasis mb-4">
                市场定时从 npm registry 拉取名为 epanel-plugin-* 的包，并缓存其元数据。插件包本身由 npm
                托管，市场只提供列表与详情。
              </div>
              <div v-if="syncResult" class="text-body-2 mb-4">
                最近一次同步：{{ formatDate(syncResult.updatedAt) }}，共 {{ syncResult.total }} 个插件。
              </div>
              <v-btn color="primary" :loading="syncing" @click="syncIndex">
                立即同步
              </v-btn>
            </v-card-text>
          </v-card>
        </v-tabs-window-item>

        <v-tabs-window-item value="password">
          <ConsolePasswordPanel :has-password="hasPassword" />
        </v-tabs-window-item>
      </v-tabs-window>
    </template>
  </v-container>
</template>
