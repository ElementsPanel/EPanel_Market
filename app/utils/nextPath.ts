/**
 * 登录、注册后要回去的站内地址。只接受以单个 `/` 开头、第二个字符不是斜杠的路径：
 * `//host` 是协议相对地址，`/\host` 浏览器也会当成它，两者都会跳去别的站点。
 * 其余一律回首页。
 */
export function safeNextPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/[\u0000-\u001f\u007f]/.test(value) ? value : '/'
}

export function authDialogLocation(view: 'login' | 'register', next: unknown = '/') {
  const path = safeNextPath(next)
  return { path: '/', query: { auth: view, ...(path === '/' ? {} : { next: path }) } }
}
