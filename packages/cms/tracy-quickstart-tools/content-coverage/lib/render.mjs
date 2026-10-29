// Open one page at one viewport, read-only, wake lazy content, extract items, take a full-page shot.
import { extractPage, measurePictures } from './browser-extract.js'

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
}
const MAX_SHOT_HEIGHT = 16000 // Chromium cannot paint taller surfaces reliably.

/** One browser context per viewport; every non-GET request is aborted so the audit can never write. */
export async function openContext(browser, name) {
  const vp = VIEWPORTS[name]
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: !!vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor,
    ignoreHTTPSErrors: true,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 TracyCoverageAudit'
      : undefined
  })
  await ctx.route('**/*', (route) => {
    const m = route.request().method()
    return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? route.continue() : route.abort('blockedbyclient')
  })
  return ctx
}

/**
 * Scroll down to wake lazy content, then back to the top. Smooth scrolling is switched off first: a page that sets
 * `scroll-behavior: smooth` would still be animating back to the top when boxes are read, and a sticky or fixed
 * element would be measured wherever the animation had got to instead of at its resting place.
 */
export async function wakeLazyContent(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (const el of [document.documentElement, document.body])
      el.style.setProperty('scroll-behavior', 'auto', 'important')
    let last = -1
    for (let i = 0; i < 80; i++) {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.8), left: 0, behavior: 'instant' })
      await wait(120)
      const y = window.scrollY
      if (y === last) break
      last = y
    }
    await wait(600)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    await wait(400)
    // Settled: nothing left to animate before the boxes are read.
    for (let i = 0; i < 20 && window.scrollY !== 0; i++) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      await wait(100)
    }
  })
}

/**
 * @returns {Promise<{status:number|null, finalUrl:string, data?:object, html?:string|null, shot?:Buffer, shotHeight?:number, error?:string}>}
 */
export async function renderPage(ctx, url, { screenshot = true } = {}) {
  const page = await ctx.newPage()
  try {
    let resp
    try {
      resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    } catch (e) {
      return { status: null, finalUrl: url, error: String(e.message || e).split('\n')[0] }
    }
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await wakeLazyContent(page)
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    const data = await page.evaluate(extractPage)
    const rasters = [
      ...new Set(
        data.items
          .filter((i) => i.kind === 'image' && /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(String(i.value)))
          .map((i) => i.value)
      )
    ]
    data.pictures = await page.evaluate(measurePictures, rasters).catch(() => ({}))
    // The HTML as the server sent it, for page hygiene (PHP error text hides in it); the DOM as a fallback.
    const html = (await resp?.text().catch(() => null)) ?? (await page.content().catch(() => null))
    let shot
    let shotHeight
    if (screenshot) {
      const vp = page.viewportSize()
      shotHeight = Math.min(data.docHeight, MAX_SHOT_HEIGHT)
      shot = await page
        .screenshot({
          type: 'jpeg',
          quality: 70,
          fullPage: true,
          clip:
            data.docHeight > MAX_SHOT_HEIGHT
              ? { x: 0, y: 0, width: vp.width, height: MAX_SHOT_HEIGHT }
              : undefined,
          animations: 'disabled',
          timeout: 60000
        })
        .catch(() => undefined)
    }
    return {
      status: resp ? resp.status() : null,
      finalUrl: page.url(),
      data,
      html,
      shot,
      shotHeight,
      truncated: data.docHeight > MAX_SHOT_HEIGHT
    }
  } finally {
    await page.close().catch(() => {})
  }
}
