/**
 * The pictures a business's listing page holds of the business itself (`listing-page.mjs`): the logo and the images
 * its own JSON-LD business node names (`logo`, `image`), and the page's `og:image`, which a listing page sets to the
 * listing's picture. Nothing else on the page is taken: the other pictures of a directory page are the directory's
 * (its own logo, adverts, other businesses), and its icons (`icon`, `apple-touch-icon`) are too small to use.
 * A Next.js listing page adds its own gallery from its page data (`listing-next-data.mjs`). One picture served under
 * two addresses (the original and the page's proxy of it, or two sizes of it) is given once, the first address kept.
 * Pure: every address returned is untrusted page data, downloaded later by the media rules (`media-store.js`).
 */
import { businessNodeOf, extractPage, ldBlocksOf } from './website-crawler.mjs'
import { listingGalleryOfNextData, pictureKeyOf } from './listing-next-data.mjs'

/** Most pictures one listing page gives. */
export const LISTING_PICTURES_MAX = 10

const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])

function absolute(u, base) {
  if (typeof u !== 'string' || !u.trim() || /^(data|javascript|blob):/i.test(u.trim())) return null
  try {
    const url = new URL(u.trim(), base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

const addressOf = (v) => (typeof v === 'string' ? v : (v?.url ?? v?.contentUrl))

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {Array<{url: string, kind: 'image', sourceUrl: string, role?: 'logo', caption?: string}>}
 */
export function listingPicturesOf(html, pageUrl) {
  const out = []
  const keys = new Set()
  const add = (u, extra = {}) => {
    const url = absolute(u, pageUrl)
    if (!url || keys.has(pictureKeyOf(url))) return
    keys.add(pictureKeyOf(url))
    out.push({ url, kind: 'image', sourceUrl: pageUrl, ...extra })
  }
  const node = businessNodeOf(ldBlocksOf(html))?.node
  if (node) {
    for (const l of arr(node.logo)) add(addressOf(l), { role: 'logo' })
    for (const i of arr(node.image)) {
      const caption = typeof i?.caption === 'string' && i.caption.trim() ? i.caption.trim() : null
      add(addressOf(i), caption ? { caption: caption.slice(0, 2000) } : {})
    }
  }
  for (const u of listingGalleryOfNextData(html)) add(u)
  for (const hint of extractPage(html, pageUrl).logos) if (hint.via === 'og-image') add(hint.url)
  return out.slice(0, LISTING_PICTURES_MAX)
}
