/**
 * The real-page views (brand bench real-page check, #322): what the brand check needs to see on ANY site, taken in
 * one request: the header, the footer, the opened mobile menu and the browser tab icons, in light and dark. It is a
 * separate capture mode (`real-page/1`) so the template-card capture (`capture.js`) behaves exactly as before.
 *
 * What comes back is measured facts plus pictures, never a verdict: for each view the logo image the page shows there
 * (address, natural size, where it sits in the picture), the colours the page paints, and for the tab every icon the
 * page links (its rel, sizes, address, status and real pixel size). tracy-web judges them.
 *
 * 🔒 THE TARGET IS COMPOSED BY THE CALLER OF THIS MODULE from a label, a platform, a port and a hostname, as in
 * `capture.js`; a path here is only a path on that site. Light and dark are asked with `?theme=` (the preview's own
 * switch) AND the browser's colour scheme, so a template that follows either shows the side asked.
 */
import { CAPTURE_VIEWPORTS } from './capture.js'
import { COLOURS, FETCH_ICON, ICON_LINKS, icoSize, PROBE, pngSize } from './real-page-probes.js'

export { icoSize, pngSize }

const SCHEMES = Object.freeze(['light', 'dark'])
const DESKTOP = CAPTURE_VIEWPORTS[0]
const PHONE = CAPTURE_VIEWPORTS[1]
/** Defaults for a T4 template (Bootstrap): the first visible match wins. A caller may name its own. */
export const DEFAULT_SELECTORS = Object.freeze({
  header: 'header, .t4-header, #t4-header',
  footer: 'footer, .t4-footer, #t4-footer',
  menu: '.offcanvas.show, .t4-offcanvas.show, .offcanvas-collapse.open, .t4-off-canvas-body, [class*="offcanvas"][class*="show"]',
  toggler:
    '[data-bs-toggle="offcanvas"], .navbar-toggler, .t4-offcanvas-toggle, .js-offcanvas-toggle, button[aria-label*="menu" i]'
})
const SELECTOR = /^[\w\s.#,[\]="*~^$|:>+()'-]{1,300}$/
const MAX_ICON_BYTES = 200_000
const SETTLE_MS = 600

/** The selectors a request names, held to a plain CSS shape, over the defaults. */
export function selectorsOf(asked) {
  const out = { ...DEFAULT_SELECTORS }
  if (asked && typeof asked === 'object')
    for (const key of Object.keys(out))
      if (typeof asked[key] === 'string' && SELECTOR.test(asked[key])) out[key] = asked[key]
  return out
}

/** The path of the page to look at: a path on the site, home by default. */
export const pathOf = (value) => (typeof value === 'string' && value.startsWith('/') ? value : '/')

/**
 * @param {{ launched: () => Promise<import('playwright').Browser>, prepare: Function }} deps `prepare` bounds other
 *   origins and serves a site's own names (`boundOtherOrigins` in browser.js)
 * @returns {(args: { url: string, selectors?: object, serveFrom?: string | null, serveFromIsProxy?: boolean,
 *   proxySiteLabel?: string | null, siteHosts?: string[], signal?: AbortSignal | null }) => Promise<object>}
 */
export function createViewsCapturer({ launched, prepare }) {
  return async function capture({ url, selectors = DEFAULT_SELECTORS, signal = null, ...self }) {
    const b = await launched()
    const views = []
    let icons = []
    const colours = {}
    for (const scheme of SCHEMES) {
      for (const view of ['header', 'footer', 'menu']) {
        if (signal?.aborted) throw new Error('capture cancelled')
        const phone = view === 'menu'
        const size = phone ? PHONE : DESKTOP
        const context = await b.newContext({
          viewport: { width: size.width, height: size.height },
          colorScheme: scheme,
          isMobile: phone,
          reducedMotion: 'reduce'
        })
        try {
          await prepare(context, url, self)
          const page = await context.newPage()
          const themed = new URL(url)
          themed.searchParams.set('theme', scheme)
          await page.goto(themed.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {})
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
          await page.evaluate(() => document.fonts?.ready).catch(() => {})
          await page.waitForTimeout(SETTLE_MS)
          views.push({ id: view, scheme, ...(await look(page, view, selectors, size)) })
          if (view === 'header') {
            colours[scheme] = await page.evaluate(COLOURS).catch(() => [])
            if (scheme === 'light') icons = await readIcons(page)
          }
        } catch (error) {
          views.push({ id: view, scheme, ok: false, error: String(error?.message ?? error) })
        } finally {
          await context.close().catch(() => {})
        }
      }
    }
    const tab = icons.find((i) => i.png && i.width === 32 && i.height === 32) ?? icons.find((i) => i.png)
    for (const scheme of SCHEMES)
      views.push(
        tab?.png
          ? { id: 'tab', scheme, ok: true, png: tab.png, facts: { href: tab.href } }
          : { id: 'tab', scheme, ok: false, error: 'the page links no picture icon' }
      )
    return { views, icons: icons.map(({ png: _png, ...rest }) => rest), colours }
  }
}

async function look(page, view, selectors, size) {
  if (view === 'menu') {
    const toggler = page.locator(selectors.toggler).filter({ visible: true }).first()
    if ((await toggler.count()) === 0) return { ok: false, error: 'no menu button on the phone page' }
    await toggler.click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(SETTLE_MS + 400)
    const facts = await page.evaluate(PROBE, { selector: selectors.menu, originSelector: 'page' })
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: size.width, height: size.height }
    })
    return {
      ok: true,
      png: png.toString('base64'),
      facts: facts ?? { region: null, logo: null },
      opened: facts !== null
    }
  }
  if (view === 'footer') {
    const el = page.locator(selectors.footer).filter({ visible: true }).first()
    if ((await el.count()) === 0) return { ok: false, error: 'the page has no footer' }
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(300)
    const facts = await page.evaluate(PROBE, { selector: selectors.footer, originSelector: 'region' })
    const png = await el.screenshot({ type: 'png' })
    return { ok: true, png: png.toString('base64'), facts }
  }
  const facts = await page.evaluate(PROBE, { selector: selectors.header, originSelector: 'page' })
  const height = Math.max(120, Math.min(420, (facts?.region?.height ?? 160) + 24))
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size.width, height } })
  return { ok: true, png: png.toString('base64'), facts }
}

async function readIcons(page) {
  const links = await page.evaluate(ICON_LINKS).catch(() => [])
  const out = []
  for (const link of links) {
    const got = await page.evaluate(FETCH_ICON, { href: link.href, max: MAX_ICON_BYTES }).catch(() => null)
    const bytes = got?.base64 ? Buffer.from(got.base64, 'base64') : null
    const png = bytes ? pngSize(bytes) : null
    const ico = bytes && !png ? icoSize(bytes) : null
    const dims = png ?? ico
    out.push({
      ...link,
      status: got?.status ?? 0,
      contentType: got?.contentType ?? '',
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      kind: png ? 'png' : ico ? 'ico' : 'other',
      ...(png && bytes ? { png: bytes.toString('base64') } : {})
    })
  }
  return out
}
