<script setup lang="ts">
import type { DbDriver, SetupPayload } from '../../shared/types/setup'

definePageMeta({ layout: 'blank' })

const driver = ref<DbDriver>('sqlite')
const sqliteFile = ref('data/epanel.sqlite')
const postgres = reactive({
  host: '127.0.0.1',
  port: 5432,
  user: '',
  password: '',
  database: '',
  ssl: false,
})
const admin = reactive({
  email: '',
  displayName: '',
  password: '',
  confirm: '',
})

const loading = ref(false)
const errorMessage = ref('')

const { refresh } = useAuth()

onMounted(async () => {
  const status = await $fetch<{ initialized: boolean }>('/api/setup/status')
  if (status.initialized) await navigateTo('/')
})

async function submit() {
  errorMessage.value = ''

  if (admin.password !== admin.confirm) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    const account = {
      email: admin.email,
      password: admin.password,
      displayName: admin.displayName || undefined,
    }

    const body: SetupPayload = driver.value === 'sqlite'
      ? { driver: 'sqlite', sqlite: { file: sqliteFile.value }, admin: account }
      : { driver: 'postgres', postgres: { ...postgres }, admin: account }

    await $fetch('/api/setup/initialize', { method: 'POST', body })
    await refresh()
    window.location.href = '/'
  } catch (error: unknown) {
    const data = (error as { data?: { message?: string } })?.data
    errorMessage.value = data?.message ?? (error as Error)?.message ?? '初始化失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="py-10">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-title class="text-h5">
            初始化 EPanel Market
          </v-card-title>
          <v-card-subtitle>
            首次启动需要配置数据库并创建管理员账户，配置将保存在项目根目录的 <code>data/</code> 下（位于构建产物之外）。
          </v-card-subtitle>

          <v-card-text>
            <div class="text-subtitle-1 mb-2">
              数据库
            </div>
            <v-radio-group v-model="driver" inline>
              <v-radio label="SQLite" value="sqlite" />
              <v-radio label="PostgreSQL" value="postgres" />
            </v-radio-group>

            <template v-if="driver === 'sqlite'">
              <v-text-field
                v-model="sqliteFile"
                label="数据库文件路径"
                hint="相对于项目根目录，例如 data/epanel.sqlite"
                persistent-hint
              />
            </template>

            <template v-else>
              <v-row density="compact">
                <v-col cols="12" sm="8">
                  <v-text-field v-model="postgres.host" label="主机" />
                </v-col>
                <v-col cols="12" sm="4">
                  <v-text-field v-model.number="postgres.port" label="端口" type="number" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="postgres.database" label="数据库名" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="postgres.user" label="用户名" />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="postgres.password"
                    label="密码"
                    type="password"
                    hint="建议使用仅拥有该库权限的专用账号"
                    persistent-hint
                  />
                </v-col>
                <v-col cols="12">
                  <v-switch v-model="postgres.ssl" label="启用 SSL" color="primary" />
                </v-col>
              </v-row>
            </template>

            <v-divider class="my-4" />

            <div class="text-subtitle-1 mb-2">
              管理员账户
            </div>
            <v-text-field v-model="admin.email" label="邮箱" type="email" />
            <v-text-field v-model="admin.displayName" label="显示名称（可选）" />
            <v-text-field v-model="admin.password" label="密码" type="password" />
            <v-text-field v-model="admin.confirm" label="确认密码" type="password" />

            <v-alert v-if="errorMessage" type="error" class="mt-4" :text="errorMessage" />
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submit">
              完成初始化
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
