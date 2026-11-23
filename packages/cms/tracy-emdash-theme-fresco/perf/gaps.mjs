// node perf/gaps.mjs <url> <width> '<container>' : for each h3 in the container, the gap above it to the bottom of the previous leaf block in document order (same column), and below it to the next leaf
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1000)
console.log(
  JSON.stringify(
    await p.$eval(sel, (root) => {
      const leaves = [...root.querySelectorAll('h3,p,li,a,button,address')].filter(
        (e) => e.getClientRects().length && !e.querySelector('h3,p,li,button')
      )
      return leaves.flatMap((e, i) => {
        if (e.tagName !== 'H3') return []
        const r = e.getBoundingClientRect()
        const prev = leaves
          .slice(0, i)
          .reverse()
          .find(
            (x) =>
              x.getBoundingClientRect().bottom <= r.top + 1 &&
              Math.abs(
                x.getBoundingClientRect().left + x.getBoundingClientRect().width / 2 - (r.left + r.width / 2)
              ) < 200
          )
        return [
          {
            t: e.textContent.trim().slice(0, 10),
            above: prev ? Math.round(r.top - prev.getBoundingClientRect().bottom) : null
          }
        ]
      })
    })
  )
)
await b.close()
