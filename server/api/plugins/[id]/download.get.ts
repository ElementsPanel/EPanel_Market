import { listArtifactSides, listSideEntries } from '../../../utils/artifacts'
import { resolveDownloadSide, resolveDownloadVersion } from '../../../services/plugins'
import { createZip } from '../../../utils/zip'
import { appError } from '../../../utils/errors'

// 按端打包下载：一次拿到某一端的完整目录树，解压即可放进对应端的插件目录。
//
// 面板安装走的是另一条路——`/files` 拿清单、`/file` 逐个取，由面板自己写盘。这个
// 接口是给人在浏览器里用的，两者并存。

export default defineEventHandler(async (event): Promise<Buffer> => {
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) throw appError(400, 'VALIDATION_ERROR', '缺少插件标识')

  const query = getQuery(event) as Record<string, string | undefined>
  const { plugin, version } = await resolveDownloadVersion(id, query.version?.trim())

  const side = resolveDownloadSide(listArtifactSides(version.artifactPath), query.side)
  const entries = listSideEntries(version.artifactPath, side)
  if (!entries.length) throw appError(404, 'NOT_FOUND', `该版本不包含 ${side} 端`)

  const zip = createZip(entries)
  // 版本号允许非 ASCII，所以给出一个 ASCII 兜底名再补 filename*。
  const filename = `${plugin.name}-${version.version}-${side}.zip`
  const fallback = filename.replace(/[^A-Za-z0-9._-]/g, '_')
  setResponseHeaders(event, {
    'content-type': 'application/zip',
    'content-length': String(zip.byteLength),
    'x-content-type-options': 'nosniff',
    'content-disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  })

  return zip
})
