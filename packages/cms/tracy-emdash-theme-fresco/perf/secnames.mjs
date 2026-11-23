// node perf/secnames.mjs <url> <width> '<section selector>' : top, height and the first words of every matching section
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
for (const r of await p.$$eval(sel, (els) =>
  els
    .filter((e) => e.getClientRects().length)
    .map((e) => [
      Math.round(e.getBoundingClientRect().top + scrollY),
      Math.round(e.getBoundingClientRect().height),
      (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      e.querySelector('[class*="menu"]')?.className.slice(0, 40) ?? ''
    ])
))
  console.log(r.join(' | '))
await b.close()
