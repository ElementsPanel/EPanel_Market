<script setup lang="ts">
import type { PluginSide } from '../../shared/types/plugins'
import { apiErrorMessage } from '../utils/apiError'

interface DownloadTarget {
  side: PluginSide
  label: string
  href: string
}

const props = defineProps<{
  targets: DownloadTarget[]
  /** 页头用默认大小的实心按钮，版本行里用小一号的 tonal 按钮。 */
  prominent?: boolean
}>()

const size = computed(() => (props.prominent ? undefined : 'small'))
const variant = computed(() => (props.prominent ? 'flat' : 'tonal'))
const downloading = ref<PluginSide | null>(null)
const toast = useToast()

async function download(target?: DownloadTarget) {
  if (!target || downloading.value) return
  downloading.value = target.side
  try {
    const response = await fetch(target.href)
    if (!response.ok) {
      const data = await response.json().catch(() => undefined)
      throw new Error(apiErrorMessage({ data }, '下载失败，请稍后重试'))
    }

    const disposition = response.headers.get('content-disposition') ?? ''
    const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : /filename="([^"]+)"/i.exec(disposition)?.[1] ?? `${target.side}.zip`
    const url = URL.createObjectURL(await response.blob())
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.success('已开始下载')
  } catch (error) {
    toast.error(apiErrorMessage(error, '下载失败，请稍后重试'))
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <v-menu v-if="targets.length > 1" location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        color="primary"
        :size="size"
        :variant="variant"
        prepend-icon="mdi-download"
        append-icon="mdi-menu-down"
        :loading="Boolean(downloading)"
        :disabled="Boolean(downloading)"
        v-bind="menuProps"
      >
        下载
      </v-btn>
    </template>
    <v-list min-width="200">
      <v-list-item
        v-for="target in targets"
        :key="target.side"
        :href="target.href"
        :title="target.label"
        :disabled="Boolean(downloading)"
        prepend-icon="mdi-download"
        @click.prevent="download(target)"
      />
    </v-list>
  </v-menu>

  <v-btn
    v-else
    color="primary"
    :size="size"
    :variant="variant"
    prepend-icon="mdi-download"
    :href="targets[0]?.href"
    :loading="Boolean(downloading)"
    :disabled="!targets.length || Boolean(downloading)"
    @click.prevent="download(targets[0])"
  >
    下载
  </v-btn>
</template>
