/**
 * A design system preview the visitor can browse (12/10/2026, option B): the two preview doors
 * (`design-system-preview.js`, `design-system-site-reads.js`) take a `path=` of the same site, and every
 * page they serve has its same-site links pointed back at the door with that link's path, so the next page
 * the visitor opens in the popup's frame wears the system too, instead of leaving for the real site.
 *
 * - {@link previewPathOf}: the only paths a door reads: same-site, normalized, bounded. The HOST is never
 *   taken from the request: it is always the site or demo the server resolved (no SSRF).
 * - {@link navigableDocOf}: the page's anchors rewritten. Only `<a>` / `<area>` and `<form>`: the page keeps
 *   its `<base href>` at the site, so its pictures, stylesheets and fonts still load from the site itself.
 * - {@link previewMissPage}: the small page said inside the frame when a link leads nowhere a preview can go.
 */

/** The longest path (with its query) a door reads. */
export const PREVIEW_PATH_MAX = 512

const attr = (/** @type {string} */ v) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The few character references an `href` carries in practice (`&amp;` in a query string above all). */
const NAMED = /** @type {Record<string, string>} */ ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })
const unescapeAttr = (/** @type {string} */ v) =>
  v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ref) => {
    const r = String(ref).toLowerCase()
    if (r.startsWith('#x')) return String.fromCodePoint(Number.parseInt(r.slice(2), 16) || 0xfffd)
    if (r.startsWith('#')) return String.fromCodePoint(Number.parseInt(r.slice(1), 10) || 0xfffd)
    return NAMED[r] ?? m
  })

/** A dot segment, a slash, a backslash or a NUL written as percent escapes: never in a path a door reads. */
const ENCODED_TRICK = /%(2e|2f|5c|00)/i

