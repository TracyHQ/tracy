// node perf/bgpos.mjs <url> <width> : size, position and repeat of the biggest background pictures near the top of the page
import { chromium } from 'playwright'
const [, , url, width] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  (
    await p.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter(
          (e) =>
            getComputedStyle(e).backgroundImage !== 'none' &&
            e.getBoundingClientRect().height > 150 &&
            e.getBoundingClientRect().top + scrollY < 900
        )
        .map((e) => {
          const c = getComputedStyle(e),
            r = e.getBoundingClientRect()
          return `${String(e.className).slice(0, 26)} ${Math.round(r.top + scrollY)} ${Math.round(r.height)} ${c.backgroundSize} ${c.backgroundPosition} ${c.backgroundAttachment} ${c.backgroundImage.slice(-40, -2)}`
        })
    )
  ).join('\n')
)
await b.close()
