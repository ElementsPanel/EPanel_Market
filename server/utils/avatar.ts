import { createHash } from 'node:crypto'
import { getRequestHeader, readRawBody, type H3Event } from 'h3'
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type AvatarMimeType } from '../../shared/utils/avatar'
import { appError } from './errors'

/** 以文件头为准判断真实类型：客户端给的 Content-Type 不可信。 */
function detectImageType(data: Buffer): AvatarMimeType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from(png))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

/**
 * 头像以原始二进制提交（不是 multipart），省去一堆解析；请求体和头部一样属于可信边界之外，
 * 所以类型要嗅探、大小要在读完之后再复查一遍。
 */
export async function readAvatarUpload(event: H3Event) {
  const contentType = getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''

  if (!AVATAR_MIME_TYPES.includes(contentType as AvatarMimeType)) {
    throw appError(415, 'VALIDATION_ERROR', '头像仅支持 PNG、JPEG 或 WebP 图片')
  }

  const tooLarge = () => appError(413, 'PAYLOAD_TOO_LARGE', `头像不能超过 ${AVATAR_MAX_BYTES / 1024 / 1024}MB`)
  if (Number(getRequestHeader(event, 'content-length')) > AVATAR_MAX_BYTES) throw tooLarge()

  const body = await readRawBody(event, false)
  const data = body?.length ? body : Buffer.alloc(0)
  if (data.length > AVATAR_MAX_BYTES) throw tooLarge()

  if (!data.length || detectImageType(data) !== contentType) {
    throw appError(400, 'VALIDATION_ERROR', '图片内容无效，请选择有效的 PNG、JPEG 或 WebP 图片')
  }

  return {
    data,
    contentType: contentType as AvatarMimeType,
    version: createHash('sha256').update(data).digest('hex'),
  }
}
