// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * The character limit of each text box of a block, measured from its frame: the box that shows a text is filled
 * with that text repeated, longer and longer, until it needs more lines than the demo text used, the block grows taller,
 * or the text runs past the block's right edge. The longest fill that passes is the limit, so two rows of one
 * list in frames of one size get one limit whatever their demo lengths. The box is put back as it was.
 * @param {{block: string, texts: {id: string, text: string}[]}} o
 * @returns {Record<string, {limit: number, lines: number, demo: number}>} only the texts found and shown
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
    const hits = all.filter((el) => {
      const have = norm(el.textContent)
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
  const used = new Set()
  const out = {}
  for (const { id, text } of texts) {
    const el = boxOf(text)
    if (!el || used.has(el)) continue
    used.add(el)
    const saved = el.innerHTML
    const demo = el.textContent.replace(/\s+/g, ' ').trim()
    const lines = linesOf(el)
    const height = root.getBoundingClientRect().height
    const right = root.getBoundingClientRect().right
    const seed = `${demo || 'text'} `
    const fill = (n) => {
      let s = seed
      while (s.length < n) s += seed
      el.textContent = s.slice(0, n)
    }
    const ok = (n) => {
      fill(n)
      const r = el.getBoundingClientRect()
      return linesOf(el) <= lines && root.getBoundingClientRect().height <= height + 1 && r.right <= right + 1
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
      if (lo > 0) out[id] = { limit: lo, lines, demo: demo.length }
    } finally {
      el.innerHTML = saved
    }
  }
  return out
}
