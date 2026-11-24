// node perf/slot-measure.mjs <origin> <path> <src> [mode] [extraRows390] : the most characters a text slot holds before its box gains a row,
// at 1440, 768 and 390 px. The element is found by its provenance stamp (`X-Tracy-Preview: pick`): `<src>` is a text the stamp ends with
// (`field:brand_name`) or contains with the field after it (`:home-cases field:items.3.title`, slug then field). Its text is replaced by
// running Latin text of n characters. Modes:
//   rows (default)  the row count of the element (its height without padding / line height) stays at today's rows (+ extra rows at 390 px)
//   nowrap          the element never wraps (a chip): its width stays within its card
//   copyright       the business name inside the footer line (`Copyright © 2026 <n chars>. All Rights Reserved.`): the number is the name's length
//   insert:<css>    the field is empty today, so no element is stamped: a <p> is added to the first of the cards found by `<css>` (the `.mg-case`
//                   cards of the section stamped by <src>); the 5th argument is the row budget `<wide>,<narrow>` (rows the same text takes in
//                   the sibling block that prints it today, at 1440 px and below): the number is the most characters within that budget
import { chromium } from 'playwright'
const [, , origin, path, src, mode = 'rows', extra = '0'] = process.argv
const FILL =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua '.repeat(
    8
  )
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
const out = {}
for (const w of [1440, 768, 390]) {
  const p = await b.newPage({
    viewport: { width: w, height: 900 },
    extraHTTPHeaders: { 'X-Tracy-Preview': 'pick' }
  })
  await p.goto(origin + path, { waitUntil: 'load' })
  await p.waitForTimeout(600)
  out[w] = await p.evaluate(
    ({ src, FILL, mode, extra, w }) => {
      const stamped = [...document.querySelectorAll('[data-tracy-src]')]
      if (mode.startsWith('insert:')) {
        const anchor = stamped.find((e) => e.getAttribute('data-tracy-src').includes(src))
        const section = anchor?.closest('section')
        const cards = section ? [...section.querySelectorAll(mode.slice(7))] : []
        if (!cards.length) return null
        const budget = Number(extra.split(',')[w === 1440 ? 0 : 1])
        const body = cards[0].querySelector('.mg-case-body')
        const pp = document.createElement('p')
        body.appendChild(pp)
        const rowsOf = () => Math.round(pp.getBoundingClientRect().height / (parseFloat(getComputedStyle(pp).lineHeight) || 24))
        let lo = 1
        let hi = 400
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          pp.textContent = FILL.slice(0, mid).trim()
          if (rowsOf() <= budget) lo = mid
          else hi = mid - 1
        }
        return { max: lo, boxWidth: Math.round(body.getBoundingClientRect().width) }
      }
      const el = stamped.find((e) => {
        const s = e.getAttribute('data-tracy-src')
        return src.startsWith('field:') ? s.endsWith(src) : src.includes(' field:') ? s.includes(src.split(' ')[0]) && s.endsWith(src.split(' ')[1]) : s.includes(src)
      })
      if (!el) return null
      const original = el.innerHTML
      const cs = getComputedStyle(el)
      const lineH = parseFloat(cs.lineHeight) || 20
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const rows = () => Math.round((el.getBoundingClientRect().height - pad) / lineH)
      const card = el.closest('.mg-case')
      const fits = () => (mode === 'nowrap' ? el.getBoundingClientRect().width <= card.getBoundingClientRect().width : rows() <= base)
      const base = rows() + (w === 390 ? Number(extra) : 0)
      const set = (n) => {
        const t = FILL.slice(0, n).trim()
        el.textContent = mode === 'copyright' ? `Copyright © 2026 ${t}. All Rights Reserved.` : t
      }
      let lo = 1
      let hi = 400
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        set(mid)
        if (fits()) lo = mid
        else hi = mid - 1
      }
      el.innerHTML = original
      return { rows: base, max: lo, boxWidth: Math.round(el.getBoundingClientRect().width) }
    },
    { src, FILL, mode, extra, w }
  )
  await p.close()
}
await b.close()
console.log(JSON.stringify(out))
