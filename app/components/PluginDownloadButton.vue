<script setup lang="ts">
import type { PluginSide } from '../../shared/types/plugins'

const props = defineProps<{
  targets: { side: PluginSide; label: string; href: string }[]
  /** 页头用默认大小的实心按钮，版本行里用小一号的 tonal 按钮。 */
  prominent?: boolean
}>()

const size = computed(() => (props.prominent ? undefined : 'small'))
const variant = computed(() => (props.prominent ? 'flat' : 'tonal'))
</script>

<template>
  <v-menu v-if="targets.length > 1" location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        color="primary"
        :size="size"
        :variant="variant"
        prepend-icon="mdi-download"
        append-icon="mdi-menu-down"
        v-bind="menuProps"
      >
        下载
      </v-btn>
    </template>
    <v-list min-width="200">
      <v-list-item
        v-for="target in targets"
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
    :size="size"
    :variant="variant"
    prepend-icon="mdi-download"
    :href="targets[0]?.href"
    :disabled="!targets.length"
  >
    下载
  </v-btn>
</template>
