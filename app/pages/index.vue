<script setup lang="ts">
import type { PluginListResult } from '../../shared/types/plugins'

const route = useRoute()

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

const result = computed(() => data.value)
const items = computed(() => result.value?.items ?? [])
const categories = computed(() => result.value?.categories ?? [])
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

    <v-row class="mb-2" dense>
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

    <v-alert v-if="error" type="error" class="my-4" :text="error.message" />

    <v-progress-linear v-else-if="status === 'pending'" indeterminate class="my-4" />

    <template v-else-if="items.length">
      <v-row>
        <v-col v-for="plugin in items" :key="plugin.id" cols="12" sm="6" md="4">
          <!-- pa-2 给卡片 8px 内边距；转 flex 列容器后 v-card-text 会吃掉剩余高度，
               把版本号和日期所在的操作行顶到每一张卡片的底部对齐 -->
          <v-card class="h-100 pa-2 d-flex flex-column" hover @click="navigateTo(`/plugins/${plugin.id}`)">
            <v-card-item>
              <template #prepend>
                <v-avatar color="primary" variant="tonal">
                  <v-icon icon="mdi-puzzle-outline" />
                </v-avatar>
              </template>
              <v-card-title class="text-body-1">
                {{ plugin.displayName }}
              </v-card-title>
              <v-card-subtitle>
                {{ plugin.author.displayName }}
                <span v-if="plugin.category">· {{ plugin.category }}</span>
              </v-card-subtitle>
            </v-card-item>

            <v-card-text class="text-body-2 text-medium-emphasis">
              {{ plugin.summary || '暂无简介' }}
            </v-card-text>

            <v-card-actions>
              <v-chip v-if="plugin.latestVersion" size="small" variant="tonal">
                v{{ plugin.latestVersion.version }}
              </v-chip>
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
      <v-icon icon="mdi-puzzle-outline" size="48" class="text-medium-emphasis" />
      <div class="text-h6 mt-4">
        还没有上架的插件
      </div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        插件通过审核后会显示在这里
      </div>
      <v-btn variant="text" class="mt-4" @click="refresh">
        刷新
      </v-btn>
    </v-card>
  </v-container>
</template>
