// Runs INSIDE the page (Playwright `page.evaluate`) after `readFrames` tagged the block's frames `data-kit-frame`:
// no imports, no closures over Node values. Read before any frame is emptied.

/**
 * The card each list row's picture prints in, and the block's text slots shown inside that card. The card is found
 * the way `unevenRow` (hide-frames.js) finds a row: climb from the picture's holder until an element has a sibling of
 * the same signature (tag and classes). The climb stops at the block, and at an element that also holds the picture
 * of another row (that is the list, not one card): the row then prints in the `block`. A text slot is found by its
 * words like read-text-fit.js `boxOf` (the innermost element showing the whole text); two slots with the same words
 * take two elements, in the order given, so each lands in its own card.
 * @param {{block: string, frames: {id: string, row: string}[], texts: {id: string, text: string}[]}} o
 * @returns {Record<string, {printsIn: string, texts: string[]}>} per frame found in the block
 */
export function readRowCards({ block, frames, texts }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return {}
  // A slider's state classes (`active`, `owl-item`, `swiper-slide-next`) differ between slides of one set, as in
  // row-fix.js: left out of the signature, or the shown slides and the hidden ones read as two kinds of card.
  const STATE = /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)/
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c))
      .sort()
      .join('.')}`
  const norm = (s) =>
    String(s ?? '')
      .replace(/\(\([^)]*\)\)|<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  // A looping slider prints copies of its slides around them: a row's picture or text is the slide's, never a copy's.
  const copy = (el) => !!el.closest('.cloned, .swiper-slide-duplicate, .slick-cloned')
  const pick = (els) =>
    els.find((e) => !copy(e) && shown(e)) ?? els.find((e) => !copy(e)) ?? els.find(shown) ?? els[0] ?? null
  const all = [...root.querySelectorAll('*')].filter(
    (el) => !/^(SCRIPT|STYLE|NOSCRIPT|svg)$/i.test(el.tagName)
  )
  const used = new Set()
  const textEls = []
  for (const { id, text } of texts) {
    const want = norm(text)
    if (!want) continue
    const hits = all.filter((el) => {
      const have = norm(el.innerText ?? el.textContent)
      return have === want || (want.length >= 40 && have.startsWith(want))
    })
    const inner = hits.filter((el) => !hits.some((h) => h !== el && el.contains(h)))
    const el = pick(inner.filter((e) => !used.has(e)))
    if (!el) continue
    used.add(el)
    textEls.push([id, el])
  }
  // Rows that show the same demo picture tag the same elements: each row takes its own, in the order given, as two
  // text slots with the same words do above (JA Symphony's gallery slides 1, 5 and 6 show one picture).
  const taken = new Set()
  const elOf = (id) => {
    const els = [...root.querySelectorAll(`[data-kit-frame~="${id}"]`)].filter((e) => !taken.has(e))
    const el = pick(els)
    if (el) taken.add(el)
    return el
  }
  const placed = frames.map((f) => ({ ...f, el: elOf(f.id) })).filter((f) => f.el)
  const out = {}
  for (const f of placed) {
    const node =
      f.el.tagName === 'IMG' && f.el.parentElement?.tagName === 'PICTURE' ? f.el.parentElement : f.el
    const start = f.el.tagName === 'IMG' ? node.parentElement : f.el
    const others = placed.filter((o) => o.row !== f.row)
    let card = null
    for (let e = start; e && e !== root && root.contains(e); e = e.parentElement) {
      if (others.some((o) => e.contains(o.el))) break
      const twins = [...(e.parentElement?.children ?? [])].filter((c) => c !== e && sig(c) === sig(e))
      if (twins.length) {
        card = e
        break
      }
    }
    out[f.id] = card
      ? { printsIn: sig(card), texts: textEls.filter(([, el]) => card.contains(el)).map(([id]) => id) }
      : { printsIn: 'block', texts: [] }
  }
  return out
}
