/**
 * The stylesheets and fonts of a demo, served through Tracy's own origin for the Add site preview
 * (14/10/2026: every icon of a preview was an empty square, and some templates fell back to
 * the system font).
 *
 * The preview is an `<iframe srcDoc>`: its origin is Tracy's. A font is a CORS fetch, and a demo
 * (`<label>.tracy.site`) sends no `Access-Control-Allow-Origin`, so every web font a template's
 * stylesheet names (Font Awesome, Ionicons, its own text faces) was refused. Pictures and stylesheets
 * load cross-origin without CORS; fonts do not.
 *
 * - {@link stylesheetsToAssets}: in the page, a `<link rel="stylesheet">` of the demo itself points at
 *   this door instead, so the stylesheet is same-origin with the frame.
 * - {@link cssForPreview}: in such a stylesheet, a font of the demo points at this door too; every other
 *   relative address (a background picture, a cursor) is made absolute at the demo's public address,
 *   since the stylesheet is no longer served from there.
 * - {@link mountDesignSystemPreviewAssets}: `GET /api/design-system/preview-asset?quickstart=<tag>&path=<path>`.
 *
 * 🔒 ONLY THE DEMO THE SERVER RESOLVED IS READ, as the preview door reads it: the request names a
 * quickstart tag and a path, never an address; the host is where the preview door reads the demo (`innerOf`:
 * its web container on this host, its public address on another). Only
 * stylesheets and font files, at most {@link ASSET_MAX} bytes each. NOTHING IS WRITTEN.
 */
import { previewPathOf } from './design-system-preview-links.js'

/** The largest stylesheet or font the door passes on. */
export const ASSET_MAX = 3_000_000
/** How long a fetched asset is kept in memory: a demo changes only when it is redeployed. */
export const ASSET_KEEP_MS = 10 * 60_000
/** Assets kept at most. */
export const ASSET_KEPT_MAX = 400

const FONT = /\.(woff2?|ttf|otf|eot)$/i
const CSS = /\.css$/i
const TYPES = /** @type {Record<string, string>} */ ({
  css: 'text/css; charset=utf-8',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject'
})

/** The kind of asset a path names, by its extension, or null when the door does not pass it on. */
export function assetKindOf(/** @type {string} */ path) {
  const pathname = String(path).split('?')[0]
  if (CSS.test(pathname)) return 'css'
  const m = FONT.exec(pathname)
  return m ? m[1].toLowerCase() : null
}

const attr = (/** @type {string} */ v) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The address of this door for one asset path of the demo the page came from.
 * @param {string} requestUrl the preview door's own request (its `quickstart` is kept)
 * @param {{ origin?: string | null }} [p] Tracy's own origin; none: the request's
 * @returns {(path: string) => string}
 */
export function assetLinkOf(requestUrl, { origin = null } = {}) {
  const url = new URL(requestUrl)
  const own = String(origin || url.origin).replace(/\/+$/, '')
  const tag = url.searchParams.get('quickstart') ?? ''
  return (path) => {
    const q = new URLSearchParams()
    q.set('quickstart', tag)
    q.set('path', path)
    return `${own}/api/design-system/preview-asset?${q.toString()}`
  }
}

/**
 * The page with each stylesheet of the demo itself loaded through this door. Only `<link>` elements
 * whose `rel` is `stylesheet` and whose `href` resolves (against `base`) to the demo's public host. PURE.
 * @param {string} html
 * @param {{ base: string, assetOf: (path: string) => string }} p `base`: the page's public address
 */
export function stylesheetsToAssets(html, { base, assetOf }) {
  const pub = new URL(base)
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag)) return tag
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag)
    if (!href) return tag
    let to
    try {
      to = new URL(href[2].replace(/&amp;/g, '&'), pub)
    } catch {
      return tag
    }
    if (to.hostname !== pub.hostname || assetKindOf(to.pathname) !== 'css') return tag
    const path = previewPathOf(`${to.pathname}${to.search}`)
    if (path === null) return tag
    return tag.replace(href[0], `href=${href[1]}${attr(assetOf(path))}${href[1]}`)
  })
}

/**
 * A stylesheet of the demo as the frame gets it from this door: a font (or an imported stylesheet) of
 * the demo through this door, every other relative address absolute at the demo's public address. PURE.
 * @param {string} css
 * @param {{ cssUrl: string, assetOf: (path: string) => string }} p `cssUrl`: where the demo serves it
 */
export function cssForPreview(css, { cssUrl, assetOf }) {
  const at = new URL(cssUrl)
  const swap = (/** @type {string} */ raw) => {
    const ref = raw.trim().replace(/^(["'])(.*)\1$/, '$2')
    if (!ref || /^(data|blob|about):/i.test(ref) || ref.startsWith('#')) return null
    let to
    try {
      to = new URL(ref, at)
    } catch {
      return null
    }
    if (to.hostname !== at.hostname) return null
    const kind = assetKindOf(to.pathname)
    if (kind) {
      const path = previewPathOf(`${to.pathname}${to.search}`)
      if (path !== null) return assetOf(path) + to.hash
    }
    return to.href
  }
  return css
    .replace(/url\(\s*([^)]*?)\s*\)/gi, (m, raw) => {
      const next = swap(raw)
      return next === null ? m : `url("${next.replace(/"/g, '%22')}")`
    })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, raw) => {
      const next = swap(raw)
      return next === null ? m : `@import "${next.replace(/"/g, '%22')}"`
    })
}

