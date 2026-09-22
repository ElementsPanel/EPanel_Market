<script setup lang="ts">
import type { PluginSide, PublishedPluginDetail } from '../../../shared/types/plugins'
import { pluginSideLabel } from '../../utils/pluginSides'

const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

// 详情页恒定展示最新版，不再从 URL 读 version——版本列表只列出历史，切换版本要走
// 接口参数（面板仍是那样用），网页这边不需要。
const { data, status, error, refresh } = await useFetch<PublishedPluginDetail>(
  () => `/api/plugins/${encodeURIComponent(id.value)}`
)

const tab = ref<'readme' | 'versions' | 'updates'>('readme')

const sides = computed<PluginSide[]>(() => data.value?.sides ?? [])
const sideLabel = computed(() => pluginSideLabel(sides.value))

// 包里的 icon.png 就是插件的门面；没有或取不到时退回默认拼图图标。换插件要重来一次，
// 否则上一张图的失败状态会把它永远按在兜底样式上。
const iconFailed = ref(false)
watch(() => data.value?.id, () => {
  iconFailed.value = false
})

function markIconFailed() {
  iconFailed.value = true
}

function iconUrl(pluginId: string) {
  return `/api/plugins/${encodeURIComponent(pluginId)}/icon`
}

function downloadUrl(side: PluginSide, version: string) {
  const params = new URLSearchParams({ side, version })
  return `/api/plugins/${encodeURIComponent(id.value)}/download?${params}`
}

/** 一个版本的下载入口：单端一个按钮，双端为此先下拉选端。 */
function targetsFor(version: { version: string; sides?: PluginSide[] }) {
  // 逐版本的端信息缺失（旧服务器或旧缓存的响应）时退回插件级的，再没有才不给按钮，
  // 而不是让渲染在这一步崩掉。
  const list = version.sides?.length ? version.sides : (data.value?.sides ?? [])
  return list.map((side) => ({
    side,
    label: side === 'panel' ? '下载 Panel 端' : '下载 Daemon 端',
    href: downloadUrl(side, version.version),
  }))
}

const downloadTargets = computed(() => {
  const map = new Map<string, ReturnType<typeof targetsFor>>()
  for (const version of data.value?.versions ?? []) map.set(version.id, targetsFor(version))
  return map
})

// selectedVersion 在没有 version 参数时就是最新已通过版本。
const headerTargets = computed(() =>
  data.value ? targetsFor(data.value.selectedVersion) : []
)

const errorMessage = computed(() => {
  const payload = error.value?.data as { data?: { message?: string } } | undefined
  return payload?.data?.message || error.value?.message
})

useSeoMeta({
  title: () => (data.value ? `${data.value.displayName} · 插件市场` : '插件详情'),
  description: () => data.value?.summary || '查看插件说明、版本历史与更新内容',
})

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
            <v-img
              v-if="data.hasIcon && !iconFailed"
              :src="iconUrl(data.id)"
              alt=""
              cover
              @error="markIconFailed"
            />
            <v-icon v-else icon="mdi-puzzle-outline" size="34" />
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
          <PluginDownloadButton :targets="headerTargets" prominent />
        </div>
      </header>

      <v-tabs v-model="tab" color="primary" class="detail-tabs">
        <v-tab value="readme">自述</v-tab>
        <v-tab value="versions">版本</v-tab>
        <v-tab value="updates">更新</v-tab>
      </v-tabs>

      <v-row>
        <v-col cols="12" md="8">
          <!-- 页签内容用 v-tabs-window，与 console.vue 的写法保持一致；侧边栏三项都要
               用，所以留在窗口外面。 -->
          <v-tabs-window v-model="tab">
            <v-tabs-window-item value="readme">
              <!-- 自述来自包里的 README.md，服务端已经渲染并净化过 -->
              <div v-if="data.readmeHtml" class="markdown-body" v-html="data.readmeHtml" />
              <p v-else class="plugin-detail-text">
                {{ data.description || '暂无自述' }}
              </p>
            </v-tabs-window-item>

            <v-tabs-window-item value="versions">
              <div class="version-list">
                <div v-for="item in data.versions" :key="item.id" class="version-item">
                  <div class="version-item-text">
                    <span class="version-item-name">v{{ item.version }}</span>
                    <span class="version-item-meta">
                      {{ formatDate(item.submittedAt) }} ·
                      {{ formatSize(item.sizeBytes) }} · {{ item.fileCount }} 个文件
                    </span>
                  </div>
                  <PluginDownloadButton :targets="downloadTargets.get(item.id) ?? []" />
                </div>
              </div>
            </v-tabs-window-item>

            <v-tabs-window-item value="updates">
              <article
                v-for="item in data.versions"
                :key="item.id"
                class="update-item"
              >
                <div class="update-head">
                  <span class="update-version">v{{ item.version }}</span>
                  <span class="update-date">{{ formatDate(item.submittedAt) }}</span>
                </div>
                <p class="plugin-detail-text update-body">
                  {{ item.changelog || '暂无更新说明' }}
                </p>
              </article>
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
              <div class="detail-info-row">
                <dt>最新版本</dt>
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

.version-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 每一行只做两件事：说清是哪个版本，给出这个版本的下载入口。 */
.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 8px;
}

.version-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.version-item-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.version-item-name {
  font-size: 15px;
  font-weight: 600;
}

.version-item-meta {
  font-size: 12px;
  opacity: 0.7;
}

.update-item + .update-item {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.update-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}

.update-version {
  font-size: 15px;
  font-weight: 600;
}

.update-date {
  font-size: 12px;
  opacity: 0.7;
}

.update-body {
  margin: 0;
}

.plugin-detail-text {
  white-space: pre-wrap;
}

/* README 渲染出来的标签由 v-html 注入，不带 scoped 属性，所以要走 :deep() */
.markdown-body {
  font-size: 15px;
  line-height: 1.7;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 24px 0 12px;
  font-weight: 700;
  line-height: 1.3;
}

.markdown-body :deep(h1) {
  font-size: 24px;
}

.markdown-body :deep(h2) {
  font-size: 20px;
}

.markdown-body :deep(h3) {
  font-size: 17px;
}

.markdown-body :deep(p) {
  margin: 0 0 12px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.markdown-body :deep(a) {
  color: rgb(var(--v-theme-primary));
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 13px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.markdown-body :deep(pre) {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: none;
}

.markdown-body :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 12px;
  opacity: 0.85;
  border-left: 3px solid rgba(var(--v-theme-on-surface), 0.2);
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
}

.markdown-body :deep(table) {
  width: 100%;
  margin-bottom: 12px;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.markdown-body :deep(hr) {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
