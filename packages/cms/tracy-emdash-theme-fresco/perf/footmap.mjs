// node perf/footmap.mjs <url> <width> '<footer selector>' : each footer heading's x and y inside the footer, plus the copyright line's y
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(800)
console.log(
  JSON.stringify(
    await p.evaluate((s) => {
      const f = document.querySelector(s)
      const ft = f.getBoundingClientRect().top + scrollY
      const hs = [...f.querySelectorAll('h3')].map((h) => {
        const r = h.getBoundingClientRect()
        return [h.textContent.trim().slice(0, 8), Math.round(r.left), Math.round(r.top + scrollY - ft)]
      })
      const last = [...f.querySelectorAll('p, li, a')]
        .filter((e) => e.getClientRects().length)
        .map((e) => Math.round(e.getBoundingClientRect().bottom + scrollY - ft))
        .sort((a, b) => b - a)[0]
      return { h: Math.round(f.getBoundingClientRect().height), hs, lastBottom: last }
    }, sel)
  )
)
await b.close()
