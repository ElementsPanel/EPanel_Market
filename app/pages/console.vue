<script setup lang="ts">
import type { ConsoleUserItem } from '../../shared/types/console'
import { apiErrorMessage } from '../utils/apiError'

definePageMeta({ middleware: 'admin' })

type TabKey = 'users' | 'index' | 'settings'

const tab = ref<TabKey>('users')
const loading = ref(false)
const loadFailed = ref(false)
const toast = useToast()
let loadSequence = 0

const userItems = ref<ConsoleUserItem[]>([])
const acting = ref('')

const syncing = ref(false)
const syncResult = ref<{ total: number; updatedAt: number } | null>(null)

function formatDate(timestamp?: number) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN')
}

// SSR 时 $fetch 不会自动带上浏览器 Cookie，控制台的接口靠会话鉴权，必须显式转发
function sessionHeaders() {
  return import.meta.server ? useRequestHeaders(['cookie']) : undefined
}

async function load(key: TabKey) {
  const sequence = ++loadSequence
  if (key === 'settings' || key === 'index') {
    loading.value = false
    loadFailed.value = false
    return
  }
  loading.value = true
  loadFailed.value = false
  try {
    const data = await $fetch<{ items: ConsoleUserItem[] }>('/api/console/users', {
      headers: sessionHeaders(),
    })
    if (sequence === loadSequence) userItems.value = data.items
  } catch (error) {
    if (sequence !== loadSequence) return
    loadFailed.value = true
    if (import.meta.client) toast.error(apiErrorMessage(error))
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function run(id: string, successMessage: string, task: () => Promise<unknown>) {
  if (acting.value) return
  acting.value = id
  try {
    await task()
    toast.success(successMessage)
    await load(tab.value)
  } catch (error) {
    toast.error(apiErrorMessage(error))
  } finally {
    acting.value = ''
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

function toggleAdmin(item: ConsoleUserItem) {
  return run(item.id, item.isAdmin ? '已取消管理员权限' : '已授予管理员权限', () =>
    $fetch<unknown>(`/api/console/users/${item.id}`, {
      method: 'PATCH',
      headers: sessionHeaders(),
      body: { isAdmin: !item.isAdmin },
    })
  )
}

const deleteTarget = ref<ConsoleUserItem | null>(null)
const deleteShown = computed({
  get: () => deleteTarget.value !== null,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null
  },
})

function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleteTarget.value = null
  return run(target.id, '用户已删除', () =>
    $fetch<unknown>(`/api/console/users/${target.id}`, {
      method: 'DELETE',
      headers: sessionHeaders(),
    })
  )
}

await load('users')
watch(tab, (key) => load(key || 'users'))
</script>

<template>
  <v-container class="py-8">
    <div class="text-h5 mb-4">
      控制台
    </div>

    <v-tabs v-model="tab" color="primary" show-arrows>
      <v-tab value="users">
        用户管理
      </v-tab>
      <v-tab value="index">
        插件索引
      </v-tab>
      <v-tab value="settings">
        站点设置
      </v-tab>
    </v-tabs>

    <v-progress-linear v-if="loading" indeterminate class="mt-2" />

    <v-card v-if="loadFailed && !loading" class="text-center mt-4 py-8">
      <div class="text-body-2 text-medium-emphasis mb-4">暂时无法加载列表</div>
      <v-btn variant="text" @click="load(tab || 'users')">重试</v-btn>
    </v-card>

    <v-tabs-window v-if="!loadFailed" v-model="tab" class="mt-4">
      <v-tabs-window-item value="users">
        <v-table v-if="userItems.length">
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>注册时间</th>
              <th>管理员</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in userItems" :key="item.id">
              <td>{{ item.displayName }}</td>
              <td>
                {{ item.email }}
                <div class="mt-1">
                  <v-chip size="x-small" :color="item.emailVerified ? 'success' : 'warning'" variant="tonal">
                    {{ item.emailVerified ? '已验证' : '待验证' }}
                  </v-chip>
                </div>
              </td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>
                <v-switch
                  :model-value="item.isAdmin"
                  color="primary"
                  hide-details
                  density="compact"
                  :loading="acting === item.id"
                  :disabled="Boolean(acting) || (!item.isAdmin && !item.emailVerified)"
                  @update:model-value="toggleAdmin(item)"
                />
              </td>
              <td>
                <v-btn
                  size="small"
                  color="error"
                  variant="text"
                  :disabled="item.isAdmin || Boolean(acting)"
                  @click="deleteTarget = item"
                >
                  删除
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-card v-else-if="!loading">
          <v-card-text class="text-center text-medium-emphasis py-8">
            没有用户
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

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

      <v-tabs-window-item value="settings">
        <SiteSettingsPanel />
      </v-tabs-window-item>
    </v-tabs-window>

    <v-dialog v-model="deleteShown" max-width="420">
      <v-card :title="'删除用户'">
        <v-card-text>
          确定要删除「{{ deleteTarget?.displayName }}」吗？此操作不可撤销。
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteTarget = null">
            取消
          </v-btn>
          <v-btn color="error" @click="confirmDelete">
            删除
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
