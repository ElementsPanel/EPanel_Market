<script setup lang="ts">
import type { PluginDetail, PluginVersionStatus } from '../../../shared/types/plugins'

const route = useRoute()
const id = String(route.params.id ?? '')

const { data, status, error } = await useFetch<PluginDetail>(`/api/plugins/${id}`)

const STATUS_LABEL: Record<PluginVersionStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
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
  <v-container class="py-8">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" class="mb-4">
      返回插件列表
    </v-btn>

    <v-alert v-if="error" type="error" :text="error.message" />
    <v-progress-linear v-else-if="status === 'pending'" indeterminate />

    <template v-else-if="data">
      <v-card>
        <v-card-item>
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="56">
              <v-icon icon="mdi-puzzle-outline" />
            </v-avatar>
          </template>
          <v-card-title class="text-h5">
            {{ data.displayName }}
          </v-card-title>
          <v-card-subtitle>
            {{ data.author.displayName }}
            <span v-if="data.category">· {{ data.category }}</span>
            <span v-if="data.latestVersion">· v{{ data.latestVersion.version }}</span>
          </v-card-subtitle>
        </v-card-item>

        <v-card-text>
          <div class="text-body-1 mb-4">
            {{ data.summary }}
          </div>
          <div v-if="data.description" class="text-body-2" style="white-space: pre-wrap">
            {{ data.description }}
          </div>
        </v-card-text>

        <v-card-actions>
          <span class="text-caption text-medium-emphasis">
            更新于 {{ formatDate(data.updatedAt) }}
          </span>
        </v-card-actions>
      </v-card>

      <div class="text-h6 mt-8 mb-2">
        版本历史
      </div>
      <v-table>
        <thead>
          <tr>
            <th>版本</th>
            <th>状态</th>
            <th>大小</th>
            <th>提交时间</th>
            <th>更新说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="version in data.versions" :key="version.id">
            <td>{{ version.version }}</td>
            <td>{{ STATUS_LABEL[version.status] }}</td>
            <td>{{ formatSize(version.sizeBytes) }}</td>
            <td>{{ formatDate(version.submittedAt) }}</td>
            <td>{{ version.changelog || '—' }}</td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </v-container>
</template>
