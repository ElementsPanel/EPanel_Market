<script setup lang="ts">
const { user } = useAuth()
</script>

<template>
  <v-container>
    <div class="text-h4">
      sample
    </div>

    <div v-if="user" class="text-body-1 mt-4">
      你好，{{ user.displayName }}（{{ user.email }}）
    </div>
    <div v-else class="text-body-1 mt-4">
      尚未登录，<NuxtLink to="/login">去登录</NuxtLink> 或 <NuxtLink to="/register">注册账户</NuxtLink>
    </div>
  </v-container>
</template>
