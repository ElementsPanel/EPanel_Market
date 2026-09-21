<script setup lang="ts">
import type { PluginSide, PublishedPluginDetail } from '../../../shared/types/plugins'
import { pluginSideLabel } from '../../utils/pluginSides'

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

const tab = ref<'overview' | 'versions'>('overview')

// 端跟着选中的版本走：产物是按版本存的，端属于版本。回退到插件级字段是为了兼容
// 还没有逐版本 sides 的旧数据。
const sides = computed<PluginSide[]>(
  () => data.value?.selectedVersion.sides ?? data.value?.sides ?? []
)
const sideLabel = computed(() => pluginSideLabel(sides.value))

function downloadUrl(side: PluginSide) {
  const params = new URLSearchParams({ side })
  if (data.value) params.set('version', data.value.selectedVersion.version)
  return `/api/plugins/${encodeURIComponent(id.value)}/download?${params}`
}

// 单端直接下载；双端要先问用户拿哪一端。
const downloadTargets = computed(() =>
  sides.value.map((side) => ({
    side,
    label: side === 'panel' ? '下载 Panel 端' : '下载 Daemon 端',
    href: downloadUrl(side),
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
    <div class="d-flex flex-wrap ga-2 mb-8">
      <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/">
        返回插件列表
      </v-btn>
      <v-spacer />
      <v-btn variant="text" :loading="status === 'pending'" @click="refresh()">
        刷新
      </v-btn>
    </div>

    <v-progress-linear v-if="status === 'pending'" indeterminate class="mb-4" />
    <v-alert v-if="error" type="error" class="mb-4" :text="errorMessage" />

    <template v-if="data">
      <!-- 商店式的头部：左边是插件本身，右边是唯一的主动作 -->
      <header class="detail-header">
        <div class="detail-heading">
          <v-avatar color="primary" variant="tonal" size="64" rounded="lg">
            <v-icon icon="mdi-puzzle-outline" size="34" />
          </v-avatar>
          <div class="detail-heading-text">
            <h1 class="detail-title">
              {{ data.displayName }}
            </h1>
            <p class="detail-summary">
              {{ data.summary || '暂无简介' }}
            </p>
            <div class="detail-meta">
              <span>{{ data.author.displayName }}</span>
              <v-chip v-if="data.category" size="small" variant="tonal">
                {{ data.category }}
              </v-chip>
              <PluginSideBadges :sides="sides" />
            </div>
          </div>
        </div>

        <div class="detail-action">
          <v-menu v-if="downloadTargets.length > 1" location="bottom end">
            <template #activator="{ props: menuProps }">
              <v-btn
                color="primary"
                prepend-icon="mdi-download"
                append-icon="mdi-menu-down"
                v-bind="menuProps"
              >
                下载
              </v-btn>
            </template>
            <v-list min-width="200">
              <v-list-item
                v-for="target in downloadTargets"
                :key="target.side"
                :href="target.href"
                :title="target.label"
                prepend-icon="mdi-download"
              />
            </v-list>
          </v-menu>
          <v-btn
            v-else
            color="primary"
            prepend-icon="mdi-download"
            :href="downloadTargets[0]?.href"
            :disabled="!downloadTargets.length"
          >
            下载
          </v-btn>
        </div>
      </header>

      <v-tabs v-model="tab" color="primary" class="detail-tabs">
        <v-tab value="overview">概览</v-tab>
        <v-tab value="versions">版本</v-tab>
      </v-tabs>

      <v-row>
        <v-col cols="12" md="8">
          <!-- 页签内容用 v-tabs-window，与 console.vue 的写法保持一致；侧边栏两项都要
               用，所以留在窗口外面。 -->
          <v-tabs-window v-model="tab">
            <v-tabs-window-item value="overview">
              <p class="plugin-detail-text">
                {{ data.description || '暂无详细说明' }}
              </p>
            </v-tabs-window-item>

            <v-tabs-window-item value="versions">
              <h2 class="detail-section-title">版本历史</h2>
              <div class="version-list">
                <button
                  v-for="item in data.versions"
                  :key="item.id"
                  type="button"
                  class="version-item"
                  :class="{
                    'version-item--active': item.version === data.selectedVersion.version,
                  }"
                  @click="selectVersion(item.version)"
                >
                  <span class="version-item-name">v{{ item.version }}</span>
                  <span class="version-item-meta">
                    {{ formatDate(item.submittedAt) }} ·
                    {{ formatSize(item.sizeBytes) }} · {{ item.fileCount }} 个文件
                  </span>
                </button>
              </div>

              <h2 class="detail-section-title">更新说明</h2>
              <p class="plugin-detail-text">
                {{ data.selectedVersion.changelog || '暂无更新说明' }}
              </p>
            </v-tabs-window-item>
          </v-tabs-window>
        </v-col>

        <v-col cols="12" md="4">
          <section v-if="data.category" class="detail-sidebar-section">
            <h2 class="detail-sidebar-title">标签</h2>
            <v-chip size="small" variant="tonal">{{ data.category }}</v-chip>
          </section>

          <section class="detail-sidebar-section">
            <h2 class="detail-sidebar-title">更多信息</h2>
            <dl class="detail-info">
              <div class="detail-info-row">
                <dt>插件 ID</dt>
                <dd>{{ data.name }}</dd>
              </div>
              <div class="detail-info-row">
                <dt>开发者</dt>
                <dd>{{ data.author.displayName }}</dd>
              </div>
              <div v-if="data.latestVersion" class="detail-info-row">
                <dt>最新版本</dt>
                <dd>v{{ data.latestVersion.version }}</dd>
              </div>
              <div class="detail-info-row">
                <dt>当前版本</dt>
                <dd>v{{ data.selectedVersion.version }}</dd>
              </div>
              <div class="detail-info-row">
                <dt>大小</dt>
                <dd>
                  {{ formatSize(data.selectedVersion.sizeBytes) }} ·
                  {{ data.selectedVersion.fileCount }} 个文件
                </dd>
              </div>
              <div class="detail-info-row">
                <dt>端</dt>
                <dd>{{ sideLabel || '未知' }}</dd>
              </div>
            </dl>
          </section>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<style scoped>
.plugin-detail {
  overflow-wrap: anywhere;
}

.detail-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
}

.detail-heading {
  display: flex;
  gap: 20px;
  flex: 1 1 420px;
  min-width: 0;
}

.detail-heading-text {
  min-width: 0;
}

.detail-title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
}

.detail-summary {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.6;
  opacity: 0.72;
}

.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  opacity: 0.7;
}

.detail-action {
  flex: 0 1 auto;
  display: flex;
  align-items: flex-start;
}

.detail-tabs {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  margin-bottom: 24px;
}

/* 选中指示条与控制台页签保持一致：原生 slider 保持透明以保留位移动画，
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

.detail-section-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
}

.detail-section-title:not(:first-child) {
  margin-top: 28px;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
  cursor: pointer;
}

.version-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.version-item--active {
  background: rgba(var(--v-theme-primary), 0.1);
}

.version-item--active .version-item-name {
  color: rgb(var(--v-theme-primary));
}

.version-item-name {
  font-size: 15px;
  font-weight: 600;
}

.version-item-meta {
  font-size: 12px;
  opacity: 0.7;
}

.detail-sidebar-section + .detail-sidebar-section {
  margin-top: 28px;
}

.detail-sidebar-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
}

.detail-info {
  margin: 0;
}

.detail-info-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.detail-info-row dt {
  flex: 0 0 84px;
  opacity: 0.7;
}

.detail-info-row dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.plugin-detail-text {
  white-space: pre-wrap;
}
</style>
