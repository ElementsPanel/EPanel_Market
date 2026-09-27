/**
 * 登录、注册后要回去的站内地址。只接受以单个 `/` 开头、第二个字符不是斜杠的路径：
 * `//host` 是协议相对地址，`/\host` 浏览器也会当成它，两者都会跳去别的站点。
 * 其余一律回首页。
 */
export function safeNextPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}

/** 带上回跳地址的登录 / 注册页链接；回首页时不带参数。 */
export function withNextPath(page: '/login' | '/register', next: string): string {
  return next === '/' ? page : `${page}?next=${encodeURIComponent(next)}`
}
