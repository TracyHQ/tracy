// node perf/h3w.mjs <url> <width> '<h3 text start>' : unrounded text width, box widths and neighbours of one dish name (knife-edge wraps)
import { chromium } from 'playwright'
const [, , url, width, txt] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
console.log(
  await p.evaluate((t) => {
    const e = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim().startsWith(t))
    const nowrap = e.cloneNode(true)
    nowrap.style.cssText = 'white-space:nowrap;position:absolute;width:auto;visibility:hidden'
    e.parentElement.appendChild(nowrap)
    const nat = nowrap.getBoundingClientRect().width
    nowrap.remove()
    const par = e.parentElement
    const row = par.parentElement
    const rr = row.getBoundingClientRect()
    return JSON.stringify({
      natural: nat,
      h3: e.getBoundingClientRect().width,
      parent: par.getBoundingClientRect().width,
      row: rr.width,
      rowPad: getComputedStyle(row).paddingLeft + '/' + getComputedStyle(row).paddingRight,
      gap: getComputedStyle(row).columnGap,
      kids: [...row.children].map((k) => k.getBoundingClientRect().width)
    })
  }, txt)
)
await b.close()
