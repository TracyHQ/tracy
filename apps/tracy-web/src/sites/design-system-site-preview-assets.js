/**
 * The stylesheets and fonts of a RUNNING site, served through Tracy's own origin for the Design system
 * tab's preview popup (`GET /api/sites/:key/design-system/preview`, `design-system-site-reads.js`).
 *
 * Why (17/10/2026, JA Vital "LEARN MORE →"): the popup's page is an `<iframe srcDoc>` whose origin
 * is Tracy's, and a font is a CORS fetch. The site (`<label>.tracy.site`, `<label>.tracy.test`) sends no
 * `Access-Control-Allow-Origin`, so every icon font its stylesheets name (Font Awesome, T4 icons) was
 * refused and each icon drew an empty square, while the same system worn on the site itself drew them.
 * The Add site door had the same hole and got its own asset door on 14/10
 * (`design-system-preview-assets.js`); this is the running site's twin, sharing its reader.
 *
 * - {@link siteAssetLinkOf}: the address of this door for one asset path of the site a preview came from.
 * - {@link mountSiteDesignSystemPreviewAssets}: `GET /api/sites/:key/design-system/preview-asset?path=<path>`.
 *
 * 🔒 ONLY THE SITE THE SERVER RESOLVED IS READ, on its own web container (`innerOf`), never an address
 * the request names; any seat on the site may read it (`front`), as it may read the preview. Only
 * stylesheets and font files, at most `ASSET_MAX` bytes each. NOTHING IS WRITTEN.
 */
import { readPreviewAsset, sendPreviewAsset } from './design-system-preview-assets.js'
import { previewPathOf } from './design-system-preview-links.js'

/** How long a site's asset is kept: short, as a site's stylesheet changes when it is edited. */
export const SITE_ASSET_KEEP_MS = 60_000
/** Site assets kept at most (the oldest goes first). */
export const SITE_ASSET_KEPT_MAX = 400

/**
 * The address of this door for one asset path of the site whose preview the request asked for.
 * @param {string} requestUrl a request of the site's preview door or of this door (`/api/sites/<key>/design-system/preview…`)
 * @param {{ origin?: string | null }} [p] Tracy's own origin; none: the request's
 * @returns {(path: string) => string}
 */
export function siteAssetLinkOf(requestUrl, { origin = null } = {}) {
  const url = new URL(requestUrl)
  const own = String(origin || url.origin).replace(/\/+$/, '')
  const door = url.pathname.replace(/\/design-system\/preview(-asset)?$/, '/design-system/preview-asset')
  return (path) => `${own}${door}?${new URLSearchParams({ path }).toString()}`
}

/**
 * `GET /api/sites/:key/design-system/preview-asset?path=<path>` — one stylesheet or font of the running
 * site, read on its web container, for the preview frame. Kept in memory per (site, release, path).
 * @param {import('hono').Hono} app
 * @param {{
 *   front: (c: any) => Promise<{ error?: Response, siteKey?: any, site?: any }>,
 *   json: (c: any, body: any, status?: number) => Response,
 *   preview: { innerOf: (site: any) => URL, publicOf: (site: any) => string | null, fetchImpl: typeof fetch,
 *     waitMs?: number, origin?: string | null },
 *   now: () => number
 * }} deps
 */
export function mountSiteDesignSystemPreviewAssets(app, { front, json, preview, now }) {
  /** @type {Map<string, { at: number, body: Uint8Array | string, type: string }>} */
  const kept = new Map()
  const refuse = (/** @type {any} */ c, /** @type {number} */ status, /** @type {object} */ body) => {
    c.header('Cache-Control', 'private, no-store')
    return json(c, body, status)
  }

  app.get('/api/sites/:key/design-system/preview-asset', async (c) => {
    const f = await front(c)
    if (f.error) return f.error
    const path = previewPathOf(c.req.query('path'))
    if (path === null) return refuse(c, 400, { code: 'INVALID_REQUEST' })
    const { siteKey, site } = f
    let pub
    let inner
    try {
      pub = new URL(String(preview.publicOf(site)))
      inner = new URL(String(preview.innerOf(site)))
    } catch {
      return refuse(c, 404, { code: 'NOT_FOUND' })
    }
    const key = [siteKey, site.quickstart_version ?? '', path].join('\n')
    const hit = kept.get(key)
    if (hit && now() - hit.at < SITE_ASSET_KEEP_MS) return sendPreviewAsset(c, hit)
    const read = await readPreviewAsset({
      path,
      inner,
      pub,
      fetchImpl: preview.fetchImpl,
      waitMs: preview.waitMs ?? 8000,
      now,
      assetOf: siteAssetLinkOf(c.req.url, { origin: preview.origin })
    })
    if ('code' in read) return refuse(c, read.status, { code: read.code })
    kept.delete(key)
    kept.set(key, read.entry)
    while (kept.size > SITE_ASSET_KEPT_MAX) kept.delete(kept.keys().next().value)
    return sendPreviewAsset(c, read.entry)
  })
}
