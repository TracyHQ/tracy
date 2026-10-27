/**
 * One page wearing one design system, built in this process without writing anything (the two preview
 * doors: the Add site form's, `design-system-preview.js`, and the running site's,
 * `design-system-site-reads.js`): the bytes an apply would make the site serve (`slotBytesOf`,
 * `slotOf`), one page (the home page, or the same-site `path` a link of the preview asked for) read on the site's own
 * web container with redirects kept to the same site (`readDemoPage`), and the page rebuilt with those
 * bytes laid in and its links made browsable (`previewDocOf`, `wornPageOf`; WordPress through
 * `design-system-preview-wordpress.js`; links through `design-system-preview-links.js`).
 */

import {
  themeCssOf,
  themeFoldersOf,
  wearGlobalStyles,
  wordpressFontFacesOf,
  wordpressGlobalCssOf
} from './design-system-preview-wordpress.js'
import { decodeCloudflareEmails } from './cloudflare-email.js'
import { decodeJoomlaEmails } from './joomla-email.js'
import { navigableDocOf, previewPathOf } from './design-system-preview-links.js'
import { stylesheetsToAssets } from './design-system-preview-assets.js'
import { EMBEDS_STYLE, withScriptlessEmbeds } from './design-system-preview-embeds.js'

/** How long the demo's page may take to answer, per hop. */
export const DEMO_WAIT_MS = 10_000
/** The largest page the door reads. */
export const PREVIEW_HTML_MAX = 1_500_000
/** Redirects followed at most (Joomla's home sends `/` to `/<language>/`). */
const HOPS_MAX = 3

/** The only stylesheet an EmDash slot may load: Google Fonts (the layout's own rule, `lib/ds-slot.ts`). */
const FONT_HREF = /^https:\/\/fonts\.googleapis\.com\/css2\?[A-Za-z0-9=&:;+@.%_-]+$/

const attr = (/** @type {string} */ v) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The bytes the template's head carries for one worn system, as an apply's write makes the site serve
 * them: Joomla's module HTML as the emitter makes it; EmDash's stylesheet the way its layout inlines the
 * slot file (`Base.astro`: the Google Fonts link named in the file, then the style element); WordPress's
 * font faces as it prints them (the rest of its variation goes into the global styles block,
 * {@link slotOf}).
 * @param {{ platform: string, html?: string, css?: string, id?: string, variation?: any }} out `emitFor`'s answer
 * @returns {string | null} null when the bytes cannot be laid in a page safely
 */
export function slotBytesOf(out) {
  if (out.platform === 'joomla') return typeof out.html === 'string' ? out.html : null
  if (out.platform === 'wordpress')
    return out.variation && wordpressGlobalCssOf(out.variation) !== null
      ? wordpressFontFacesOf(out.variation)
      : null
  if (out.platform !== 'emdash' || typeof out.css !== 'string') return null
  if (/<\/style/i.test(out.css)) return null
  const fonts = /^\/\* fonts: (\S+) \*\//m.exec(out.css)?.[1] ?? null
  const link = fonts && FONT_HREF.test(fonts) ? `<link rel="stylesheet" href="${attr(fonts)}">` : ''
  return `${link}<style id="tracy-ds-slot" data-ds="${attr(String(out.id ?? ''))}">${out.css}</style>`
}

/**
 * Everything one worn system changes in a served page: `bytes`, laid last in the head
 * ({@link slotBytesOf}), and on WordPress `globalCss`, the variation's part of the global styles block.
 * @param {any} out `emitFor`'s answer
 * @returns {{ bytes: string, globalCss: string | null } | null} null when it cannot be laid in a page safely
 */
export function slotOf(out) {
  const bytes = out?.ok === false ? null : slotBytesOf(out)
  if (bytes === null) return null
  return { bytes, globalCss: out.platform === 'wordpress' ? wordpressGlobalCssOf(out.variation) : null }
}

/**
 * The demo's page wearing the system: its own addresses on the container turned into its public
 * address, any slot it already wears taken off, a `<base href>` at the page's public address first in
 * the head, and the slot's bytes last in the head (after every stylesheet of the template, as the
 * apply's module and layout put them). EmDash's `<html>` also says it wears a system (`data-ds-worn`),
 * as its layout does. PURE.
 * @param {string} html the page as the demo served it
 * @param {{ platform: string, bytes: string, base: string, inner: string }} p `base`: the page's public
 *   address; `inner`: the origin it was read at (its container), rewritten to `base`'s origin
 * @returns {string | null} null when the page has no head to lay the bytes in
 */
