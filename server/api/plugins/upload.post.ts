import { readMultipartFormData } from 'h3'
import { sep } from 'node:path'
import { requireApiUser } from '../../utils/api-token'
import { appError } from '../../utils/errors'
import { ensureArtifactDir, safeRelativePath, writeArtifactFile } from '../../utils/artifacts'
import { checkPluginPackage } from '../../utils/package-rules'
import {
  assertVersionAvailable,
  createPluginVersion,
  deletePluginVersion,
  manifestFromPluginJson,
  resolvePluginForUpload,
} from '../../services/plugins'

// 发布脚本编译完成后把整个插件包传上来。文件用 multipart 逐份提交，文件名是它在包内的
// 相对路径；插件信息取自包里的 plugin.json，包是自描述的，不用再单独交一份。
// 新版本一律进入审核队列。

const MAX_FILES = 200
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw appError(400, 'VALIDATION_ERROR', '上传内容为空')

  const files = parts.filter((part) => part.name === 'file')
  if (!files.length) throw appError(400, 'VALIDATION_ERROR', '插件包里没有文件')
  if (files.length > MAX_FILES) {
    throw appError(413, 'PAYLOAD_TOO_LARGE', `插件包最多包含 ${MAX_FILES} 个文件`)
  }

  let totalBytes = 0
  const entries: Array<{ relativeFile: string; path: string; data: Buffer }> = []
  for (const part of files) {
    const filename = part.filename ?? ''
    let relativeFile: string
    try {
      relativeFile = safeRelativePath(filename)
    } catch (error) {
      throw appError(400, 'VALIDATION_ERROR', (error as Error).message)
    }
    totalBytes += part.data.byteLength
    entries.push({ relativeFile, path: relativeFile.split(sep).join('/'), data: part.data })
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw appError(413, 'PAYLOAD_TOO_LARGE', '插件包总大小不能超过 20MB')
  }

  // 按面板与 daemon 安装时的规则把整个包查一遍：通过审核的包必须装得上。插件信息取自
  // 描述整包的那份 plugin.json（有 panel 端用它，daemon-only 包用 daemon 端的）。
  const checked = checkPluginPackage(entries)
  const manifest = manifestFromPluginJson(checked.manifest)

  const plugin = await resolvePluginForUpload(user.id, manifest)
  await assertVersionAvailable(plugin.id, manifest.version)

  const version = await createPluginVersion({
    pluginId: plugin.id,
    version: manifest.version,
    changelog: manifest.changelog ?? '',
    fileCount: entries.length,
    sizeBytes: totalBytes,
  })

  try {
    ensureArtifactDir(version.artifactPath)
    for (const entry of entries) {
      writeArtifactFile(version.artifactPath, entry.relativeFile, entry.data)
    }
  } catch (error) {
    // 只写了一半的产物没有意义，连同版本记录一起回退。
    await deletePluginVersion(version.id, version.artifactPath)
    throw error
  }

  return {
    pluginId: plugin.id,
    versionId: version.id,
    status: 'pending',
  }
})
