// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * How many characters a row of labels holds when all are filled together (a main menu): each label's box gets its
 * demo words plus the same number of extra characters, more and more, until a label wraps onto a second line, drops
 * to another row, runs past the block's right edge, the block grows taller, or another text of the block wraps. The
 * row's limit is the total of the longest fill that passes. `shown: false` when the labels are not all shown on one
 * row at this width (the menu folds into an off-canvas button).
 * @param {{block: string, labels: string[]}} o
 * @returns {{shown: boolean, total?: number, extra?: number, demo?: number}}
 */
export function readRowFit({ block, labels }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return { shown: false }
  const norm = (s) =>
    String(s ?? '')
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
    const hits = all.filter((el) => norm(el.textContent) === want && shown(el))
    return hits.find((el) => !hits.some((h) => h !== el && el.contains(h))) ?? null
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
  const boxes = labels.map(boxOf)
  if (boxes.some((b) => !b)) return { shown: false }
  const top = (el) => el.getBoundingClientRect().top
  if (boxes.some((b) => Math.abs(top(b) - top(boxes[0])) > 3)) return { shown: false }
  const saved = boxes.map((b) => b.innerHTML)
  const demos = boxes.map((b) => b.textContent.replace(/\s+/g, ' ').trim())
  const tops = boxes.map(top)
  const lines = boxes.map(linesOf)
  const height = root.getBoundingClientRect().height
  const right = root.getBoundingClientRect().right
  const others = all.filter(
    (x) =>
      shown(x) &&
      norm(x.textContent) &&
      ![...x.children].some((c) => norm(c.textContent)) &&
      !boxes.some((b) => b === x || b.contains(x) || x.contains(b))
  )
  const before = new Map(
    others.map((x) => [x, { lines: linesOf(x), right: x.getBoundingClientRect().right }])
  )
  const fill = (k) =>
    boxes.forEach((b, i) => {
      let s = demos[i]
      while (s.length < demos[i].length + k) s += ` ${demos[i]}`
      b.textContent = s.slice(0, demos[i].length + k)
    })
  const ok = (k) => {
    fill(k)
    if (root.getBoundingClientRect().height > height + 1) return false
    for (const [i, b] of boxes.entries())
      if (
        linesOf(b) > lines[i] ||
        Math.abs(top(b) - tops[i]) > 3 ||
        b.getBoundingClientRect().right > right + 1
      )
        return false
    return others.every((x) => {
      const was = before.get(x)
      return linesOf(x) <= was.lines && x.getBoundingClientRect().right <= Math.max(right, was.right) + 1
    })
  }
  const demo = demos.reduce((a, d) => a + d.length, 0)
  try {
    if (!ok(0)) return { shown: true, total: demo, extra: 0, demo }
    let lo = 0
    let hi = 8
    while (hi <= 400 && ok(hi)) {
      lo = hi
      hi *= 2
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (ok(mid)) lo = mid
      else hi = mid
    }
    return { shown: true, total: demo + lo * boxes.length, extra: lo, demo }
  } finally {
    boxes.forEach((b, i) => {
      b.innerHTML = saved[i]
    })
  }
}
