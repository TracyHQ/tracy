// node perf/slot-measure.mjs <origin> <path> <stamp field> [mode] : the most characters a text slot holds before its box gains a row,
// at 1440, 768 and 390 px (`text:<words>` finds the element by its own words; the 5th argument lets the 390 px box have that many rows more). The element is found by its provenance stamp (`X-Tracy-Preview: pick`); its text is replaced by running
// Latin text of n characters (mode `copyright`: the business name inside the footer line, so the number is the name's length).
import { chromium } from 'playwright'
const [, , origin, path, field, mode = '', extra = '0'] = process.argv
const FILL =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua '.repeat(
    8
  )
const b = await chromium.launch()
const out = {}
for (const w of [1440, 768, 390]) {
  const p = await b.newPage({
    viewport: { width: w, height: 900 },
    extraHTTPHeaders: { 'X-Tracy-Preview': 'pick' }
  })
  await p.goto(origin + path, { waitUntil: 'load' })
  await p.waitForTimeout(600)
  out[w] = await p.evaluate(
    ({ field, FILL, mode, extra, w }) => {
      const el = field.startsWith('text:')
        ? [...document.querySelectorAll('body *')]
            .filter((e) => e.firstChild?.nodeType === 3 && e.firstChild.textContent.trim() === field.slice(5))
            .pop()
        : [...document.querySelectorAll('[data-tracy-src]')].find((e) =>
            e.getAttribute('data-tracy-src').endsWith(`field:${field}`)
          )
      if (!el) return null
      const original = el.innerHTML
      const lineH = parseFloat(getComputedStyle(el).lineHeight) || 20
      const rows = () => Math.round(el.getBoundingClientRect().height / lineH)
      const base = rows() + (w === 390 ? Number(extra) : 0)
      const set = (n) => {
        const t = FILL.slice(0, n).trim()
        const text = mode === 'copyright' ? `Copyright © 2026 ${t}. All Rights Reserved.` : t
        if (field.startsWith('text:')) el.firstChild.textContent = text
        else el.textContent = text
      }
      let lo = 1
      let hi = 400
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        set(mid)
        if (rows() <= base) lo = mid
        else hi = mid - 1
      }
      el.innerHTML = original
      return { rows: base, max: lo, boxWidth: Math.round(el.getBoundingClientRect().width) }
    },
    { field, FILL, mode, extra, w }
  )
  await p.close()
}
await b.close()
console.log(JSON.stringify(out))
