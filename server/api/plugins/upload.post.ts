import { readMultipartFormData } from 'h3'
import { sep } from 'node:path'
import { requireApiUser } from '../../utils/api-token'
import { appError } from '../../utils/errors'
import { ensureArtifactDir, safeRelativePath, writeArtifactFile } from '../../utils/artifacts'
import {
  assertVersionAvailable,
  createPluginVersion,
  deletePluginVersion,
  manifestFromPluginJson,
  resolvePluginForUpload,
} from '../../services/plugins'

// 面板编译完成后把整个插件包传上来。文件用 multipart 逐份提交，字段名是它在包内的
// 相对路径；插件信息取自包里的 plugin.json，包是自描述的，不用再单独交一份。
// 新版本一律进入审核队列。

const MAX_FILES = 200
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

/** package.json 里的清单：panel 端描述整包，daemon 单端包用自己的。 */
const MANIFEST_FILES = ['panel/plugin.json', 'daemon/plugin.json']

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
  const entries: Array<{ relativeFile: string; data: Buffer }> = []
  for (const part of files) {
    const filename = part.filename ?? ''
    let relativeFile: string
    try {
      relativeFile = safeRelativePath(filename)
    } catch (error) {
      throw appError(400, 'VALIDATION_ERROR', (error as Error).message)
    }
    totalBytes += part.data.byteLength
    entries.push({ relativeFile, data: part.data })
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw appError(413, 'PAYLOAD_TOO_LARGE', '插件包总大小不能超过 20MB')
  }

  const manifestFile = MANIFEST_FILES.map((candidate) =>
    entries.find((entry) => entry.relativeFile.split(sep).join('/') === candidate)
  ).find((entry) => entry !== undefined)
  if (!manifestFile) {
    throw appError(400, 'VALIDATION_ERROR', `插件包里缺少 ${MANIFEST_FILES[0]}`)
  }

  let parsedManifest: unknown
  try {
    parsedManifest = JSON.parse(manifestFile.data.toString('utf8'))
  } catch {
    throw appError(400, 'VALIDATION_ERROR', 'plugin.json 不是合法的 JSON')
  }
  const manifest = manifestFromPluginJson(parsedManifest)

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