/**
 * The preview runs no script, so content a template reveals on scroll with one (AOS's data-aos, JA's
 * .ja-animate, animate.css's .wow) stayed invisible: JA Phio, Seven and Resume showed empty bands under
 * every system (fleet01 audit, 14/10/2026). Preview only: the site itself runs its scripts.
 */
export const REVEALED =
  '<style id="tracy-preview-revealed">[data-aos],.ja-animate,.wow,.animate__animated{opacity:1!important;transform:none!important;visibility:visible!important}</style>'

/**
 * The notices a page prints for a visitor without JavaScript (14/10/2026): the preview frame runs no
 * script, so the browser renders every `<noscript>` of the page, and AcyMailing's "Please enable the
 * javascript to submit this form" sat between the e-mail field and the Subscribe button of JA Kinetic's
 * footer (WordPress and Joomla), widening the form until the newsletter row wrapped. A visitor with
 * JavaScript, which is every visitor of the real site, never sees a `<noscript>`.
 *
 * Which ones go, precisely: a `<noscript>` whose content is words about scripts (it names JavaScript or
 * a script) and holds no element outside plain text formatting (`NOTICE_TAGS`). A `<noscript>` with a
 * picture, a frame, a stylesheet or a form control in it is the template's fallback CONTENT (a lazy
 * image's `<img>`, a slider's first slide, a tracking pixel) and stays: the preview needs exactly that.
 * Preview only: the site itself is not touched.
 */
const NOTICE_TAGS = /^(a|abbr|b|br|code|div|em|h[1-6]|i|p|small|span|strong|u)$/i
const NOSCRIPT = /<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi

/** Is the content of one `<noscript>` a notice to a visitor without JavaScript? PURE. */
export function isNoscriptNotice(/** @type {string} */ inner) {
  for (const m of inner.matchAll(/<\s*([a-z][\w-]*)/gi)) if (!NOTICE_TAGS.test(m[1])) return false
  const words = inner
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /java\s*script|\bscripts?\b|\bJS\b/i.test(words)
}

/** The page without its notices to visitors without JavaScript ({@link isNoscriptNotice}). PURE. */
export const withoutNoscriptNotices = (/** @type {string} */ html) =>
  html.replace(NOSCRIPT, (all, inner) => (isNoscriptNotice(inner) ? '' : all))

