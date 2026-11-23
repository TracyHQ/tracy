// node perf/rangew.mjs <url> <width> '<text start>'... : the width of the text itself (a Range over the text node), font size and family start of the element holding it
import { chromium } from 'playwright'
const [, , url, width, ...texts] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
for (const s of texts)
  console.log(
    s,
    await p.evaluate((s) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n
      while ((n = w.nextNode()))
        if (
          n.textContent.trim().toLowerCase().startsWith(s.toLowerCase()) &&
          n.parentElement.getClientRects().length
        ) {
          const r = document.createRange()
          r.selectNodeContents(n)
          const c = getComputedStyle(n.parentElement)
          return JSON.stringify([
            Math.round(r.getBoundingClientRect().width * 10) / 10,
            c.fontSize,
            c.fontFamily.slice(0, 22),
            c.textTransform,
            c.letterSpacing
          ])
        }
      return null
    }, s)
  )
await b.close()
