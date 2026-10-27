<script setup lang="ts">
import type { PluginListResult } from '../../shared/types/plugins'
import { apiErrorMessage } from '../utils/apiError'

const route = useRoute()
const toast = useToast()

const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '')
const category = ref(typeof route.query.category === 'string' ? route.query.category : '')
const page = ref(Number(route.query.page) || 1)

// 输入时不必每敲一个字就请求：搜索按钮与分类切换都会触发 refetch。
const appliedKeyword = ref(keyword.value)
const appliedCategory = ref(category.value)

const query = computed(() => ({
  q: appliedKeyword.value || undefined,
  category: appliedCategory.value || undefined,
  page: page.value,
}))

const { data, status, error, refresh } = await useFetch<PluginListResult>('/api/plugins', {
  query,
  watch: [query],
})

if (import.meta.client) {
  watch(error, (cause) => {
    if (cause) toast.error(apiErrorMessage(cause))
  }, { immediate: true })
}

const result = computed(() => data.value)
const items = computed(() => result.value?.items ?? [])
const categories = computed(() => result.value?.categories ?? [])
const hasFilters = computed(() => Boolean(appliedKeyword.value || appliedCategory.value))
const totalPages = computed(() =>
  result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1
)

function search() {
  page.value = 1
  appliedKeyword.value = keyword.value
  appliedCategory.value = category.value
}

function resetFilters() {
  keyword.value = ''
  category.value = ''
  search()
}

function formatDate(timestamp?: number) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('zh-CN')
}
</script>

<template>
  <v-container class="py-8">
    <div class="text-h5 mb-1">
      插件市场
    </div>
    <div class="text-body-2 text-medium-emphasis mb-6">
      共 {{ result?.total ?? 0 }} 个插件
    </div>

    <v-row class="mb-2" density="compact">
      <v-col cols="12" md="6">
        <v-text-field
          v-model="keyword"
          label="搜索插件"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          @keydown.enter="search"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select
          v-model="category"
          :items="categories"
          label="分类"
          hide-details
          clearable
          @update:model-value="search"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3" class="d-flex align-center ga-2">
        <v-btn color="primary" :loading="status === 'pending'" @click="search">
          搜索
        </v-btn>
        <v-btn variant="text" @click="resetFilters">
          重置
        </v-btn>
      </v-col>
    </v-row>

    <v-progress-linear v-if="status === 'pending'" indeterminate class="my-4" />

    <v-card v-else-if="error" class="text-center my-4 py-10">
      <v-icon icon="mdi-cloud-off-outline" size="48" class="text-medium-emphasis" />
      <div class="text-h6 mt-4">暂时无法加载插件</div>
      <v-btn variant="text" class="mt-4" @click="refresh()">重试</v-btn>
    </v-card>

    <template v-else-if="items.length">
      <v-row>
        <v-col v-for="plugin in items" :key="plugin.id" cols="12" sm="6" md="4">
          <!-- 卡片按列布局，操作行固定在底部，便于不同简介长度的卡片对齐。 -->
          <v-card class="plugin-market-card h-100" hover @click="navigateTo(`/plugins/${plugin.id}`)">
            <v-card-text class="plugin-market-card-content">
              <div class="plugin-market-card-head">
                <v-avatar class="plugin-market-icon" size="52" rounded="12px" color="surface" variant="flat">
                  <v-icon icon="mdi-puzzle-outline" size="28" />
                </v-avatar>
                <div class="plugin-market-card-heading">
                  <div class="text-h6">
                    {{ plugin.displayName }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ plugin.author.displayName }}
                    <span v-if="plugin.category">· {{ plugin.category }}</span>
                  </div>
                </div>
              </div>
              <div class="plugin-market-card-summary text-body-2 text-medium-emphasis">
                {{ plugin.summary || '暂无简介' }}
              </div>
            </v-card-text>

            <v-card-actions class="plugin-market-card-actions">
              <v-chip v-if="plugin.latestVersion" size="small" variant="tonal">
                v{{ plugin.latestVersion.version }}
              </v-chip>
              <PluginSideBadges :sides="plugin.sides" />
              <v-spacer />
              <span class="text-caption text-medium-emphasis">
                {{ formatDate(plugin.updatedAt) }}
              </span>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <v-pagination
        v-if="totalPages > 1"
        v-model="page"
        :length="totalPages"
        class="mt-6"
      />
    </template>

    <v-card v-else class="text-center py-10">
      <v-icon :icon="hasFilters ? 'mdi-magnify-close' : 'mdi-puzzle-outline'" size="48" class="text-medium-emphasis" />
      <div class="text-h6 mt-4">
        {{ hasFilters ? '未找到匹配的插件' : '还没有上架的插件' }}
      </div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        {{ hasFilters ? '试试更换关键词或分类' : '插件通过审核后会显示在这里' }}
      </div>
      <v-btn v-if="hasFilters" variant="text" class="mt-4" @click="resetFilters">
        清除筛选
      </v-btn>
      <v-btn v-else variant="text" class="mt-4" @click="refresh">
        刷新
      </v-btn>
    </v-card>
  </v-container>
</template>

<style scoped>
.plugin-market-card-content {
  flex: 1 0 auto;
}

.plugin-market-card {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
}

.plugin-market-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-market-card-heading {
  min-width: 0;
  overflow-wrap: anywhere;
}

.plugin-market-icon {
  flex-shrink: 0;
  overflow: hidden;
}

.plugin-market-icon-image {
  width: 100%;
  height: 100%;
}

.plugin-market-card-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.5;
  text-overflow: ellipsis;
}

.plugin-market-card-actions {
  align-items: center;
  padding-top: 8px;
}
</style>
