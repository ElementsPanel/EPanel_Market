import { listArtifactFiles } from '../../../utils/artifacts'
import { resolveDownloadVersion } from '../../../services/plugins'
import { appError } from '../../../utils/errors'

// 安装插件前先取文件清单：面板据此逐个下载，市场不需要打包成 zip。

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event) as Record<string, string | undefined>
  const { plugin, version } = await resolveDownloadVersion(id, query.version?.trim())

  return {
    pluginId: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName,
    versionId: version.id,
    version: version.version,
    files: listArtifactFiles(version.artifactPath),
  }
})
