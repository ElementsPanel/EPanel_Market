<script setup lang="ts">
import { useTheme } from 'vuetify'

const { user, avatarUrl, logout } = useAuth()
const theme = useTheme()
const { icon: colorModeIcon, label: colorModeLabel, cycle: cycleColorMode } = useColorMode()
const logoSrc = computed(() => theme.global.current.value.dark ? '/images/epanel-logo-white.svg' : '/images/epanel-logo.svg')
</script>

<template>
  <v-app-bar class="app-header" density="comfortable">
    <div class="app-header__brand">
      <NuxtLink to="/" class="app-header__home" aria-label="元素面板插件市场首页">
        <img :src="logoSrc" class="app-header__logo" alt="元素面板" width="32" height="32" />
      </NuxtLink>
      <v-btn
        :icon="colorModeIcon"
        :aria-label="colorModeLabel"
        :title="colorModeLabel"
        variant="text"
        size="40"
        rounded="circle"
        @click="cycleColorMode"
      />
    </div>

    <v-spacer />

    <template #append>
      <template v-if="user?.isAdmin">
        <v-btn variant="text" to="/console">
          控制台
        </v-btn>
      </template>

      <template v-if="user">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="text">
              <UserAvatar :src="avatarUrl" :name="user.displayName" :size="28" />
            </v-btn>
          </template>
          <v-list min-width="220">
            <v-list-item :title="user.displayName" :subtitle="user.email" />
            <v-divider />
            <v-list-item
              v-if="user.isAdmin"
              title="控制台"
              prepend-icon="mdi-view-dashboard-outline"
              to="/console"
            />
            <v-list-item title="编辑资料" prepend-icon="mdi-account-edit" to="/account" />
            <v-list-item title="退出登录" prepend-icon="mdi-logout" @click="logout()" />
          </v-list>
        </v-menu>
      </template>

      <template v-else>
        <v-btn variant="text" to="/login">
          登录
        </v-btn>
        <v-btn variant="outlined" to="/register">
          注册
        </v-btn>
      </template>
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
  gap: 12px;
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
