/**
 * What a Next.js listing page keeps in its page data (`__NEXT_DATA__` `props.pageProps.merchantData`) beside the
 * rating `listingRatingOfNextData` reads: the listing's own photo gallery and its description. Shape as magicpin
 * answered a plain request (17/11/2026): `photos.image_url` (the cover), `photos.more_images[]` with `image` and
 * `media_type` "IMAGE" or "VIDEO", `galleryImages[]`, `coverPic`, `profileCover.url`, `description`. Guests' photos
 * (`customerImages`) are not the business's own and are left out. Pure: every address is untrusted page data.
 */

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const arr = (v) => (Array.isArray(v) ? v : [])

/** The page data's `merchantData`, or null when the page holds none. */
export function merchantOfNextData(html) {
  const m = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html ?? ''))
  if (!m) return null
  try {
    const merchant = JSON.parse(m[1])?.props?.pageProps?.merchantData
    return merchant && typeof merchant === 'object' && !Array.isArray(merchant) ? merchant : null
  } catch {
    return null
  }
}

/** An entry of a gallery list: an address, or an object naming one; a video entry is no picture. */
function pictureAddressOf(entry) {
  if (typeof entry === 'string') return text(entry)
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.media_type === 'string' && entry.media_type.toUpperCase() !== 'IMAGE') return null
  return text(entry.image) ?? text(entry.url) ?? text(entry.image_url) ?? text(entry.media_url)
}

/**
 * The pictures of the listing's own gallery, the cover first, in page order.
 * @param {string} html
 * @returns {string[]} addresses as the page gives them (relative ones resolved by the caller)
 */
export function listingGalleryOfNextData(html) {
  const merchant = merchantOfNextData(html)
  if (!merchant) return []
  const photos = merchant.photos && typeof merchant.photos === 'object' ? merchant.photos : {}
  return [
    text(photos.image_url),
    text(merchant.coverPic),
    text(merchant.profileCover?.url),
    ...arr(photos.more_images).map(pictureAddressOf),
    ...arr(merchant.galleryImages).map(pictureAddressOf)
  ].filter(Boolean)
}

/**
 * The listing's description as its page data states it, at most 2000 characters, or null.
 * @param {string} html
 * @returns {string | null}
 */
export function listingDescriptionOfNextData(html) {
  const description = text(merchantOfNextData(html)?.description)
  return description ? description.slice(0, 2000) : null
}

/**
 * The key two addresses of one picture share: a proxy's `url` parameter when it carries the original
 * (`/api/…/og?url=https%3A…`, `/_next/image?url=…`), and without a trailing image-size suffix (`=s750`, `=w800-h600`).
 * @param {string} address an absolute address
 */
export function pictureKeyOf(address) {
  let url
  try {
    url = new URL(address)
  } catch {
    return address
  }
  const inner = url.searchParams.get('url')
  if (inner && /^https?:\/\//i.test(inner)) return pictureKeyOf(inner)
  return `${url.origin}${url.pathname.replace(/=(?:[swh]\d+)(?:-[a-z0-9]+)*$/i, '')}${url.search}`
}
