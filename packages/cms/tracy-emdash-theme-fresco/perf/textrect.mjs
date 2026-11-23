// node perf/textrect.mjs <url> <width> '<text start>'... : rect, font size and padding of the smallest element whose own text starts with each string
import { chromium } from 'playwright'
const [, , url, width, ...texts] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(800)
for (const t of texts)
  console.log(
    t,
    JSON.stringify(
      await p.evaluate((s) => {
        const e = [...document.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,div,span')]
          .filter((x) => x.textContent.trim().startsWith(s))
          .pop()
        if (!e) return null
        const r = e.getBoundingClientRect(),
          c = getComputedStyle(e),
          pc = getComputedStyle(e.parentElement)
        return {
          x: Math.round(r.x),
          w: Math.round(r.width),
          h: Math.round(r.height),
          fs: c.fontSize,
          color: c.color,
          op: c.opacity,
          fw: c.fontWeight,
          ls: c.letterSpacing,
          pl: pc.paddingLeft,
          pr: pc.paddingRight,
          ml: c.marginLeft,
          mr: c.marginRight
        }
      }, t)
    )
  )
await b.close()
