// node perf/navpos.mjs <url> <width> '<link selector>' : x, width and font of each header menu link
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  JSON.stringify(
    await p.$$eval(sel, (els) =>
      els
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          const r = e.getBoundingClientRect(),
            c = getComputedStyle(e)
          return [
            e.textContent.trim().slice(0, 10),
            Math.round(r.x),
            Math.round(r.width),
            c.fontSize,
            c.letterSpacing,
            c.paddingLeft,
            c.paddingRight,
            c.fontWeight,
            c.textTransform
          ]
        })
    )
  )
)
await b.close()
