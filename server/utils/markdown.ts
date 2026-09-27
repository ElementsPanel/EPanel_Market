import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

/**
 * 插件自述（包里的 README.md）→ 安全的 HTML。
 *
 * 白名单与面板的 `markdownToHTML`（panel/plugins/console/src/tools/safe.ts）完全一致，
 * 两边要一起改：自述来自上传的包，属于不可信输入，标签与属性都只放行渲染文档需要的那些。
 * 列表项 `li` 与表头 `thead` 必须在内，否则列表会被压成一行文字。
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
  'thead',
  'ul',
  'ol',
  'li',
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
  'font',
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
