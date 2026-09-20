<script setup lang="ts">
import type {
  ConsolePluginItem,
  ConsoleReviewItem,
  ConsoleUserItem,
} from '../../shared/types/console'
import type { PluginVersionStatus } from '../../shared/types/plugins'

definePageMeta({ middleware: 'admin' })

type TabKey = 'review' | 'plugins' | 'users'

const tab = ref<TabKey>('review')
const loading = ref(false)
const errorMessage = ref('')

const reviewItems = ref<ConsoleReviewItem[]>([])
const pluginItems = ref<ConsolePluginItem[]>([])
const userItems = ref<ConsoleUserItem[]>([])

const STATUS_LABEL: Record<PluginVersionStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

const STATUS_COLOR: Record<PluginVersionStatus, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

function messageOf(error: unknown): string {
  return (error as { data?: { message?: string } })?.data?.message ?? (error as Error).message
}

function formatDate(timestamp?: number) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// SSR 时 $fetch 不会自动带上浏览器 Cookie，控制台的接口靠会话鉴权，必须显式转发
function sessionHeaders() {
  return import.meta.server ? useRequestHeaders(['cookie']) : undefined
}

async function load(key: TabKey) {
  loading.value = true
  errorMessage.value = ''
  try {
    if (key === 'review') {
      const data = await $fetch<{ items: ConsoleReviewItem[] }>('/api/console/review', {
        headers: sessionHeaders(),
      })
      reviewItems.value = data.items
    } else if (key === 'plugins') {
      const data = await $fetch<{ items: ConsolePluginItem[] }>('/api/console/plugins', {
        headers: sessionHeaders(),
      })
      pluginItems.value = data.items
    } else {
      const data = await $fetch<{ items: ConsoleUserItem[] }>('/api/console/users', {
        headers: sessionHeaders(),
      })
      userItems.value = data.items
    }
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    loading.value = false
  }
}

const acting = ref('')

async function run(id: string, task: () => Promise<unknown>) {
  acting.value = id
  errorMessage.value = ''
  try {
    await task()
    await load(tab.value)
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    acting.value = ''
  }
}

function approve(item: ConsoleReviewItem) {
  return run(item.versionId, () =>
    $fetch(`/api/console/review/${item.versionId}`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: { action: 'approve' },
    })
  )
}

// 驳回要填理由：作者会在面板的提交记录里看到
const rejectTarget = ref<ConsoleReviewItem | null>(null)
const rejectNote = ref('')

// 弹窗的开关直接由「有没有目标」驱动，省掉一个永远要和目标同步的布尔量
const rejectShown = computed({
  get: () => rejectTarget.value !== null,
  set: (value: boolean) => {
    if (!value) rejectTarget.value = null
  },
})

function openReject(item: ConsoleReviewItem) {
  rejectTarget.value = item
  rejectNote.value = ''
}

function confirmReject() {
  const item = rejectTarget.value
  if (!item) return
  const note = rejectNote.value.trim()
  if (!note) return
  rejectTarget.value = null
  return run(item.versionId, () =>
    $fetch(`/api/console/review/${item.versionId}`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: { action: 'reject', note },
    })
  )
}

function toggleVisibility(item: ConsolePluginItem) {
  return run(item.id, () =>
    $fetch(`/api/console/plugins/${item.id}`, {
      method: 'PATCH',
      headers: sessionHeaders(),
      body: { visibility: item.visibility === 'listed' ? 'hidden' : 'listed' },
    })
  )
}

const deleteTarget = ref<{ kind: 'plugin' | 'user'; id: string; label: string } | null>(null)

const deleteShown = computed({
  get: () => deleteTarget.value !== null,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null
  },
})

function openDelete(kind: 'plugin' | 'user', id: string, label: string) {
  deleteTarget.value = { kind, id, label }
}

function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleteTarget.value = null
  const url = target.kind === 'plugin' ? `/api/console/plugins/${target.id}` : `/api/console/users/${target.id}`
  return run(target.id, () => $fetch(url, { method: 'DELETE', headers: sessionHeaders() }))
}

function toggleAdmin(item: ConsoleUserItem) {
  return run(item.id, () =>
    $fetch(`/api/console/users/${item.id}`, {
      method: 'PATCH',
      headers: sessionHeaders(),
      body: { isAdmin: !item.isAdmin },
    })
  )
}

await load('review')
watch(tab, (key) => load(key))
</script>

