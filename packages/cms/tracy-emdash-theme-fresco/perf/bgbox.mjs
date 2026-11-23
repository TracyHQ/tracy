// node perf/bgbox.mjs <url> <width> <y0> <y1> : boxes with a background picture taller than 150 px between y0 and y1 (tiles, bands): class, top, height, left, width
import { chromium } from 'playwright'
const [, , url, width, y0, y1] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  (
    await p.evaluate(
      ([y0, y1]) =>
        [...document.querySelectorAll('body *')]
          .filter(
            (e) => getComputedStyle(e).backgroundImage !== 'none' && e.getBoundingClientRect().height > 150
          )
          .map((e) => {
            const r = e.getBoundingClientRect()
            return [
              String(e.className).slice(0, 28),
              Math.round(r.top + scrollY),
              Math.round(r.height),
              Math.round(r.left),
              Math.round(r.width)
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
