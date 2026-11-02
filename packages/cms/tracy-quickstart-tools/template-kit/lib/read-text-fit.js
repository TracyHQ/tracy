// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * The character limit of each text box of a block, measured from its frame: the box that shows a text is filled
 * with that text repeated, longer and longer, until it needs more lines than allowed, the block grows taller than
 * those lines need, the text or any other text of the block runs past the block's right edge, or another text of the
 * block wraps onto more lines (an item that grows with its words, a tab or a chip, pushing its neighbours). The
 * longest fill that passes is the limit, so two rows of one list in frames of one size get one limit whatever their
 * demo lengths. Allowed lines: the demo's own (a demo split by a forced line break, an address's street over its
 * city, is filled as words on that many lines, the break read as a space), or `lines` when the slot shows on more
 * lines elsewhere (a title that wraps nicely on another card). The box is put back as it was.
 * @param {{block: string, texts: {id: string, text: string, lines?: number}[]}} o
 * @returns {Record<string, {limit: number, lines: number, allowed: number, demo: number}>} only the texts found and shown
 */
export function readTextFit({ block, texts }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return {}
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
  const all = [...root.querySelectorAll('*')].filter(
    (el) => !/^(SCRIPT|STYLE|NOSCRIPT|svg)$/i.test(el.tagName)
  )
  const boxOf = (text) => {
    const want = norm(text)
    if (!want) return null
    // innerText reads a line break (a forced second line of an address) as a space between the words.
    const hits = all.filter((el) => {
      const have = norm(el.innerText ?? el.textContent)
      return have === want || (want.length >= 40 && have.startsWith(want))
    })
    // The innermost element that shows the whole text.
    return hits.find((el) => !hits.some((h) => h !== el && el.contains(h) && shown(h)) && shown(el)) ?? null
  }
  const linesOf = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const tops = []
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue
      if (!tops.some((t) => Math.abs(t - r.top) <= 3)) tops.push(r.top)
    }
    return Math.max(tops.length, 1)
  }
  // The other texts of the block: elements with words of their own and no element child holding words.
  const leaves = all.filter(
    (el) => shown(el) && norm(el.textContent) && ![...el.children].some((c) => norm(c.textContent))
  )
  const used = new Set()
  const out = {}
  for (const { id, text, lines: wanted } of texts) {
    const el = boxOf(text)
    if (!el || used.has(el)) continue
    used.add(el)
    const saved = el.innerHTML
    // innerText, not textContent: a forced line break (<br>) is a space between the words, never words run together.
    const demo = (el.innerText || el.textContent).replace(/\s+/g, ' ').trim()
    const lines = linesOf(el)
    const allowed = Math.max(lines, Number(wanted) || 0)
    const lineHeight = el.getBoundingClientRect().height / lines
    const height = root.getBoundingClientRect().height + (allowed - lines) * lineHeight
    const right = root.getBoundingClientRect().right
    const others = leaves.filter((x) => x !== el && !el.contains(x) && !x.contains(el))
    // What each other text showed before: its lines and right edge (one already past the block, a slide off to the
    // side, may stay there).
    const before = new Map(
      others.map((x) => [x, { lines: linesOf(x), right: x.getBoundingClientRect().right }])
    )
    const seed = `${demo || 'text'} `
    const fill = (n) => {
      let s = seed
      while (s.length < n) s += seed
      el.textContent = s.slice(0, n)
    }
    const ok = (n) => {
      fill(n)
      const r = el.getBoundingClientRect()
      if (linesOf(el) > allowed || root.getBoundingClientRect().height > height + 1 || r.right > right + 1)
        return false
      return others.every((x) => {
        const b = before.get(x)
        return linesOf(x) <= b.lines && x.getBoundingClientRect().right <= Math.max(right, b.right) + 1
      })
    }
    try {
      let lo = 0
      let hi = Math.max(8, demo.length)
      while (hi <= 6000 && ok(hi)) {
        lo = hi
        hi *= 2
      }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (ok(mid)) lo = mid
        else hi = mid
      }
      // A box that never runs out of room (its words clipped or hidden past the edge) has no frame to read.
      if (lo > 0 && hi <= 6000) out[id] = { limit: lo, lines, allowed, demo: demo.length }
    } finally {
      el.innerHTML = saved
    }
  }
  return out
}