export function previewDocOf(html, { platform, bytes, base, inner }) {
  const pub = new URL(base)
  const innerUrl = new URL(inner)
  // Only the page itself: whatever the demo printed after its first </html> is a second document, such as
  // the error page Joomla prints when something fails after the page was sent (JA Impact, JA Essence,
  // JA Kinetic demos, 14/10/2026). Its own stylesheet would reach into the page shown.
  const end = /<\/html\s*>/i.exec(html)
  let doc = withoutNoscriptNotices(end ? html.slice(0, end.index + end[0].length) : html)
    // The container's own name in absolute links: the browser cannot reach it, the public address is it.
    .replace(new RegExp(`(https?:)?//${escapeRe(innerUrl.host)}(?=[/"'?#\\s]|$)`, 'g'), pub.origin)
    // A slot the demo already wears (an EmDash style element, a Joomla module's) goes: one system at a time.
    .replace(/<style\b[^>]*\bid=["']tracy-ds-slot["'][^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
  // Script-only third-party content (a provider's frame, a map a script draws, a carousel that never
  // starts) becomes a stand-in: the frame runs no script (`design-system-preview-embeds.js`).
  doc = withScriptlessEmbeds(doc, { base: pub.href })
  const head = /<head\b[^>]*>/i.exec(doc)
  const close = doc.search(/<\/head\s*>/i)
  if (!head || close < head.index) return null
  const at = head.index + head[0].length
  doc =
    doc.slice(0, at) +
    `<base href="${attr(pub.href)}">` +
    doc.slice(at, close) +
    REVEALED +
    EMBEDS_STYLE +
    bytes +
    doc.slice(close)
  if (platform === 'emdash') doc = doc.replace(/<html\b(?![^>]*\bdata-ds-worn)/i, '<html data-ds-worn=""')
  return doc
}

/**
 * The headers that tell a site, read on its container, the address it is served at: the same two the
 * site proxy sends (`bar/site-proxy.js` `originRequest`). Node's fetch recomputes `Host` from the
 * URL, so `Host` itself cannot be set; the site's Apache puts `X-Forwarded-Host` back as `Host`.
 * Without them a CMS that insists on its own address (WordPress with Polylang, measured 12/10 on
 * test-tb-wp: `301 X-Redirect-By: WordPress` to its public root) redirects every hop.
 * @param {URL} pub the site's public address
 * @param {string} accept
 */
const toldAddress = (pub, accept) => ({
  accept,
  'x-forwarded-host': pub.host,
  'x-forwarded-proto': pub.protocol.replace(':', '')
})

/**
 * Why a page could not be shown: the site said there is no such page (`PAGE_NOT_FOUND`, 404 or 410), it
 * answered with something that is not a page (`NOT_A_PAGE`), it sent the read to another address
 * (`LEAVES_SITE`), or anything else (`UNREADABLE`: no answer, a refusal, a circle, too large, too slow).
 * A WordPress page wearing a system, asked bare (`NO_BARE`): the system is merged into its global styles and
 * cannot be taken off faithfully.
 * @typedef {'PAGE_NOT_FOUND' | 'NOT_A_PAGE' | 'LEAVES_SITE' | 'UNREADABLE' | 'NO_SLOT' | 'NO_BARE'} PreviewMiss
 */

/**
 * One page of the demo (`path`, the home page `/` by default), read on its container and told its public
 * address ({@link toldAddress}): `GET` the path on the container, following a redirect only when it points
 * at the same demo (its public address or the container) and to a path a door would read itself
 * (`previewPathOf`), reading the target back on the container. A redirect to a page already read is a
 * circle and ends the read.
 * @param {{ inner: URL, publicOrigin: string, fetchImpl: typeof fetch, waitMs?: number, path?: string }} p
 * @returns {Promise<{ html: string, path: string } | { miss: PreviewMiss }>}
 */
export async function readDemoPage({ inner, publicOrigin, fetchImpl, waitMs = DEMO_WAIT_MS, path = '/' }) {
  const headers = toldAddress(new URL(publicOrigin), 'text/html')
  const seen = new Set()
  /** @type {{ miss: PreviewMiss }} */
  const unreadable = { miss: 'UNREADABLE' }
  let at = previewPathOf(path)
  if (at === null) return unreadable
  for (let hop = 0; hop <= HOPS_MAX; hop++) {
    if (seen.has(at)) return unreadable
    seen.add(at)
    const url = new URL(at, inner)
    // Belt and braces: whatever the path, the read stays on the container the server resolved.
    if (url.origin !== inner.origin) return unreadable
    let res
    try {
      res = await fetchImpl(url, { redirect: 'manual', headers, signal: AbortSignal.timeout(waitMs) })
    } catch {
      return unreadable
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location')
      if (!to) return unreadable
      let next
      try {
        next = new URL(to, url)
      } catch {
        return unreadable
      }
      // Only the same demo: its public host (any scheme, port or `www.`) or its container. Anything else
      // is not read; the target's path is always read back on the container.
      const bare = (/** @type {string} */ h) => h.toLowerCase().replace(/^www\./, '')
      const own =
        next.origin === inner.origin ||
        ((next.protocol === 'http:' || next.protocol === 'https:') &&
          bare(next.hostname) === bare(new URL(publicOrigin).hostname))
      if (!own) return { miss: 'LEAVES_SITE' }
      at = previewPathOf(`${next.pathname}${next.search}`)
      if (at === null) return { miss: 'LEAVES_SITE' }
      continue
    }
    if (res.status === 404 || res.status === 410) return { miss: 'PAGE_NOT_FOUND' }
    if (!res.ok) return unreadable
    if (!/text\/html/i.test(res.headers.get('content-type') ?? 'text/html')) return { miss: 'NOT_A_PAGE' }
    const html = await res.text().catch(() => null)
    if (typeof html !== 'string' || html.length > PREVIEW_HTML_MAX) return unreadable
    return { html, path: at }
  }
  return unreadable
}

/**
 * The root `styles.css` of a WordPress theme, read from its `theme.json` on the same container as the
 * page (a file WordPress serves as is). null when it cannot be read.
 * @param {{ inner: URL, pub: URL, folder: string, fetchImpl: typeof fetch, waitMs: number }} p
 * @returns {Promise<string | null>}
 */
export async function readThemeCss({ inner, pub, folder, fetchImpl, waitMs }) {
  try {
    const res = await fetchImpl(new URL(`/wp-content/themes/${folder}/theme.json`, inner), {
      redirect: 'manual',
      headers: toldAddress(pub, 'application/json'),
      signal: AbortSignal.timeout(waitMs)
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > PREVIEW_HTML_MAX ? null : themeCssOf(text)
  } catch {
    return null
  }
}

/**
 * The theme folders a WordPress template key may run as (`wordpress/tracy-base` is the `tracy` theme
 * or `tracy-base`, as `lib/ds-slot.js` `templateKeyOf` names them).
 * @param {string | null | undefined} templateKey
 * @returns {string[]}
 */
export function themeFoldersFor(templateKey) {
  const m = /^wordpress\/([a-z0-9][a-z0-9._-]{0,99})$/.exec(String(templateKey ?? ''))
  if (!m) return []
  return m[1] === 'tracy-base' ? ['tracy', 'tracy-base'] : [m[1]]
}

/**
 * One page wearing one system, read and built: the part the Add site door (a quickstart's live demo)
 * and the running site's door (`design-system-site-reads.js`, `GET /api/sites/:key/design-system/preview`) share.
 * The page at `path` (the home page by default) is read on `inner` (its web container; a redirect only to the same site), any slot it
 * wears is taken off, a `<base href>` at its public address `pub` goes first in the head and the
 * slot's `bytes` last. WordPress (`globalCss`): the page must load the template's theme (`themes`, its
 * folders); that theme's `theme.json` is read on the same container and the global styles block is
 * rewritten as the merge would print it (`wearGlobalStyles`). With `doorOf` (the door's address
 * for a path of the same site) every link of the page is made browsable (`navigableDocOf`).
 * `bare`: the Template default card's page (14/10/2026): the worn slot taken off, nothing laid in.
 * @param {{ platform: string, bytes: string, globalCss?: string | null, bare?: boolean, themes?: string[], inner: URL,
 *   pub: URL, fetchImpl: typeof fetch, waitMs?: number, path?: string,
 *   doorOf?: ((path: string) => string) | null, assetOf?: ((path: string) => string) | null }} p
 * @returns {Promise<{ html: string } | { miss: PreviewMiss }>}
 */
export async function wornPageOf({
  platform,
  bytes,
  globalCss = null,
  bare = false,
  themes = [],
  inner,
  pub,
  fetchImpl,
  waitMs = DEMO_WAIT_MS,
  path = '/',
  doorOf = null,
  assetOf = null
}) {
  /** @type {{ miss: PreviewMiss }} */
  const unreadable = { miss: 'UNREADABLE' }
  const page = await readDemoPage({ inner, publicOrigin: pub.origin, fetchImpl, waitMs, path })
  if ('miss' in page) return page
  // Addresses Cloudflare obfuscated on the way out: the frame runs no script, so they are put back here.
  page.html = decodeCloudflareEmails(page.html)
  // And those Joomla cloaked, which its web component would put back (`joomla-email.js`).
  page.html = decodeJoomlaEmails(page.html)
  if (platform === 'wordpress') {
    // A page served by a theme that is not one of this template's, or without the global styles block the
    // variation lands in, cannot wear a system: NO_SLOT (a 409), never a failure (measured 13/10/2026 on
    // a site whose theme merely shares the name "tracy": the door answered 502 and the popup said nothing).
    const folder = themeFoldersOf(page.html).find((f) => themes.includes(f))
    if (!folder) return { miss: 'NO_SLOT' }
    if (bare) {
      // Wearing nothing, the page is the template's own look; wearing a system, it cannot be taken off here.
      if (page.html.includes('/* tracy-ds-slot:')) return { miss: 'NO_BARE' }
      return finish(page, { platform, bytes, inner, pub, doorOf, assetOf })
    }
    if (typeof globalCss !== 'string') return unreadable
    const themeCss = await readThemeCss({ inner, pub, folder, fetchImpl, waitMs })
    if (themeCss === null) return unreadable
    const worn = wearGlobalStyles(page.html, { globalCss, themeCss })
    if (worn === null) return { miss: 'NO_SLOT' }
    page.html = worn
  }
  return finish(page, { platform, bytes, inner, pub, doorOf, assetOf })
}

/**
 * The read page made a preview: the bytes laid in (`previewDocOf`), its stylesheets and links pointed at the doors.
 * @param {{ html: string, path: string }} page
 * @param {{ platform: string, bytes: string, inner: URL, pub: URL, doorOf: ((path: string) => string) | null,
 *   assetOf: ((path: string) => string) | null }} p
 * @returns {{ html: string } | { miss: PreviewMiss }}
 */
function finish(page, { platform, bytes, inner, pub, doorOf, assetOf }) {
  const base = new URL(page.path, pub)
  const html = previewDocOf(page.html, { platform, bytes, base: base.href, inner: inner.href })
  if (html === null) return { miss: 'UNREADABLE' }
  // With `assetOf` (the Add site door) the demo's own stylesheets load through Tracy's origin, so the
  // fonts they name are same-origin with the frame (`design-system-preview-assets.js`)
  const styled = assetOf ? stylesheetsToAssets(html, { base: base.href, assetOf }) : html
  return { html: doorOf ? navigableDocOf(styled, { page: base, doorOf }) : styled }
}
