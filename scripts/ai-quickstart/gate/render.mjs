// The gate's renderer (ticket #585): every page of a built site in a headless browser, on each theme side and each
// width, read by `observe-in-page.mjs`. One fresh browser context per theme side (a side picked by one load never leaks
// into the other), at most `contexts` at once (2 by default: the machine runs tests and the site beside it). The
// browser is injected (`chromium` of Playwright), so the module runs with no browser in a unit test of its shape.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { themed } from './adapters/joomla-t4.mjs'
import { observeInPage } from './observe-in-page.mjs'

export const WIDTHS = Object.freeze([390, 768, 1440])
export const THEMES = Object.freeze(['light', 'dark'])
const HEIGHT = { 390: 844, 768: 1024, 1440: 900 }

/** Scroll the whole page once, so lazy pictures and scroll effects load before the page is read. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
}

/**
 * @param {{pages: Array<{pageType: string, path: string, url: string}>, chromium: object, out: string,
 *   themes?: string[], widths?: number[], shots?: {theme: string, widths: number[]}, timeout?: number,
 *   log?: (line: string) => void}} input `shots`: the screenshots kept, one per page type (product decision 7: dark,
 *   390 and 1440)
 * @returns {Promise<Array<{pageType: string, path: string, theme: string, width: number, status: number | null,
 *   html: string | null, innerText: string, observations: object[], shot?: string, error?: string}>>}
 */
export async function renderSite({
  pages,
  chromium,
  out,
  themes = THEMES,
  widths = WIDTHS,
  shots = { theme: 'dark', widths: [390, 1440] },
  timeout = 45000,
  log = () => {}
}) {
  mkdirSync(path.join(out, 'shots'), { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const shotTaken = new Set()
  const renders = []
  try {
    await Promise.all(
      themes.map(async (theme) => {
        const context = await browser.newContext({
          viewport: { width: widths[0], height: HEIGHT[widths[0]] ?? 900 }
        })
        // Only the site answers: a request to any other host is stopped and kept as an observation of the page (a
        // marker address loaded as a frame or a picture, a font or script of another host), so no page waits on the
        // network outside the machine.
        const origin = new URL(pages[0]?.url ?? 'http://localhost/').origin
        const outside = []
        await context.route('**/*', (route) => {
          const url = route.request().url()
          if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:'))
            return route.continue()
          outside.push({ url, type: route.request().resourceType() })
          return route.abort('blockedbyclient')
        })
        try {
          const page = await context.newPage()
          for (const width of widths) {
            await page.setViewportSize({ width, height: HEIGHT[width] ?? 900 })
            for (const p of pages) {
              outside.length = 0
              const r = await renderOne({ page, p, theme, width, out, shots, shotTaken, timeout, log })
              for (const o of outside)
                r.observations.push({
                  kind: 'request',
                  value: o.url,
                  place: { element: `request[${o.type}]` },
                  visible: true
                })
              renders.push(r)
            }
          }
        } finally {
          await context.close()
        }
      })
    )
  } finally {
    await browser.close()
  }
  return renders
}

const slug = (text) =>
  String(text)
    .replace(/[^a-z0-9-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)

async function renderOne({ page, p, theme, width, out, shots, shotTaken, timeout, log }) {
  const at = { pageType: p.pageType, path: p.path, theme, width, expected: p.status ?? 200 }
  try {
    const response = await page.goto(themed(p.url, theme), { waitUntil: 'domcontentloaded', timeout })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await scrollThrough(page)
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    const html = response ? await response.text().catch(() => null) : null
    const { observations, innerText } = await page.evaluate(observeInPage)
    const r = { ...at, status: response?.status() ?? null, html, innerText, observations }
    const key = `${p.pageType}|${width}`
    // One shot per page type (product decision 7), and every page at the widest width on that side, which the record
    // page crops each finding from (`box` of an observation).
    const perType = shots.widths.includes(width) && !shotTaken.has(key)
    const perPage = width === Math.max(...shots.widths)
    if (theme === shots.theme && (perType || perPage)) {
      shotTaken.add(key)
      const file = `shots/${slug(p.pageType)}-${slug(p.path)}-${theme}-${width}.png`
      await page.screenshot({ path: path.join(out, file), fullPage: true })
      r.shot = file
    }
    log(`${r.status} ${theme} ${width} ${p.path} (${observations.length} observations)`)
    return r
  } catch (error) {
    log(`error ${theme} ${width} ${p.path}: ${error.message}`)
    return { ...at, status: null, html: null, innerText: '', observations: [], error: String(error.message) }
  }
}
