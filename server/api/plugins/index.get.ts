import { listIndexedPlugins } from '../../services/npm-plugins'

// 首页插件列表：npm 索引里的全部插件。

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>

  return await listIndexedPlugins({
    q: query.q,
    category: query.category,
    page: Number(query.page ?? 1),
    pageSize: Number(query.pageSize ?? 0) || undefined,
  })
})
