import { listArtifactFileDigests, readArtifactCompatibility } from '../../../utils/artifacts'
import { assertClientCompatible, resolveDownloadVersion } from '../../../services/plugins'
import { appError } from '../../../utils/errors'
import type { PluginFilesResult } from '../../../../shared/types/plugins'

// 安装插件前先取文件清单：面板据此逐个下载，市场不需要打包成 zip。
//
// 面板带着 `pluginApi` / `pluginSdk` 来问，声明了兼容性的包只交给版本一致的客户端（否则
// 409）。清单里每个文件都带大小与 SHA-256，面板写盘、分发到节点之前据此核对下载到的字节。

export default defineEventHandler(async (event): Promise<PluginFilesResult> => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event) as Record<string, string | undefined>
  const { plugin, version } = await resolveDownloadVersion(id, query.version?.trim())

  const compatibility = readArtifactCompatibility(version.artifactPath)
  assertClientCompatible(compatibility, { pluginApi: query.pluginApi, pluginSdk: query.pluginSdk })

  let files: PluginFilesResult['files']
  try {
    files = listArtifactFileDigests(version.artifactPath)
  } catch {
    // 产物在列目录与读文件之间被删掉了（管理员删插件，或上传回退）：对调用方来说
    // 这个版本就是没有了，不是服务器出错。
    throw appError(404, 'NOT_FOUND', '该版本的插件包已不可用')
  }

  return {
    pluginId: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName,
    versionId: version.id,
    version: version.version,
    compatibility,
    files,
  }
})