/**
 * `GET /api/design-system/preview-asset?quickstart=<tag>&path=<path>` — one stylesheet or font of the
 * quickstart's live demo, read on its web container, for the preview frame. Signed in (any seat, like
 * the preview door). Kept in memory per (demo deploy, path).
 * @param {import('hono').Hono} app
 * @param {{
 *   signedIn?: (c: any) => Promise<{ error?: Response, email?: string }>,
 *   demoOf: (tag: string) => Promise<any>,
 *   innerOf: (demo: { host: string, label: string, platform: string, address: string | null }) => URL | string,
 *   fetchImpl: typeof fetch,
 *   waitMs?: number,
 *   now?: () => number,
 *   origin?: string | null
 * }} deps
 */
export function mountDesignSystemPreviewAssets(app, deps) {
  const refuse = (/** @type {any} */ c, /** @type {number} */ status, /** @type {object} */ body) => {
    c.header('Cache-Control', 'private, no-store')
    return c.json(body, status)
  }
  const {
    signedIn = async (/** @type {any} */ c) => ({ error: refuse(c, 401, { code: 'NOT_SIGNED_IN' }) }),
    demoOf,
    innerOf,
    fetchImpl,
    waitMs = 8000,
    now = Date.now
  } = deps
  /** @type {Map<string, { at: number, body: Uint8Array | string, type: string }>} */
  const kept = new Map()

  app.get('/api/design-system/preview-asset', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const tag = String(c.req.query('quickstart') ?? '')
    const path = previewPathOf(c.req.query('path'))
    if (!tag || tag.length > 200 || path === null) return refuse(c, 400, { code: 'INVALID_REQUEST' })
    const kind = assetKindOf(path)
    if (!kind) return refuse(c, 400, { code: 'INVALID_REQUEST', reason: 'NOT_AN_ASSET' })
    let demo = null
    try {
      demo = await demoOf(tag)
    } catch {
      demo = null
    }
    if (!demo?.address) return refuse(c, 404, { code: 'NOT_FOUND' })
    let pub
    try {
      pub = new URL(String(demo.address))
    } catch {
      return refuse(c, 404, { code: 'NOT_FOUND' })
    }
    const key = [
      tag,
      demo.quickstart_version ?? '',
      demo.quickstart_sha256 ?? '',
      demo.port ?? '',
      path
    ].join('\n')
    const hit = kept.get(key)
    if (hit && now() - hit.at < ASSET_KEEP_MS) return sendPreviewAsset(c, hit)
    // The address goes with it: a demo on another host is read at its public address (`siteReadOrigin`).
    let inner
    try {
      inner = new URL(
        String(
          innerOf({ host: demo.host, label: demo.label, platform: demo.platform, address: demo.address })
        )
      )
    } catch {
      return refuse(c, 404, { code: 'NOT_FOUND' })
    }
    const read = await readPreviewAsset({
      path,
      inner,
      pub,
      fetchImpl,
      waitMs,
      now,
      assetOf: assetLinkOf(c.req.url, { origin: deps.origin })
    })
    if ('code' in read) return refuse(c, read.status, { code: read.code })
    const entry = read.entry
    if (kept.size >= ASSET_KEPT_MAX) kept.delete(kept.keys().next().value)
    kept.set(key, entry)
    return sendPreviewAsset(c, entry)
  })
}

/**
 * One stylesheet or font of a site, read on its web container (`inner`) told its public address (`pub`),
 * as a preview frame gets it: a stylesheet through {@link cssForPreview} (its fonts at `assetOf`), a font
 * as it is. Shared by the Add site door (a quickstart's demo) and the running site's door
 * (`design-system-site-preview-assets.js`). `path` must already be a checked same-site path of an asset.
 * @param {{ path: string, inner: URL, pub: URL, fetchImpl: typeof fetch, waitMs: number, now: () => number,
 *   assetOf: (path: string) => string }} p
 * @returns {Promise<{ entry: { at: number, body: Uint8Array | string, type: string } } | { status: number, code: string }>}
 */
export async function readPreviewAsset({ path, inner, pub, fetchImpl, waitMs, now, assetOf }) {
  const kind = assetKindOf(path)
  if (!kind) return { status: 400, code: 'INVALID_REQUEST' }
  const url = new URL(path, inner)
  if (url.origin !== inner.origin) return { status: 400, code: 'INVALID_REQUEST' }
  let res
  try {
    res = await fetchImpl(url, {
      redirect: 'manual',
      headers: { 'x-forwarded-host': pub.host, 'x-forwarded-proto': pub.protocol.replace(':', '') },
      signal: AbortSignal.timeout(waitMs)
    })
  } catch {
    return { status: 502, code: 'DEMO_UNREADABLE' }
  }
  if (!res.ok) return { status: res.status === 404 ? 404 : 502, code: 'DEMO_UNREADABLE' }
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > ASSET_MAX) return { status: 502, code: 'TOO_LARGE' }
  return {
    entry: {
      at: now(),
      type: TYPES[kind],
      body:
        kind === 'css'
          ? cssForPreview(new TextDecoder().decode(buf), { cssUrl: new URL(path, pub).href, assetOf })
          : buf
    }
  }
}

/** @param {any} c @param {{ body: Uint8Array | string, type: string }} entry */
export function sendPreviewAsset(c, entry) {
  c.header('Content-Type', entry.type)
  c.header('Cache-Control', 'private, max-age=600')
  c.header('X-Content-Type-Options', 'nosniff')
  return c.body(entry.body)
}