/**
 * The path a preview door reads, or null. Accepted: starts with one `/` (never `//`), no scheme or host,
 * no backslash, no control character or raw whitespace, no `.` / `..` segment and none written as
 * escapes, no escaped slash, backslash or NUL in the path part, at most {@link PREVIEW_PATH_MAX}
 * characters. Answered normalized, as the URL parser writes it (pathname + query); a fragment is dropped.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function previewPathOf(raw) {
  if (typeof raw !== 'string' || raw === '' || raw.length > PREVIEW_PATH_MAX) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  // A backslash, whitespace or a control character (below 0x20, or DEL): never in a path a door reads.
  if (/[\\\s]/.test(raw) || [...raw].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f))
    return null
  const noHash = raw.split('#')[0]
  const pathPart = noHash.split('?')[0]
  if (ENCODED_TRICK.test(pathPart)) return null
  if (pathPart.split('/').some((seg) => seg === '.' || seg === '..')) return null
  let url
  try {
    url = new URL(noHash, 'http://preview.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'http://preview.invalid') return null
  const out = `${url.pathname}${url.search}`
  return out.length > PREVIEW_PATH_MAX || out.startsWith('//') ? null : out
}

/** One tag with its attributes; a quoted value may hold `>`. */
const TAG = /<(a|area|form)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
/** One attribute and its value, quoted or not; the leading space keeps `data-href` out. */
const attrRe = (/** @type {string} */ name) =>
  new RegExp(`(\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
const HREF = attrRe('href')
const TARGET = new RegExp(attrRe('target').source, 'gi')
const REL = new RegExp(attrRe('rel').source, 'gi')
const ACTION = new RegExp(attrRe('action').source, 'gi')
const PING = new RegExp(attrRe('ping').source, 'gi')

/** The host a link names, without a leading `www.`: `www.shop.test` and `shop.test` are one site. */
const bareHost = (/** @type {URL} */ u) => u.hostname.toLowerCase().replace(/^www\./, '')
/**
 * Whether a link names the page's own site: the same host, whatever its scheme (`http`/`https`), its port
 * or a leading `www.` (a CMS that prints its own address with another scheme or port is still itself).
 * @param {URL} to
 * @param {URL} page
 */
const sameSite = (to, page) => bareHost(to) === bareHost(page)

const selfClose = (/** @type {string} */ rest) => /\/\s*$/.test(rest)

/**
 * The page with its links made browsable inside the preview (PURE):
 * - a link to the same site (`page`'s host, any scheme or port, with or without `www.`) goes to `doorOf(path)` in the same frame (`target="_self"`),
 *   keeping its fragment; a same-site link whose path a door would refuse opens the real page in a new tab;
 * - a bare `#fragment` goes to this same preview page with that fragment: the page's `<base>` is the site,
 *   so left alone it would navigate the frame to the real site;
 * - a link to another host opens a new tab (`target="_blank" rel="noopener noreferrer"`);
 * - `mailto:`, `tel:`, `javascript:` and links without an address stay as they are (the sandbox runs no
 *   script; nothing else here can leave the frame);
 * - every `<form>` gets `action="about:blank"` (the sandbox never submits one; this keeps it so);
 * - a `ping` attribute goes (it would POST from Tracy's origin on a click).
 * @param {string} html
 * @param {{ page: URL, doorOf: (path: string) => string }} p `page`: the page's public address
 * @returns {string}
 */
export function navigableDocOf(html, { page, doorOf }) {
  const here = previewPathOf(`${page.pathname}${page.search}`) ?? '/'
  return html.replace(TAG, (whole, name, rest) => {
    const tail = selfClose(rest) ? '/' : ''
    const body = tail ? rest.replace(/\/\s*$/, '') : rest
    if (name.toLowerCase() === 'form')
      return `<${name}${body.replace(ACTION, '')} action="about:blank"${tail}>`
    // `ping` would POST to any address on a click, from Tracy's origin: never carried.
    const unpinged = body.replace(PING, '')
    const m = HREF.exec(unpinged)
    if (!m) return unpinged === body ? whole : `<${name}${unpinged}${tail}>`
    const raw = unescapeAttr(m[3] ?? m[4] ?? m[5] ?? '').trim()
    const set = (/** @type {string} */ href, /** @type {string} */ extra) => {
      const kept = unpinged
        .replace(TARGET, '')
        .replace(REL, '')
        .replace(
          HREF,
          (/** @type {string} */ _all, /** @type {string} */ space) => `${space}href="${attr(href)}"`
        )
      return `<${name}${kept.trimEnd()}${extra}${tail}>`
    }
    if (raw.startsWith('#')) return set(`${doorOf(here)}${raw}`, ' target="_self"')
    let to
    try {
      to = new URL(raw, page)
    } catch {
      return `<${name}${unpinged}${tail}>`
    }
    if (to.protocol !== 'http:' && to.protocol !== 'https:') return `<${name}${unpinged}${tail}>`
    const newTab = ' target="_blank" rel="noopener noreferrer"'
    if (!sameSite(to, page)) return set(to.href, newTab)
    // A same-site link no door would read (an escape trick, too long): the real page, outside the frame.
    const path = previewPathOf(`${to.pathname}${to.search}`)
    if (path === null || ENCODED_TRICK.test(raw.split(/[?#]/)[0])) return set(to.href, newTab)
    return set(`${doorOf(path)}${to.hash}`, ' target="_self"')
  })
}

/**
 * The small page a door answers inside the frame when the asked page cannot be shown (not found, not a
 * page, it leaves the site, too many previews…): a title, one sentence, and a link back to the home page
 * of the same preview when there is one. No script; system fonts; light and dark.
 * @param {{ title: string, text: string, home?: string | null }} p
 * @returns {string}
 */
export function previewMissPage({ title, text, home = null }) {
  const back = home ? `<p><a href="${attr(home)}" target="_self">Back to the home page</a></p>` : ''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${attr(title)}</title><style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center}
h1{font-size:18px;font-weight:600;margin:0 0 8px}p{margin:0 0 12px;font-size:14px;opacity:.75}a{color:#bf5b3d}
</style></head><body><main><h1>${attr(title)}</h1><p>${attr(text)}</p>${back}</main></body></html>`
}

/**
 * The policy every preview answer carries, the page and the small page alike: a third party's page served
 * from Tracy's origin, with NO script, no form, no plugin, no automatic navigation (`sandbox` without
 * `allow-scripts` / `allow-forms`). Two allowances, both measured on the stand 12/10/2026:
 * - `allow-same-origin`: a page in an opaque-origin frame that follows a link goes out WITHOUT the
 *   `SameSite=Lax` session cookie (a cross-site initiator), so the door answered `401` to every click
 *   inside the preview; the same click from a same-origin frame carries it and the next page renders.
 *   Without a script nothing in the page can use that origin: no cookie read, no fetch, no DOM of the
 *   parent; `<form>` stays blocked and neutralised, `ping` is removed (`navigableDocOf`).
 * - `allow-popups allow-popups-to-escape-sandbox`: a link marked `target="_blank"` (another host) opens a
 *   new, ordinary tab; with no script only a click can open one.
 * Only Tracy's own pages may frame it (`frame-ancestors 'self'`). The popups' frames carry the same tokens
 * in their `sandbox` attribute (`preview-stage.tsx`, `design-system-stage.tsx`).
 */
export const PREVIEW_CSP =
  "sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'"

/**
 * The address of a page of the same preview: this door at Tracy's own origin (`origin`, the deployment's
 * `TRACY_ORIGIN`; the request's own when none is given), the door's own parameters `keep` as the request
 * gave them (nothing else from the query is carried), and `path`. Absolute, because the page's `<base>` is
 * the site.
 * @param {string} requestUrl
 * @param {{ origin?: string | null, keep: string[] }} p
 * @returns {(path: string) => string}
 */
export function doorLinkOf(requestUrl, { origin = null, keep }) {
  const url = new URL(requestUrl)
  const own = String(origin || url.origin).replace(/\/+$/, '')
  return (path) => {
    const q = new URLSearchParams()
    for (const name of keep) {
      const v = url.searchParams.get(name)
      if (v !== null) q.set(name, v)
    }
    q.set('path', path)
    return `${own}${url.pathname}?${q.toString()}`
  }
}

/** What the small page says for each refusal a framed ask can meet (English: tracy-web's own pages). */
const MISS_WORDS = /** @type {Record<string, [string, string]>} */ ({
  PAGE_NOT_FOUND: ['Page not found', 'This page was not found on the site.'],
  NOT_A_PAGE: ['Not a page', 'This link opens a file, not a page, so it is not a page the preview can show.'],
  LEAVES_SITE: ['This link leaves the site', 'It goes to another address, so the preview stays here.'],
  INVALID_PATH: ['This link can’t be previewed', 'It does not point to a page of this site.'],
  RATE_LIMITED: ['Too many previews', 'Too many previews in one minute. Wait a moment, then try again.'],
  NOT_SIGNED_IN: ['Signed out', 'Sign in to Tracy again to see the preview.'],
  NO_ACCESS: ['No access', 'You no longer have access to this site.']
})
const MISS_FALLBACK = /** @type {[string, string]} */ ([
  'The preview can’t show this page',
  'The page could not be read. Try again in a moment.'
])

/**
 * A refusal said inside the preview frame (an ask with `path=`, which only a link of a served page makes):
 * the small page ({@link previewMissPage}) with the refusal's own status, never cached, under the same
 * policy as a preview. `why` names the words; `home` is the door's home page, when it can be named.
 * @param {any} c
 * @param {number} status
 * @param {{ why: string, home?: string | null, retryAfterS?: number }} p
 */
export function framedRefusal(c, status, { why, home = null, retryAfterS }) {
  const [title, text] = MISS_WORDS[why] ?? MISS_FALLBACK
  const headers = /** @type {Record<string, string>} */ ({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
    'content-security-policy': PREVIEW_CSP,
    'x-content-type-options': 'nosniff'
  })
  if (retryAfterS !== undefined) headers['retry-after'] = String(retryAfterS)
  return c.body(previewMissPage({ title, text, home }), status, headers)
}
