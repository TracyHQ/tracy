// node perf/boxh.mjs <url> <width> '<selector>'... : top and height of the first match of each selector
import { chromium } from 'playwright'
const [, , url, width, ...sels] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(800)
for (const s of sels)
  console.log(
    s,
    JSON.stringify(
      await p.evaluate((s) => {
        const e = document.querySelector(s)
        if (!e) return null
        const r = e.getBoundingClientRect()
        return [Math.round(r.top + scrollY), Math.round(r.height)]
      }, s)
    )
  )
await b.close()
