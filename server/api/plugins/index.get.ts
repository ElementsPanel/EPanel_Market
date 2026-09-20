import { listPublishedPlugins } from '../../services/plugins'

// 首页插件列表：只返回已上架且有已通过版本的插件。

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>

  return await listPublishedPlugins({
    q: query.q,
    category: query.category,
    page: Number(query.page ?? 1),
    pageSize: Number(query.pageSize ?? 0) || undefined,
  })
})
