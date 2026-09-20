import { readArtifactFile } from '../../../utils/artifacts'
import { resolveDownloadVersion } from '../../../services/plugins'
import { appError } from '../../../utils/errors'

// 逐文件下载。`path` 会被 safeRelativePath 校验，取不到产物目录之外的东西。

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event) as Record<string, string | undefined>
  const path = String(query.path ?? '')
  if (!path) throw appError(400, 'VALIDATION_ERROR', '缺少文件路径')

  const { version } = await resolveDownloadVersion(id, query.version?.trim())

  try {
    setHeader(event, 'content-type', 'application/octet-stream')
    return readArtifactFile(version.artifactPath, path)
  } catch {
    throw appError(404, 'NOT_FOUND', `插件包里没有这个文件：${path}`)
  }
})
