// Rows of a repeated list as boxes: which visual line each row sits on, whether the last line is laid out
// right (it fills the line, or it is centered in its container), and the smallest count a list can take.

/** Rows grouped into visual lines by their top edge (within `tol` px), top to bottom. */
export function linesOf(boxes, tol = 4) {
  const lines = []
  for (const b of [...boxes].sort((a, z) => a.top - z.top || a.left - z.left)) {
    const line = lines.find((l) => Math.abs(l.top - b.top) <= tol)
    if (line) line.rows.push(b)
    else lines.push({ top: b.top, rows: [b] })
  }
  return lines
}

/**
 * Is a set of rows laid out right? The last line either holds as many rows as the first (it fills the line)
 * or sits centered in the container (left and right gaps within `tol` px). Rows stacked one per line at a
 * narrow width fill their line by definition.
 */
export function layoutCheck(rows, container, tol = 6) {
  if (!rows.length) return { ok: false, reason: 'no row is shown' }
  const lines = linesOf(rows)
  const first = lines[0].rows.length
  const last = lines.at(-1).rows
  if (last.length === first && lines.length > 1)
    return { ok: true, reason: 'the last line is full', lines: lines.length }
  const left = Math.min(...last.map((r) => r.left)) - container.left
  const right = container.left + container.width - Math.max(...last.map((r) => r.left + r.width))
  if (Math.abs(left - right) <= tol)
    return { ok: true, reason: 'the last line is centered', lines: lines.length }
  if (left <= tol && right <= tol) return { ok: true, reason: 'the rows fill the line', lines: lines.length }
  return {
    ok: false,
    reason: `the last line leaves a hole (${left}px left, ${right}px right)`,
    lines: lines.length,
    // A short last line pressed to the left while the rows are whole: what centering would fix.
    leftPacked: left <= tol && right > tol,
    gap: { left, right }
  }
}

/** The repeated set in a block that holds a declared list: the first unused set with exactly `items` rows. */
export function matchRepeat(repeats, items, used = new Set()) {
  const key = (r) => r.path.join('.')
  // A set of rows the page shows wins over one it keeps hidden (rows in a closed tab, read since they count too).
  const free = (repeats ?? []).filter((r) => r.count === items && !used.has(key(r)))
  const hit = free.find((r) => r.shownCount !== 0) ?? free[0]
  if (hit) used.add(key(hit))
  return hit ?? null
}

/** The rule-1 minimum of a list from its rows at the desktop width. */
export function ruleOneMin(repeat, max) {
  if (max === 1) return { min: 1, minSource: 'row-count' }
  if (!repeat) return null
  if (repeat.inSlider || repeat.inTabs) return { min: 1, minSource: 'slider-or-tab' }
  if (repeat.firstLine >= 1) return { min: repeat.firstLine, minSource: 'row-count' }
  return null
}

/**
 * The measured minimum from the counts whose layout looked right at every width: the smallest of them. Every
 * count from 1 to the maximum is measured, so a list right at 4 and 8 only has min 4, and `layoutOkContiguous`
 * says whether every count from the minimum to the maximum is right too.
 */
export function minOfCounts(okCounts, max) {
  const ok = [...new Set(okCounts ?? [])].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b)
  if (!ok.length) return { min: null, layoutOkContiguous: false }
  const min = ok[0]
  return { min, layoutOkContiguous: ok.length === max - min + 1 }
}
