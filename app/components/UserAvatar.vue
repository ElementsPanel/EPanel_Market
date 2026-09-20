<script setup lang="ts">
const props = withDefaults(defineProps<{
  src?: string | null
  name?: string
  size?: number
}>(), { src: null, name: '', size: 40 })

const failed = ref(false)
const initial = computed(() => props.name.trim().charAt(0).toUpperCase())

// 换图后 src 变化，得把上一次的失败状态清掉，否则永远停在兜底样式上
watch(() => props.src, () => {
  failed.value = false
})
</script>

<template>
  <v-avatar
    :size="size"
    color="primary"
    variant="tonal"
    role="img"
    :aria-label="`${name || '用户'}的头像`"
  >
    <v-img v-if="src && !failed" :key="src" :src="src" alt="" cover @error="failed = true" />
    <span v-else-if="initial" class="font-weight-bold" :style="{ fontSize: `${size * 0.4}px` }">
      {{ initial }}
    </span>
    <v-icon v-else icon="mdi-account" :size="size * 0.5" />
  </v-avatar>
</template>
