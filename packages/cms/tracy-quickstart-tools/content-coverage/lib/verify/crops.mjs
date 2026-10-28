// Crop each component out of the audit's full-page shots and bake the numbered outlines into the crop.
// The shots and the slot boxes come from the same render, in document coordinates, so they line up.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const COLOR = { red: '#e5484d', amber: '#f5a524', none: '#2f7cf6' }
export const levelOf = (flags) =>
  flags.some((f) => f.level === 'red') ? 'red' : flags.length ? 'amber' : 'none'
export const fileStem = (c) => `${c.entity}-p${c.page}`

function overlay(rows, vp, region) {
  const badge = vp === 'desktop' ? 22 : 15
  const seen = new Map()
  return rows
    .filter((r) => r.rects[vp])
    .map((r) => {
      const b = r.rects[vp]
      const k = `${b.x},${b.y}`
      const shift = seen.get(k) ?? 0
      seen.set(k, shift + 1)
      const col = COLOR[levelOf(r.flags)]
      const bx = Math.max(region.x, Math.min(b.x + shift * (badge + 6), region.x + region.w - badge - 8))
      const by = Math.max(region.y, b.y - badge - 2)
      return `<div style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border:${vp === 'desktop' ? 3 : 2}px solid ${col};background:${col}22;box-sizing:border-box"></div>
<div style="position:absolute;left:${bx}px;top:${by}px;min-width:${badge}px;height:${badge}px;padding:0 4px;background:${col};color:#fff;font:700 ${Math.round(badge * 0.7)}px/${badge}px system-ui,sans-serif;text-align:center;border-radius:4px;box-shadow:0 0 0 1px #fff">${r.n}</div>`
    })
    .join('\n')
}

/** A component's region grown by `margin` pixels on every side, held inside the shot. */
function grown(r, margin, shot) {
  if (!margin) return r
  const x = Math.max(0, r.x - margin)
  const y = Math.max(0, r.y - margin)
  return {
    x,
    y,
    w: Math.min(shot.width, r.x + r.w + margin) - x,
    h: Math.min(shot.height, r.y + r.h + margin) - y
  }
}

/** `margin`: extra page kept around each component (the label judge shows the model where it sits). */
export async function renderCrops({ chromium, model, auditDir, outDir, margin = 0 }) {
  const imgDir = join(outDir, 'images')
  mkdirSync(imgDir, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const vp of ['desktop', 'phone']) {
      const byPage = new Map()
      for (const c of model.components)
        if (c.region[vp]) byPage.set(c.page, [...(byPage.get(c.page) ?? []), c])
      for (const [n, comps] of byPage) {
        const shot = model.pages.find((p) => p.n === n)?.shots?.[vp]
        if (!shot) continue
        const html = join(auditDir, `view-${n}-${vp}.html`)
        writeFileSync(
          html,
          `<!doctype html><html><body style="margin:0"><div style="position:relative">
<img src="${shot.file}" style="display:block;width:${shot.width}px"><div id="ov"></div></div></body></html>`
        )
        const page = await browser.newPage({ viewport: { width: shot.width, height: 900 } })
        await page.goto(pathToFileURL(html).href)
        await page.waitForFunction(() => document.images[0]?.complete)
        for (const c of comps) {
          const r = grown(c.region[vp], margin, shot)
          const h = Math.min(r.h, shot.height - r.y)
          if (h < 10) continue
          await page.evaluate((s) => (document.getElementById('ov').innerHTML = s), overlay(c.rows, vp, r))
          const name = `${fileStem(c)}-${vp}.jpg`
          await page.screenshot({
            path: join(imgDir, name),
            type: 'jpeg',
            quality: 75,
            fullPage: true,
            clip: { x: r.x, y: r.y, width: r.w, height: h }
          })
          c.images = { ...c.images, [vp]: `images/${name}` }
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
