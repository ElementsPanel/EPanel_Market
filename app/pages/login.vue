<script setup lang="ts">
definePageMeta({ layout: 'blank' })

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  loading.value = true
  try {
    await useAuth().login({ email: email.value, password: password.value })
    await navigateTo('/')
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="py-10">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="5">
        <v-card>
          <v-card-title class="text-h5">
            登录
          </v-card-title>

          <v-card-text>
            <v-text-field v-model="email" label="邮箱" type="email" @keydown.enter="submit" />
            <v-text-field v-model="password" label="密码" type="password" @keydown.enter="submit" />

            <v-alert v-if="errorMessage" type="error" class="mt-2" :text="errorMessage" />
          </v-card-text>

          <v-card-actions>
            <v-btn variant="text" to="/register">
              还没有账户？去注册
            </v-btn>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submit">
              登录
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
