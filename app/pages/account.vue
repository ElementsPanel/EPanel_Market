<script setup lang="ts">
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '../../shared/utils/avatar'

definePageMeta({ middleware: 'auth' })

const { user, avatarUrl, updateUser, uploadAvatar, deleteAvatar, errorMessage } = useAuth()
const toast = useToast()

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

async function submitProfile() {
  if (profileSaving.value) return
  if (!displayName.value.trim()) {
    toast.error('请填写显示名称')
    return
  }

  profileSaving.value = true
  try {
    const result = await updateUser({
      displayName: displayName.value,
      email: emailChanged.value ? email.value : undefined,
      currentPassword: emailChanged.value ? currentPassword.value : undefined,
    })
    currentPassword.value = ''
    email.value = result.user.email
    displayName.value = result.user.displayName
    toast.success(result.pendingEmail ? `验证邮件已发送至 ${result.pendingEmail}，验证后更换邮箱` : '资料已更新')
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    profileSaving.value = false
  }
}

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)

async function submitPassword() {
  if (passwordSaving.value) return
  if (newPassword.value !== confirmPassword.value) {
    toast.error('两次输入的新密码不一致')
    return
  }

  passwordSaving.value = true
  try {
    await updateUser({ newPassword: newPassword.value, currentPassword: oldPassword.value })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.success('密码已更新，其他设备上的登录状态已失效')
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    passwordSaving.value = false
  }
}

// VFileInput 在单选模式下给出单个 File
const avatarFile = ref<File | null>(null)
const avatarBusy = ref(false)

async function submitAvatar() {
  if (avatarBusy.value) return

  const file = avatarFile.value
  if (!file) {
    toast.error('请先选择一张图片')
    return
  }
  if (file.size > AVATAR_MAX_BYTES) {
    toast.error(`图片不能超过 ${maxMb}MB`)
    return
  }

  avatarBusy.value = true
  try {
    await uploadAvatar(file)
    avatarFile.value = null
    toast.success('头像已更新')
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    avatarBusy.value = false
  }
}

async function removeAvatar() {
  if (avatarBusy.value) return

  avatarBusy.value = true
  try {
    await deleteAvatar()
    avatarFile.value = null
    toast.success('头像已删除')
  } catch (error) {
    toast.error(errorMessage(error))
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
              :disabled="avatarBusy"
              label="选择图片"
              prepend-icon=""
              :hint="`支持 PNG / JPEG / WebP，最大 ${maxMb}MB`"
              persistent-hint
            />
          </v-card-text>

          <v-card-actions>
            <v-btn
              variant="text"
              :disabled="avatarBusy || !user?.avatarVersion"
              :loading="avatarBusy"
              @click="removeAvatar"
            >
              删除头像
            </v-btn>
            <v-spacer />
            <v-btn
              color="primary"
              :disabled="avatarBusy || !avatarFile"
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
              hint="更换邮箱需要验证当前密码和新邮箱"
              persistent-hint
              @keydown.enter="submitProfile"
            />
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
