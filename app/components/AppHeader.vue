<script setup lang="ts">
const { user, logout } = useAuth()
</script>

<template>
  <v-app-bar color="primary" density="comfortable">
    <template #prepend>
      <v-app-bar-nav-icon />
    </template>

    <v-app-bar-title>EPanel Market</v-app-bar-title>

    <template #append>
      <v-btn icon="mdi-magnify" variant="text" />
      <v-btn icon="mdi-cart-outline" variant="text" />

      <template v-if="user">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-account-circle" variant="text" />
          </template>
          <v-list min-width="220">
            <v-list-item :title="user.displayName" :subtitle="user.email" />
            <v-divider />
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
