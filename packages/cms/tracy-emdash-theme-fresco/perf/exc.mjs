// node perf/exc.mjs <url> <width> '<selector>' : the text and character count of each element (excerpts)
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(800)
console.log(
  JSON.stringify(
    await p.$$eval(sel, (els) =>
      els.slice(0, 4).map((e) => {
        const r = e.getBoundingClientRect()
        return [
          e.textContent.trim().length,
          Math.round(r.width),
          Math.round(r.height),
          e.textContent.trim().slice(-40)
        ]
      })
    )
  )
)
await b.close()
