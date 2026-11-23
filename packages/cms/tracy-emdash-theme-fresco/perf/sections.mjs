// node perf/sections.mjs <url> <width> '<section selector>' : top and height of every matching section (drift between two builds of one page)
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
          const r = e.getBoundingClientRect()
          return [Math.round(r.top + scrollY), Math.round(r.height)]
        })
    )
  )
)
await b.close()
