<script setup lang="ts">
import type { PluginVersionSummary } from '../../shared/types/plugins'

const props = defineProps<{ version: PluginVersionSummary }>()
const requirements = computed(() => [
  ...Object.entries(props.version.dependencies ?? {}).map(([name, range]) => ({ name, range, kind: 'npm 依赖' })),
  ...Object.entries(props.version.peerDependencies ?? {}).map(([name, range]) => ({ name, range, kind: props.version.peerDependenciesMeta?.[name]?.optional ? '可选 peer 依赖' : 'peer 依赖' })),
  ...Object.entries(props.version.engines ?? {}).map(([name, range]) => ({ name, range, kind: '运行环境' })),
  ...Object.entries(props.version.compatibility ?? {}).flatMap(([side, contract]) => contract ? [
    { name: `${side} API`, range: String(contract.api), kind: '宿主兼容性' },
    ...(contract.sdk === undefined ? [] : [{ name: `${side} SDK`, range: String(contract.sdk), kind: '宿主兼容性' }]),
  ] : []),
  ...(props.version.frontendDependencies ?? []).map(name => ({ name, range: '需要安装并启用', kind: '前端插件' })),
])
</script>

<template>
  <div class="py-3">
    <v-alert v-if="version.deprecated" type="warning" variant="tonal" class="mb-4">
      此版本已废弃：{{ version.deprecated }}
    </v-alert>
    <v-table v-if="requirements.length" density="compact">
      <thead><tr><th>依赖名称</th><th>版本要求</th><th>依赖类型</th></tr></thead>
      <tbody><tr v-for="(item, index) in requirements" :key="index"><td>{{ item.name }}</td><td>{{ item.range }}</td><td>{{ item.kind }}</td></tr></tbody>
    </v-table>
    <p v-else class="text-body-2 text-medium-emphasis">该版本未声明依赖或兼容性要求。</p>
    <p class="text-caption text-medium-emphasis mt-3">在 ElementsPanel 的插件市场中选择版本并执行安装、更新或卸载。npm 处理软件包依赖；前端插件依赖需要另行安装并启用。</p>
  </div>
</template>
