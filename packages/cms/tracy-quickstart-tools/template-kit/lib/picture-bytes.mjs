// The picture file a frame shows, as JPEG bytes for the vision model: the file itself, loaded from the site and
// drawn in a blank page's canvas (an SVG icon is rasterised the same way). No screenshot of the site is taken.
import { openKitContext } from './capture.mjs'
import { urlOfPath } from './kit-paths.mjs'

const SIDE = 512

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, pictures: {id: string, path: string}[]}} o
 * @returns {Promise<Map<string, Buffer>>} frame id -> JPEG bytes (frames whose file did not load are left out)
 */
export async function pictureBytes({ chromium, siteUrl, hostHeader, pictures }) {
  const out = new Map()
  if (!pictures.length) return out
  const browser = await chromium.launch()
  try {
    const ctx = await openKitContext(browser, { width: 800, siteUrl, hostHeader })
    const page = await ctx.newPage()
    await page
      .goto(urlOfPath('/', siteUrl), { waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {})
    for (const p of pictures) {
      const b64 = await page
        .evaluate(
          async ({ url, side }) => {
            const img = new Image()
            img.src = url
            await img.decode()
            const w = img.naturalWidth || side
            const h = img.naturalHeight || side
            const s = Math.min(1, side / Math.max(w, h))
            const c = document.createElement('canvas')
            c.width = Math.max(1, Math.round(w * s))
            c.height = Math.max(1, Math.round(h * s))
            const g = c.getContext('2d')
            g.fillStyle = '#ffffff'
            g.fillRect(0, 0, c.width, c.height)
            g.drawImage(img, 0, 0, c.width, c.height)
            return c.toDataURL('image/jpeg', 0.85).split(',')[1]
          },
          { url: urlOfPath(`/${String(p.path).replace(/^\/+/, '')}`, siteUrl), side: SIDE }
        )
        .catch(() => null)
      if (b64) out.set(p.id, Buffer.from(b64, 'base64'))
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
  return out
}
