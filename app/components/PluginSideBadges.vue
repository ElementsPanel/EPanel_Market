<script setup lang="ts">
import type { PluginSide } from '../../shared/types/plugins'
import { pluginSideLabel } from '../utils/pluginSides'

const props = defineProps<{ sides?: PluginSide[] }>()

const label = computed(() => pluginSideLabel(props.sides))
// 带 Panel 端（含双端）用主色，只有 Daemon 端用次色。
const color = computed(() => (props.sides?.includes('panel') ? 'primary' : 'secondary'))
</script>

<template>
  <v-chip v-if="label" size="small" variant="tonal" :color="color">
    {{ label }}
  </v-chip>
</template>
