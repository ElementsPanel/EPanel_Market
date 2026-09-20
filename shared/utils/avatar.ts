export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number]
