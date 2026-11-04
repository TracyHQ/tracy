// Captures of a written site (#357): each kept page at 1440 and 390 wide, and each picture frame cropped from the page it
// sits on. It only reads the site. The browser comes in as an argument (`chromium` of Playwright) so a test can pass a fake.
import { createRequire } from 'node:module'
import { assignBoxes, locateInPage } from './locate.js'

export const WIDTHS = [1440, 390]
const MAX_PAGE_HEIGHT = 12_000
const MAX_CROP_HEIGHT = 1_400
const PAD = 8

/** Playwright's chromium, from `playwrightDir` (a folder holding the package) when given, else from this install. */
export async function loadChromium(playwrightDir) {
  if (playwrightDir) return createRequire(`${playwrightDir.replace(/\/$/, '')}/`)('playwright').chromium
  return (await import('playwright')).chromium
}

const joinUrl = (base, route) => new URL(route.replace(/^\//, ''), `${base.replace(/\/$/, '')}/`).href

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(500)
}

function clipOf(box, pageWidth) {
  const x = Math.max(0, Math.floor(box.x - PAD))
  const y = Math.max(0, Math.floor(box.y - PAD))
  return {
    x,
    y,
    width: Math.max(1, Math.min(pageWidth - x, Math.ceil(box.width + 2 * PAD))),
    height: Math.max(1, Math.min(MAX_CROP_HEIGHT, Math.ceil(box.height + 2 * PAD)))
  }
}

async function captureOne(browser, { url, width, frames }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    const status = response?.status() ?? null
    if (status !== null && status >= 400) {
      await context.close()
      return { ok: false, status }
    }
    await scrollThrough(page)
    const height = await page.evaluate('document.documentElement.scrollHeight')
    const shot = await page.screenshot({
      fullPage: true,
      type: 'jpeg',
      quality: 55,
      ...(height > MAX_PAGE_HEIGHT ? { clip: { x: 0, y: 0, width, height: MAX_PAGE_HEIGHT } } : {})
    })
    const found = await page.evaluate(locateInPage, [...new Set(frames.map((f) => f.sha).filter(Boolean))])
    const boxes = assignBoxes(frames, found)
    return { ok: true, status, image: shot, height, boxes, page, context }
  } catch (error) {
    await context.close()
    return { ok: false, status: null, error: String(error?.message ?? error) }
  }
}

/**
 * @param {{ chromium: object, baseUrl: string, pages: { id: string, path: string }[],
 *   frames: { id: string, sha: string | null, pageId: string | null }[], widths?: number[],
 *   onProgress?: (line: string) => void }} input
 * @returns {Promise<{ pages: Record<string, Record<number, object>>, crops: Record<string, Record<number, Buffer>> }>}
 */
export async function captureSite({
  chromium,
  baseUrl,
  pages,
  frames,
  widths = WIDTHS,
  onProgress = () => {}
}) {
  const browser = await chromium.launch({ headless: true })
  const result = { pages: {}, crops: {} }
  const claimed = new Map() // frame id and width to { own }: a crop from the frame's own page beats one from another page
  try {
    for (const width of widths) {
      for (const p of pages) {
        onProgress(`${p.id} at ${width}`)
        const own = [...frames].sort((a, b) => Number(b.pageId === p.id) - Number(a.pageId === p.id))
        const got = await captureOne(browser, { url: joinUrl(baseUrl, p.path), width, frames: own })
        result.pages[p.id] ??= {}
        if (!got.ok) {
          result.pages[p.id][width] = { ok: false, status: got.status, error: got.error ?? null }
          continue
        }
        result.pages[p.id][width] = { ok: true, status: got.status, image: got.image, height: got.height }
        for (const [frameId, box] of got.boxes) {
          const key = `${frameId}@${width}`
          const frame = frames.find((f) => f.id === frameId)
          const mine = frame.pageId === p.id
          const prior = claimed.get(key)
          if (prior && (prior.own || !mine)) continue
          const crop = await got.page.screenshot({
            type: 'jpeg',
            quality: 72,
            fullPage: true,
            clip: clipOf(box, width)
          })
          claimed.set(key, { own: mine })
          ;(result.crops[frameId] ??= {})[width] = crop
        }
        await got.context.close()
      }
    }
  } finally {
    await browser.close()
  }
  return result
}
