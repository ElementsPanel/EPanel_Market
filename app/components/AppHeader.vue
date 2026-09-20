<script setup lang="ts">
const { user, logout } = useAuth()
</script>

<template>
  <v-app-bar class="app-header" density="comfortable">
    <v-app-bar-title>EPanel Market</v-app-bar-title>

    <template #append>
      <template v-if="user?.isAdmin">
        <v-btn variant="text" to="/console">
          控制台
        </v-btn>
      </template>

      <template v-if="user">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-account-circle" variant="text" />
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

/* 抵消 Vuetify 给首个标题加的 20px 起始外边距，让左边距严格等于 --site-gutter */
.app-header :deep(.v-toolbar__content > .v-toolbar-title) {
  margin-inline-start: 0;
}
</style>
