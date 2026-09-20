<script setup lang="ts">
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '../../shared/utils/avatar'

definePageMeta({ middleware: 'auth' })

const { user, avatarUrl, updateUser, uploadAvatar, deleteAvatar } = useAuth()

const accept = AVATAR_MIME_TYPES.join(',')
const maxMb = AVATAR_MAX_BYTES / 1024 / 1024

const displayName = ref('')
const email = ref('')
const currentPassword = ref('')

// 只在首次拿到用户数据时灌一次表单：之后表单就是用户正在编辑的内容，不能响应覆盖
const loaded = ref(false)

watch(user, (current) => {
  if (!current || loaded.value) return
  loaded.value = true
  displayName.value = current.displayName
  email.value = current.email
}, { immediate: true })

// 邮箱没动就不必验证当前密码，也不用提交
const emailChanged = computed(() => !!user.value && email.value.trim().toLowerCase() !== user.value.email)

const profileSaving = ref(false)
const profileError = ref('')
const profileSaved = ref(false)

async function submitProfile() {
  profileError.value = ''
  profileSaved.value = false
  if (!displayName.value.trim()) {
    profileError.value = '请填写显示名称'
    return
  }

  profileSaving.value = true
  try {
    await updateUser({
      displayName: displayName.value,
      email: emailChanged.value ? email.value : undefined,
      currentPassword: emailChanged.value ? currentPassword.value : undefined,
    })
    currentPassword.value = ''
    profileSaved.value = true
  } catch (error) {
    profileError.value = (error as Error).message
  } finally {
    profileSaving.value = false
  }
}

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordSaved = ref(false)

async function submitPassword() {
  passwordError.value = ''
  passwordSaved.value = false
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }

  passwordSaving.value = true
  try {
    await updateUser({ newPassword: newPassword.value, currentPassword: oldPassword.value })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordSaved.value = true
  } catch (error) {
    passwordError.value = (error as Error).message
  } finally {
    passwordSaving.value = false
  }
}

// VFileInput 在单选模式下给出单个 File
const avatarFile = ref<File | null>(null)
const avatarBusy = ref(false)
const avatarError = ref('')
const avatarSaved = ref(false)

async function submitAvatar() {
  avatarError.value = ''
  avatarSaved.value = false

  const file = avatarFile.value
  if (!file) {
    avatarError.value = '请先选择一张图片'
    return
  }
  if (file.size > AVATAR_MAX_BYTES) {
    avatarError.value = `图片不能超过 ${maxMb}MB`
    return
  }

  avatarBusy.value = true
  try {
    await uploadAvatar(file)
    avatarFile.value = null
    avatarSaved.value = true
  } catch (error) {
    avatarError.value = (error as Error).message
  } finally {
    avatarBusy.value = false
  }
}

async function removeAvatar() {
  avatarError.value = ''
  avatarSaved.value = false

  avatarBusy.value = true
  try {
    await deleteAvatar()
    avatarFile.value = null
    avatarSaved.value = true
  } catch (error) {
    avatarError.value = (error as Error).message
  } finally {
    avatarBusy.value = false
  }
}
</script>

<template>
  <v-container class="py-8">
    <div class="text-h5 mb-4">
      个人资料
    </div>

    <v-row>
      <v-col cols="12" md="5">
        <v-card>
          <v-card-title class="text-h6">
            头像
          </v-card-title>

          <v-card-text>
            <UserAvatar :src="avatarUrl" :name="user?.displayName" :size="72" />

            <v-file-input
              v-model="avatarFile"
              class="mt-4"
              :accept="accept"
              label="选择图片"
              prepend-icon=""
              :hint="`支持 PNG / JPEG / WebP，最大 ${maxMb}MB`"
              persistent-hint
            />

            <v-alert v-if="avatarError" type="error" class="mt-4" :text="avatarError" />
            <v-alert v-else-if="avatarSaved" type="success" class="mt-4" text="头像已更新" />
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              :disabled="!user?.avatarVersion"
              :loading="avatarBusy"
              @click="removeAvatar"
            >
              删除头像
            </v-btn>
            <v-spacer />
            <v-btn
              color="primary"
              :disabled="!avatarFile"
              :loading="avatarBusy"
              @click="submitAvatar"
            >
              上传
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="7">
        <v-card class="mb-4">
          <v-card-title class="text-h6">
            基本信息
          </v-card-title>

          <v-card-text>
            <v-text-field v-model="displayName" label="显示名称" />
            <v-text-field v-model="email" label="邮箱" type="email" />
            <v-text-field
              v-if="emailChanged"
              v-model="currentPassword"
              label="当前密码"
              type="password"
              hint="更换邮箱需要验证当前密码"
              persistent-hint
              @keydown.enter="submitProfile"
            />

            <v-alert v-if="profileError" type="error" class="mt-4" :text="profileError" />
            <v-alert v-else-if="profileSaved" type="success" class="mt-4" text="资料已更新" />
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" :loading="profileSaving" @click="submitProfile">
              保存
            </v-btn>
          </v-card-actions>
        </v-card>

        <v-card>
          <v-card-title class="text-h6">
            修改密码
          </v-card-title>

          <v-card-text>
            <v-text-field v-model="oldPassword" label="当前密码" type="password" />
            <v-text-field v-model="newPassword" label="新密码" type="password" hint="至少 8 位" persistent-hint />
            <v-text-field
              v-model="confirmPassword"
              label="确认新密码"
              type="password"
              @keydown.enter="submitPassword"
            />

            <v-alert v-if="passwordError" type="error" class="mt-4" :text="passwordError" />
            <v-alert
              v-else-if="passwordSaved"
              type="success"
              class="mt-4"
              text="密码已更新，其他设备上的登录状态已失效"
            />
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" :loading="passwordSaving" @click="submitPassword">
              修改密码
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
