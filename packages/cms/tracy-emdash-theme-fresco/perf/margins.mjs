// node perf/margins.mjs <url> <width> "<text start>" : margins, paddings and line height of an element, the next sibling and the parent
import { chromium } from 'playwright'
const [, , url, width, txt] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
console.log(
  await p.evaluate((t) => {
    const e = [...document.querySelectorAll('h1,h2,h3,p')].find((x) => x.textContent.trim().startsWith(t))
    const n = e.nextElementSibling
    const f = (x) => {
      const c = getComputedStyle(x)
      return [
        x.tagName,
        x.className,
        c.marginTop,
        c.marginBottom,
        c.paddingTop,
        c.paddingBottom,
        c.lineHeight,
        c.fontSize
      ].join(' ')
    }
    return f(e) + '\n' + f(n) + '\n' + f(e.parentElement)
  }, txt)
)
await b.close()
