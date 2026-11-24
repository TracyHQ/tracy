// node perf/chips.mjs <url> <width> '<selector>' : box and background colour of every match (price chips on pictures)
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  JSON.stringify(
    await p.$$eval(sel, (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect(),
          c = getComputedStyle(e)
        return [
          e.textContent.trim(),
          Math.round(r.top + scrollY),
          Math.round(r.width),
          c.backgroundColor,
          c.opacity
        ]
      })
    )
  )
)
await b.close()
