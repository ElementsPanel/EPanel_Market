<script setup lang="ts">
definePageMeta({ layout: 'blank' })

const email = ref('')
const displayName = ref('')
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''

  if (password.value !== confirm.value) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    await useAuth().register({
      email: email.value,
      password: password.value,
      displayName: displayName.value || undefined,
    })
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
            注册
          </v-card-title>

          <v-card-text>
            <v-text-field v-model="email" label="邮箱" type="email" />
            <v-text-field v-model="displayName" label="显示名称（可选）" />
            <v-text-field v-model="password" label="密码" type="password" hint="至少 8 位" persistent-hint />
            <v-text-field v-model="confirm" label="确认密码" type="password" @keydown.enter="submit" />

            <v-alert v-if="errorMessage" type="error" class="mt-2" :text="errorMessage" />
          </v-card-text>

          <v-card-actions>
            <v-btn variant="text" to="/login">
              已有账户？去登录
            </v-btn>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submit">
              注册
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
