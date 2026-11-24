// node perf/kids.mjs <url> <width> <y0> <y1> : leaf text/image boxes whose top lies between y0 and y1 (page coordinates), as [tag, top, height, left, width, text]
import { chromium } from 'playwright'
const [, , url, width, y0, y1] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
console.log(
  (
    await p.evaluate(
      ([y0, y1]) =>
        [...document.querySelectorAll('body *')]
          .filter(
            (e) =>
              e.getClientRects().length &&
              (!e.children.length || e.tagName === 'A' || e.tagName === 'BUTTON') &&
              (e.textContent.trim() || e.tagName === 'IMG')
          )
          .map((e) => {
            const r = e.getBoundingClientRect()
            return [
              e.tagName.toLowerCase(),
              Math.round(r.top + scrollY),
              Math.round(r.height),
              Math.round(r.left),
              Math.round(r.width),
              e.textContent.trim().slice(0, 18)
            ]
          })
          .filter((a) => a[1] >= y0 && a[1] <= y1),
      [+y0, +y1]
    )
  )
    .map((a) => a.join(' | '))
    .join('\n')
)
await b.close()
