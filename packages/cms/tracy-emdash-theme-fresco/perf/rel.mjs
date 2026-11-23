// node perf/rel.mjs <url> <width> <index | text the section starts with> : every text/image box of one section, as [tag, top, height, left, width, text] relative to the section top
import { chromium } from 'playwright'
const [, , url, width, idx] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
const out = await p.evaluate((idx) => {
  const secs = [...document.querySelectorAll('.t4-mod-wrap, main section')].filter(
    (e) => e.getClientRects().length
  )
  const s = /^\d+$/.test(idx) ? secs[+idx] : secs.find((e) => (e.innerText || '').trim().startsWith(idx))
  const t = s.getBoundingClientRect().top + scrollY
  const r = []
  const w = document.createTreeWalker(s, NodeFilter.SHOW_ELEMENT)
  let n
  while ((n = w.nextNode())) {
    const hasText = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    if (!(hasText || n.tagName === 'IMG')) continue
    const q = n.getBoundingClientRect()
    r.push([
      n.tagName.toLowerCase(),
      Math.round(q.top + scrollY - t),
      Math.round(q.height),
      Math.round(q.left),
      Math.round(q.width),
      (n.textContent || '').trim().slice(0, 18)
    ])
  }
  return r
}, idx)
for (const l of out) console.log(l.join(' | '))
await b.close()
