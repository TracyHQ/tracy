import type { MediaValue } from 'emdash'

/**
 * A usable URL for an image/file value, or null when the field is empty.
 *
 * Values written through the admin API come back with `id` + `meta.storageKey` and NO `src`
 * (measured on 0.37: the server drops the URL and rebuilds it at render). The local provider
 * serves the file at `/_emdash/api/media/file/<storageKey>`; external values keep `src`/`url`.
 */
export function mediaUrl(
  value:
    | MediaValue
    | { src?: string; url?: string; id?: string; meta?: Record<string, unknown> }
    | string
    | null
    | undefined
): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  const v = value as any
  const key = v.meta?.storageKey
  // Local media must follow the viewing origin, including private-site previews.
  // A configured public origin may require a different authentication session.
  if ((!v.provider || v.provider === 'local') && typeof key === 'string' && key)
    return `/_emdash/api/media/file/${key}`
  if (v.src) return v.src
  if (v.url) return v.url
  return null
}

/**
 * A usable URL for a Portable Text image block's `asset`, or null when there is none.
 *
 * EmDash stores `asset.url` as an absolute URL on the configured public origin and its default
 * block component renders it as such — a direct preview or a private proxy at another origin then
 * gets a cross-origin image the browser refuses to decode (ORB). Local media follows the viewing
 * origin instead, exactly like mediaUrl(); external providers keep their URL.
 */
export function bodyImageUrl(
  asset: { _ref?: string; url?: string; provider?: string } | null | undefined
): string | null {
  if (!asset) return null
  const external = asset.provider && asset.provider !== 'local'
  if (external) return asset.url ?? null
  if (asset.url) {
    const path = asset.url.startsWith('/') ? asset.url : safePathname(asset.url)
    if (path?.startsWith('/_emdash/api/media/file/')) return path
    if (path === null) return asset.url
    // Any other absolute URL is an external image the editor pasted; keep it.
    if (!asset.url.startsWith('/')) return asset.url
  }
  return asset._ref ? `/_emdash/api/media/file/${asset._ref}` : null
}
function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}
