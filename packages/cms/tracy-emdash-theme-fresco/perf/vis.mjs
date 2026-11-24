// node perf/vis.mjs <url> <width> '<selector>' : opacity and visibility of the element and each ancestor, and whether the page has scrolled to it (reveal animations)
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
const probe = () =>
  p.evaluate((s) => {
    let e = document.querySelector(s)
    const out = []
    while (e && e !== document.body) {
      const c = getComputedStyle(e)
      out.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 20)}:${c.opacity}/${c.visibility}`)
      e = e.parentElement
    }
    return out.join(' < ')
  }, sel)
console.log('before scroll:', await probe())
await p.evaluate((s) => document.querySelector(s)?.scrollIntoView(), sel)
await p.waitForTimeout(1500)
console.log('after scroll :', await probe())
await b.close()