<template>
  <v-container class="py-8">
    <div class="text-h5 mb-4">
      控制台
    </div>

    <v-alert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />

    <v-tabs v-model="tab" color="primary" show-arrows>
      <v-tab value="review">
        审核队列
      </v-tab>
      <v-tab value="plugins">
        插件管理
      </v-tab>
      <v-tab value="users">
        用户管理
      </v-tab>
    </v-tabs>

    <v-progress-linear v-if="loading" indeterminate class="mt-2" />

    <v-tabs-window v-model="tab" class="mt-4">
      <v-tabs-window-item value="review">
        <v-card v-if="!reviewItems.length && !loading">
          <v-card-text class="text-center text-medium-emphasis py-8">
            审核队列是空的
          </v-card-text>
        </v-card>

        <v-table v-else>
          <thead>
            <tr>
              <th>插件</th>
              <th>版本</th>
              <th>提交者</th>
              <th>文件</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in reviewItems" :key="item.versionId">
              <td>
                {{ item.plugin.displayName }}
                <div class="text-caption text-medium-emphasis">
                  {{ item.plugin.name }}
                </div>
              </td>
              <td>{{ item.version }}</td>
              <td>{{ item.author.displayName }}</td>
              <td>{{ item.fileCount }} 个 / {{ formatSize(item.sizeBytes) }}</td>
              <td>{{ formatDate(item.submittedAt) }}</td>
              <td>
                <v-btn
                  size="small"
                  color="success"
                  variant="tonal"
                  :loading="acting === item.versionId"
                  @click="approve(item)"
                >
                  通过
                </v-btn>
                <v-btn
                  size="small"
                  color="error"
                  variant="text"
                  class="ml-2"
                  :disabled="acting === item.versionId"
                  @click="openReject(item)"
                >
                  驳回
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-tabs-window-item>

      <v-tabs-window-item value="plugins">
        <v-table v-if="pluginItems.length">
          <thead>
            <tr>
              <th>插件</th>
              <th>作者</th>
              <th>版本</th>
              <th>状态</th>
              <th>更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pluginItems" :key="item.id">
              <td>
                {{ item.displayName }}
                <div class="text-caption text-medium-emphasis">
                  {{ item.name }}
                </div>
              </td>
              <td>{{ item.author.displayName }}</td>
              <td>
                <v-chip
                  v-for="version in item.versions.slice(0, 3)"
                  :key="version.id"
                  size="x-small"
                  :color="STATUS_COLOR[version.status]"
                  variant="tonal"
                  class="mr-1"
                >
                  {{ version.version }} {{ STATUS_LABEL[version.status] }}
                </v-chip>
                <span v-if="item.counts.total > 3" class="text-caption">
                  等 {{ item.counts.total }} 个版本
                </span>
              </td>
              <td>
                <v-chip
                  size="small"
                  :color="item.visibility === 'listed' ? 'success' : 'default'"
                  variant="tonal"
                >
                  {{ item.visibility === 'listed' ? '已上架' : '已下架' }}
                </v-chip>
              </td>
              <td>{{ formatDate(item.updatedAt) }}</td>
              <td>
                <v-btn
                  size="small"
                  variant="tonal"
                  :loading="acting === item.id"
                  @click="toggleVisibility(item)"
                >
                  {{ item.visibility === 'listed' ? '下架' : '上架' }}
                </v-btn>
                <v-btn
                  size="small"
                  color="error"
                  variant="text"
                  class="ml-2"
                  :disabled="acting === item.id"
                  @click="openDelete('plugin', item.id, item.displayName)"
                >
                  删除
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-card v-else-if="!loading">
          <v-card-text class="text-center text-medium-emphasis py-8">
            还没有插件
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <v-tabs-window-item value="users">
        <v-table v-if="userItems.length">
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>插件数</th>
              <th>注册时间</th>
              <th>管理员</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in userItems" :key="item.id">
              <td>{{ item.displayName }}</td>
              <td>{{ item.email }}</td>
              <td>{{ item.pluginCount }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>
                <v-switch
                  :model-value="item.isAdmin"
                  color="primary"
                  hide-details
                  density="compact"
                  :loading="acting === item.id"
                  @update:model-value="toggleAdmin(item)"
                />
              </td>
              <td>
                <v-btn
                  size="small"
                  color="error"
                  variant="text"
                  :disabled="item.isAdmin || acting === item.id"
                  @click="openDelete('user', item.id, item.displayName)"
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
    </v-tabs-window>

    <v-dialog v-model="rejectShown" max-width="460">
      <v-card :title="'驳回插件版本'">
        <v-card-text>
          <div class="text-body-2 mb-4">
            驳回 {{ rejectTarget?.plugin.displayName }} v{{ rejectTarget?.version }}，理由会展示给提交者。
          </div>
          <v-textarea v-model="rejectNote" label="驳回理由" rows="3" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="rejectTarget = null">
            取消
          </v-btn>
          <v-btn color="error" :disabled="!rejectNote.trim()" @click="confirmReject">
            驳回
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteShown" max-width="420">
      <v-card :title="deleteTarget?.kind === 'user' ? '删除用户' : '删除插件'">
        <v-card-text>
          确定要删除「{{ deleteTarget?.label }}」吗？此操作不可撤销。
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

<style scoped>
/* 选中指示条沿用 ElementsPanel 的形式：原生 slider 保持透明以保留位移动画，
   可见部分由 ::after 画成居中、两端收窄的短条 */
:deep(.v-btn.v-tab) .v-tab__slider {
  height: 4px;
  background: transparent;
}

:deep(.v-btn.v-tab) .v-tab__slider::after {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40%;
  height: 4px;
  border-radius: 4px 4px 0 0;
  background-color: currentColor;
  content: '';
  transform: translateX(-50%);
}
</style>
