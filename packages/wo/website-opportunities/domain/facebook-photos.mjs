import { fetchLimited } from './fetch-limited.mjs'

/**
 * Facebook pictures at the size the page owner uploaded.
 *
 * The posts actor hands out feed-sized pictures (`ctp=s590x590`, `p843x403`): the CDN signature binds
 * the requested box, so the URL cannot be rewritten. The public photo page
 * (`facebook.com/photo/?fbid=<id>`, no login) embeds the same picture at its original size
 * (`ctp=s1280x720`, with `width`/`height`). Measured 18/10/2026 on facebook.com/MarigoldHoiAn:
 * 14 of 14 photos came back at their original size (1000–1280 px wide). Facebook serves the full
 * page only to a browser User-Agent; with Tracy's own it returns a shell without the picture.
 */

const PHOTO_PAGE = 'https://www.facebook.com/photo/?fbid='
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
/** Photo pages read per collect call; each is one plain GET of ~650 KB. */
export const PHOTO_PAGE_MAX = 24
const PAGE_MAX_BYTES = 3 * 1024 * 1024
const PAGE_TIMEOUT_MS = 15_000

function box(v) {
  const m = /^[a-z]*?(\d+)x(\d+)$/.exec(v ?? '')
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

/** `served` = the box the URL asks for (`ctp`), `original` = the uploaded size (`cstp=mxWxH`). */
export function facebookPictureSize(url) {
  let q
  try {
    q = new URL(url).searchParams
  } catch {
    return { served: null, original: null }
  }
  return { served: box(q.get('ctp')), original: box(q.get('cstp')) }
}

export function facebookPhotoPageUrl(photoId) {
  return typeof photoId === 'string' && /^\d+$/.test(photoId) ? `${PHOTO_PAGE}${photoId}` : null
}

function fileName(url) {
  try {
    return new URL(url).pathname.split('/').pop() || null
  } catch {
    return null
  }
}

/** The largest sized node in a photo page that is the same file as `smallUrl`, or null. */
export function largestPhotoInPage(html, smallUrl) {
  const name = fileName(smallUrl)
  if (typeof html !== 'string' || !name) return null
  let best = null
  for (const x of html.matchAll(/"uri":"(https:[^"]+)","width":(\d+),"height":(\d+)/g)) {
    let url
    try {
      url = JSON.parse(`"${x[1]}"`)
    } catch {
      continue
    }
    const width = Number(x[2])
    if (fileName(url) === name && (!best || width > best.width)) best = { url, width, height: Number(x[3]) }
  }
  return best
}

const wider = (m) => {
  const { served, original } = facebookPictureSize(m.url)
  return Boolean(served && original && original.width > Math.max(served.width, m.width ?? 0))
}

/**
 * Swaps each feed-sized photo for its original from the public photo page; the feed URL stays as
 * `fallbackUrl`. Never throws: a page that fails or lacks the picture leaves the small one.
 * Returns the coverage line for the source, or undefined when no photo needed a page.
 * Also run by the executor's media stage on items collected earlier (a research that found
 * nothing new still gets its stored feed-size photos replaced by their originals).
 */
export async function upgradeFacebookPhotos(media, deps = {}) {
  const max = deps.photoPageMax ?? PHOTO_PAGE_MAX
  // A photo already swapped (`fallbackUrl`), or whose page was read and held nothing larger
  // (`photoPage: 'none'`), is not read again on a later research; a page that failed is.
  const due = media.filter(
    (m) =>
      m.kind === 'image' &&
      !m.fallbackUrl &&
      m.photoPage !== 'none' &&
      facebookPhotoPageUrl(m.photoId) &&
      wider(m)
  )
  if (!due.length) return undefined
  let tried = 0
  let upgraded = 0
  for (const m of due.slice(0, max)) {
    tried += 1
    let res
    try {
      res = await fetchLimited(facebookPhotoPageUrl(m.photoId), {
        fetch: deps.fetch,
        resolve: deps.resolve,
        headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' },
        maxBytes: PAGE_MAX_BYTES,
        timeoutMs: PAGE_TIMEOUT_MS
      })
    } catch {
      continue
    }
    if (!res || res.status < 200 || res.status >= 300) continue
    const big = largestPhotoInPage(new TextDecoder().decode(res.bytes), m.url)
    if (!big || big.width <= (m.width ?? 0)) {
      m.photoPage = 'none'
      continue
    }
    m.fallbackUrl = m.url
    Object.assign(m, big)
    upgraded += 1
  }
  const skipped = due.length - tried
  return skipped ? { tried, upgraded, skipped } : { tried, upgraded }
}
