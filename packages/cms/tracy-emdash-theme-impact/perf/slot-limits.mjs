// node perf/slot-limits.mjs <origin> > /tmp/measured.json : the most characters each text slot holds before its box gains a row (or
// its text runs past its box) at 1440, 768 and 390 px, on a clean install of this theme. The element is found by its own words
// (`text`) or by its placeholder (`placeholder`); the text is replaced by Latin running text of n characters and the largest n
// that keeps the rows and the box is searched. Prints one record per slot: the smallest of the three widths and each width.
import { chromium } from 'playwright'
const origin = process.argv[2]
const FILL = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua '.repeat(8)
const SPECS = JSON.parse(process.argv[3] ?? '[]')
const b = await chromium.launch()
const out = []
for (const spec of SPECS) {
  const per = {}
  for (const w of [1440, 768, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } })
    await p.goto(origin + spec.path, { waitUntil: 'load' })
    await p.waitForTimeout(500)
    per[w] = await p.evaluate(
      ({ spec, FILL, w }) => {
        const leaf = (words) =>
          [...document.querySelectorAll('body *')].filter((e) => !['SCRIPT', 'STYLE'].includes(e.tagName) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === words) ).pop()
        if (spec.placeholder) {
          const el = document.querySelector(`[placeholder="${spec.placeholder}"]`)
          if (!el) return null
          const cs = getComputedStyle(el)
          const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
          const ctx = document.createElement('canvas').getContext('2d')
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
          let lo = 1
          let hi = 300
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2)
            if (ctx.measureText(FILL.slice(0, mid).trim()).width <= room) lo = mid
            else hi = mid - 1
          }
          return { rows: 1, max: lo, boxWidth: Math.round(room) }
        }
        let el = spec.selector ? document.querySelector(spec.selector) : leaf(spec.text)
        if (!el) return null
        const nodes = spec.each ? [...el.parentElement.querySelectorAll(spec.each)] : [el]
        const target = (spec.each ? nodes[0] : el)
        const original = target.innerHTML
        const lineH = parseFloat(getComputedStyle(target).lineHeight) || 20
        const rows = () => Math.round(target.getBoundingClientRect().height / lineH)
        const base = rows()
        const parentRight = () => target.parentElement.getBoundingClientRect().right
        const bad = () => rows() > base + (spec.extraRows ?? 0) || target.getBoundingClientRect().right > parentRight() + 1 || target.scrollWidth > target.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth
        const set = (n) => {
          const t = FILL.slice(0, n).trim()
          target.textContent = spec.mode === 'copyright' ? `Copyright © 2026 ${t}. All Rights Reserved.` : t
        }
        let lo = 1
        let hi = 400
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          set(mid)
          if (!bad()) lo = mid
          else hi = mid - 1
        }
        target.innerHTML = original
        return { rows: base, max: lo, boxWidth: Math.round(target.getBoundingClientRect().width) }
      },
      { spec, FILL, w }
    )
    await p.close()
  }
  out.push({ slot: spec.slot, per })
}
console.log(JSON.stringify(out, null, 1))
await b.close()
