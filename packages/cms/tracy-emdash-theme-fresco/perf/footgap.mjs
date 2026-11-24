// node perf/footgap.mjs <url> <width> '<footer selector>' : the footer's top, the bottom of the last visible block above it, and the padding between them
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
      const top = f.getBoundingClientRect().top + scrollY
      let last = 0
      for (const e of document.querySelectorAll('body *')) {
        if (
          f.contains(e) ||
          e.contains(f) ||
          (e.children.length && e.tagName !== 'A') ||
          !(e.textContent.trim() || e.tagName === 'IMG')
        )
          continue
        const r = e.getBoundingClientRect()
        if (
          r.height > 0 &&
          r.width > 0 &&
          r.bottom + scrollY <= top + 1 &&
          getComputedStyle(e).visibility !== 'hidden'
        )
          last = Math.max(last, r.bottom + scrollY)
      }
      const cs = getComputedStyle(f)
      return {
        footerTop: Math.round(top),
        lastBottom: Math.round(last),
        gap: Math.round(top - last),
        padTop: cs.paddingTop
      }
    }, sel)
  )
)
await b.close()
