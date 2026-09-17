import { getRequestURL, sendRedirect } from 'h3'
import { isInitialized } from '../utils/config'

/** 这些请求必须与初始化状态无关地放行，否则会出现重定向死循环 */
function shouldSkip(pathname: string): boolean {
  if (pathname.startsWith('/api/setup')) return true
  if (pathname.startsWith('/_') || pathname.startsWith('/__')) return true // /_nuxt /_payload /_ipx
  if (pathname.startsWith('/@')) return true // dev: /@vite /@fs /@id
  if (pathname.includes('_payload')) return true
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true // 静态资源
  return false
}

function isSetupPage(pathname: string): boolean {
  return pathname === '/setup' || pathname.startsWith('/setup/')
}

export default defineEventHandler((event) => {
  let pathname = '/'
  try {
    pathname = getRequestURL(event).pathname
  } catch {
    return
  }

  let initialized = false
  try {
    initialized = isInitialized()
  } catch {
    // 配置读取异常时不拦截，交给具体的 handler 报错
    return
  }

  // 已初始化后不应再停留在配置页
  if (isSetupPage(pathname)) {
    return initialized ? sendRedirect(event, '/', 302) : undefined
  }

  if (shouldSkip(pathname)) return

  if (!initialized) {
    if (pathname.startsWith('/api/')) {
      throw createError({
        statusCode: 503,
        statusMessage: 'NOT_INITIALIZED',
        data: { code: 'NOT_INITIALIZED', message: '应用尚未初始化' },
      })
    }
    return sendRedirect(event, '/setup', 302)
  }
})
