/**
 * The browser behind `POST /_host/picture-overlap` (spec TracyHQ/tracy#189): after a brief build, the build's pictures
 * that cover a heading, a paragraph, a button or the logo at any visitor width (`picture-overlap.js`). One Chromium,
 * launched on first use, one context a run; the site's own names are served from its reachable address and other
 * origins are bounded, as for every other read of a site (`browser.js` `boundOtherOrigins`).
 */
import { boundOtherOrigins, LAUNCH_ARGS } from './browser.js'
import { overlapFindings, readPictureOverlaps } from './picture-overlap.js'

/** The folder of the build's pictures when the caller names none (`images/tracy-content/` on a Joomla site). */
export const OVERLAP_FOLDER = 'tracy-content/'
const FOLDER = /^[\w.-]+(?:\/[\w.-]+)*\/$/

/**
 * The folder a caller may name: a relative path of plain segments ending with a slash, never a URL.
 * @param {unknown} folder
 * @returns {string | null} null when refused
 */
export function overlapFolderOf(folder) {
  if (folder === undefined || folder === null) return OVERLAP_FOLDER
  if (typeof folder !== 'string' || folder.length > 120 || !FOLDER.test(folder)) return null
  return folder.split('/').some((part) => part === '.' || part === '..') ? null : folder
}

/** The site token a caller may hand on: one plain token, never a header line. @param {unknown} bearer */
export function overlapBearerOf(bearer) {
  return typeof bearer === 'string' && /^[\w.~+/=-]{16,512}$/.test(bearer) ? bearer : null
}

/**
 * Send `Authorization: Bearer` on every request to the page's own origin, and nothing to any other origin.
 * @param {any} context @param {string} pageUrl @param {string | null} bearer
 */
export async function withSiteBearer(context, pageUrl, bearer) {
  if (!bearer || typeof context.route !== 'function') return
  const own = new URL(pageUrl).origin
  await context.route('**/*', async (route) => {
    let origin = null
    try {
      origin = new URL(route.request().url()).origin
    } catch {
      // Not a URL a site serves: handed on unchanged.
    }
    if (origin !== own) return route.fallback()
    return route.fallback({ headers: { ...route.request().headers(), authorization: `Bearer ${bearer}` } })
  })
}

/**
 * @param {{log?: {warn?: Function}, playwright?: any}} [options]
 * @returns {Promise<null | ((input: {asked: {pages: string[], folder: string}, base: string, serveFrom?: string | null,
 *   serveFromIsProxy?: boolean, proxySiteLabel?: string | null, bearer?: string | null, signal: AbortSignal}) => Promise<{findings: any[],
 *   pages: Array<{path: string, ok: boolean, why?: string}>}>)>}
 */
export async function makePictureOverlap({ log = console, playwright = null } = {}) {
  try {
    playwright ??= await import('playwright')
  } catch {
    log.warn?.('[host] playwright is not installed: /_host/picture-overlap will answer 503 NO_BROWSER')
    return null
  }
  /** @type {any} */
  let browser = null
  const launched = async () => {
    if (browser && browser.isConnected()) return browser
    browser = await playwright.chromium.launch({ headless: true, args: LAUNCH_ARGS })
    return browser
  }
  const check = async ({
    asked,
    base,
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    bearer = null,
    signal
  }) => {
    signal.throwIfAborted()
    const context = await (await launched()).newContext({ viewport: { width: 1440, height: 900 } })
    const close = () => context.close().catch(() => {})
    const abort = () => void close()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await boundOtherOrigins(context, base, { serveFrom, serveFromIsProxy, proxySiteLabel })
      // A site on its rebuilding page answers the build's own reads with the real site (#189): the token goes to the
      // site's own origin only. Registered last, so it runs first and hands on to the bound above.
      await withSiteBearer(context, base, bearer)
      const reads = []
      const pages = []
      for (const path of asked.pages) {
        signal.throwIfAborted()
        const url = new URL(path.replace(/^\/+/, ''), base).href
        const page = await context.newPage()
        try {
          const found = await readPictureOverlaps(page, url, { folder: asked.folder })
          reads.push(...found)
          pages.push({ path, ok: true })
        } catch (error) {
          pages.push({ path, ok: false, why: String(error?.message ?? error).slice(0, 200) })
        } finally {
          await page.close().catch(() => {})
        }
      }
      return { findings: overlapFindings(reads), pages }
    } finally {
      signal.removeEventListener('abort', abort)
      await close()
    }
  }
  /** Close the browser (a test's end; the host keeps it for its whole life). */
  check.close = async () => {
    await browser?.close().catch(() => {})
    browser = null
  }
  return check
}
