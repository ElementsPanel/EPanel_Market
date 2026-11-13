<script setup lang="ts">
import { useTheme } from 'vuetify'

const theme = useTheme()
const { icon: colorModeIcon, label: colorModeLabel, cycle: cycleColorMode } = useColorMode()
const logoSrc = computed(() => theme.global.current.value.dark ? '/images/epanel-logo-white.svg' : '/images/epanel-logo.svg')
</script>

<template>
  <v-app-bar class="app-header" density="comfortable">
    <div class="app-header__brand">
      <NuxtLink to="/" class="app-header__home" aria-label="元素面板插件市场首页">
        <img :src="logoSrc" class="app-header__logo" alt="元素面板" width="24" height="24" />
      </NuxtLink>
    </div>

    <v-spacer />

    <template #append>
      <v-btn
        :icon="colorModeIcon"
        :aria-label="colorModeLabel"
        :title="colorModeLabel"
        variant="text"
        size="40"
        rounded="circle"
        @click="cycleColorMode"
      />
    </template>
  </v-app-bar>
</template>

<style scoped>
.app-header {
  --site-gutter: clamp(16px, 4vw, 72px);
}

.app-header :deep(.v-toolbar__content) {
  padding-inline: var(--site-gutter);
}

.app-header :deep(.v-toolbar__append) {
  gap: 8px;
}

.app-header__brand {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
}

.app-header__home {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
  border-radius: 8px;
}

.app-header__home:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.app-header__logo {
  display: block;
  object-fit: contain;
}
</style>
