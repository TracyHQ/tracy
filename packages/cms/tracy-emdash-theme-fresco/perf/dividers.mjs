// node perf/dividers.mjs <url> <width> : every small bar (a box or pseudo-element up to 80 x 4 px) with its colour and position, to compare a section divider between two sites
import { chromium } from 'playwright'
const [, , url, width] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const out = []
      for (const e of document.querySelectorAll('body *')) {
        for (const pe of [null, '::before', '::after']) {
          const c = getComputedStyle(e, pe)
          if (pe && (c.content === 'none' || c.content === 'normal')) continue
          const w = parseFloat(c.width),
            h = parseFloat(c.height)
          if (!((w > 0 && w <= 80 && h > 0 && h <= 4) || (w > 0 && w <= 4 && h > 0 && h <= 40))) continue
          const bg = c.backgroundColor,
            bt = c.borderTopColor
          if (bg === 'rgba(0, 0, 0, 0)' && c.borderTopWidth === '0px') continue
          const r = e.getBoundingClientRect()
          out.push([
            Math.round(r.top + scrollY),
            (e.className || e.tagName).toString().slice(0, 24) + (pe ?? ''),
            Math.round(w) + 'x' + Math.round(h),
            bg,
            c.borderTopWidth !== '0px' ? bt : ''
          ])
        }
      }
      return out.slice(0, 14)
    })
  )
)
await b.close()
