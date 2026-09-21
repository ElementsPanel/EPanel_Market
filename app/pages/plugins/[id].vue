<script setup lang="ts">
import type { PublishedPluginDetail } from '../../../shared/types/plugins'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id ?? ''))
const version = computed(() =>
  typeof route.query.version === 'string' ? route.query.version : undefined
)
const { data, status, error, refresh } = await useFetch<PublishedPluginDetail>(
  () => `/api/plugins/${encodeURIComponent(id.value)}`,
  { query: { version } }
)
const versionOptions = computed(() =>
  (data.value?.versions ?? []).map((item) => ({
    title: `v${item.version}`,
    value: item.version,
  }))
)
const errorMessage = computed(() => {
  const payload = error.value?.data as { data?: { message?: string } } | undefined
  return payload?.data?.message || error.value?.message
})

useSeoMeta({
  title: () =>
    data.value ? `${data.value.displayName} · 插件市场` : '插件详情',
  description: () => data.value?.summary || '查看插件说明、版本历史与更新内容',
})

function selectVersion(value: string) {
  if (!value) return
  void router.replace({ query: { ...route.query, version: value } })
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
</script>

<template>
  <v-container class="py-8 plugin-detail">
    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/">
        返回插件列表
      </v-btn>
      <v-spacer />
      <v-btn variant="text" :loading="status === 'pending'" @click="refresh()">
        刷新
      </v-btn>
    </div>

    <v-progress-linear v-if="status === 'pending'" indeterminate />
    <v-alert v-else-if="error" type="error" :text="errorMessage" />

    <template v-else-if="data">
      <v-card class="mb-6">
        <v-card-item>
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="56">
              <v-icon icon="mdi-puzzle-outline" />
            </v-avatar>
          </template>
          <v-card-title class="text-h5 text-wrap">{{
            data.displayName
          }}</v-card-title>
          <v-card-subtitle class="text-wrap">
            {{ data.author.displayName }} · {{ data.name }}
          </v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-chip v-if="data.category" size="small" variant="tonal">{{
              data.category
            }}</v-chip>
            <v-chip v-if="data.latestVersion" size="small" variant="tonal">
              最新版本 v{{ data.latestVersion.version }}
            </v-chip>
          </div>
          <p class="text-body-1 mb-2">{{ data.summary || '暂无简介' }}</p>
          <span class="text-caption text-medium-emphasis"
            >更新于 {{ formatDate(data.updatedAt) }}</span
          >
        </v-card-text>
      </v-card>

      <v-row>
        <v-col cols="12" md="8">
          <v-card title="插件说明">
            <v-card-text class="plugin-detail-text">{{
              data.description || '暂无详细说明'
            }}</v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card title="版本信息">
            <v-card-text>
              <v-select
                :model-value="data.selectedVersion.version"
                :items="versionOptions"
                label="选择版本"
                variant="outlined"
                hide-details
                class="mb-4"
                @update:model-value="selectVersion"
              />
              <div class="text-body-2 text-medium-emphasis mb-4">
                <div>
                  发布时间：{{ formatDate(data.selectedVersion.submittedAt) }}
                </div>
                <div>
                  大小：{{ formatSize(data.selectedVersion.sizeBytes) }} ·
                  {{ data.selectedVersion.fileCount }} 个文件
                </div>
              </div>
              <v-alert type="info" variant="tonal">
                在 ElementsPanel 的「插件市场」中打开此插件详情，选择 v{{
                  data.selectedVersion.version
                }}
                后点击安装。
              </v-alert>
            </v-card-text>
          </v-card>
          <v-card title="更新说明" class="mt-4">
            <v-card-text class="plugin-detail-text">{{
              data.selectedVersion.changelog || '暂无更新说明'
            }}</v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <h2 class="text-h6 mt-8 mb-2">版本历史</h2>
      <v-table>
        <thead>
          <tr>
            <th>版本</th>
            <th>大小</th>
            <th>提交时间</th>
            <th>更新说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.versions" :key="item.id">
            <td>
              <v-btn
                variant="text"
                color="primary"
                :to="{
                  path: route.path,
                  query: { ...route.query, version: item.version },
                }"
              >
                v{{ item.version }}
              </v-btn>
            </td>
            <td>{{ formatSize(item.sizeBytes) }}</td>
            <td>{{ formatDate(item.submittedAt) }}</td>
            <td class="plugin-detail-text">{{ item.changelog || '—' }}</td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </v-container>
</template>

<style scoped>
.plugin-detail {
  overflow-wrap: anywhere;
}

.plugin-detail-text {
  white-space: pre-wrap;
}
</style>
