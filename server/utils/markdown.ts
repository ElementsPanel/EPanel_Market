import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

/**
 * 插件自述（包里的 README.md）→ 安全的 HTML。
 *
 * 白名单与面板的 `markdownToHTML`（panel/plugins/console/src/tools/safe.ts）保持一致：
 * 自述来自上传的包，属于不可信输入，标签与属性都只放行渲染文档需要的那些。
 */

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'b',
  'i',
  'em',
  'strong',
  'a',
  'p',
  'table',
  'ul',
  'ol',
  'img',
  'pre',
  'blockquote',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'br',
  'code',
]

export function renderMarkdown(markdown: string): string {
  if (!markdown.trim()) return ''
  return sanitizeHtml(marked.parse(markdown), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target'],
      img: ['height', 'width', 'src', 'alt'],
    },
  })
}
