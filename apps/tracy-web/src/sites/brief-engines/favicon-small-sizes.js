/**
 * The small sizes of a punched icon (16, 32 and 48 px) of a mark that draws an outline around itself: a crest, a badge
 * (spec TracyHQ/tracy#189, COO 29/10/2026). Shrinking the whole drawing leaves fragments that read as dirt and loses the
 * main symbol, so a small size is redrawn from parts instead:
 *
 *   symbolsOf    the parts of the drawing inside the outline: its ink with the outline band left out, nearby pieces
 *                grouped into one part (the dots of a handle belong to the racket they draw)
 *   mainSymbol   the part that carries the mark: a part floating free of the outline before one that leans on it (a
 *                landscape at the bottom of a crest), then the largest by ink, weighted towards the centre
 *   smallLabels  the icon of one size: the silhouette on its ground, the outline at least one pixel of that size wide, and
 *                the main symbol alone, closed and thickened so every stroke is at least `STROKE` px there
 *
 * 🔒 A DETAIL IS KEPT WHOLE OR DROPPED WHOLE: every part but the main symbol leaves completely, never a fragment of it. At
 * any size a main symbol that would lose its shape (a hole it draws closing under two pixels, or under half the icon across at
 * 16 px) leaves too, and the icon is the clean silhouette with its outline.
 * No template, trade or business is named.
 */
import { MASTER } from './favicon-silhouette.js'

const N = MASTER
/** Pieces of ink this close (master px) belong to one part. */
const GROUP = 6
/** The thinnest stroke a size may show, in its own pixels. */
const STROKE = Object.freeze({ 16: 1, 32: 1.5, 48: 1.5 })
/** At 16 px the main symbol stays only when its narrower side spans at least this many pixels. */
const KEEP_AT_16 = 8

/**
 * A chamfer distance (3-4, in tenths of a pixel divided back) from every cell to the nearest `on` cell.
 * @param {Uint8Array} on @returns {Float32Array}
 */
function distanceTo(on) {
  const d = new Float32Array(N * N)
  for (let i = 0; i < N * N; i += 1) d[i] = on[i] ? 0 : 1e9
  const pass = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ w) => {
    if (d[j] + w < d[i]) d[i] = d[j] + w
  }
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x
      if (x > 0) pass(i, i - 1, 3)
      if (y > 0) {
        pass(i, i - N, 3)
        if (x > 0) pass(i, i - N - 1, 4)
        if (x < N - 1) pass(i, i - N + 1, 4)
      }
    }
  for (let y = N - 1; y >= 0; y -= 1)
    for (let x = N - 1; x >= 0; x -= 1) {
      const i = y * N + x
      if (x < N - 1) pass(i, i + 1, 3)
      if (y < N - 1) {
        pass(i, i + N, 3)
        if (x < N - 1) pass(i, i + N + 1, 4)
        if (x > 0) pass(i, i + N - 1, 4)
      }
    }
  for (let i = 0; i < N * N; i += 1) d[i] /= 3
  return d
}

/** The mask grown by `r` px (r > 0) or shrunk by `-r` px. */
function grown(/** @type {Uint8Array} */ mask, /** @type {number} */ r) {
  const out = new Uint8Array(N * N)
  if (r >= 0) {
    const d = distanceTo(mask)
    for (let i = 0; i < N * N; i += 1) out[i] = d[i] <= r ? 1 : 0
  } else {
    const off = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i += 1) off[i] = mask[i] ? 0 : 1
    const d = distanceTo(off)
    for (let i = 0; i < N * N; i += 1) out[i] = d[i] > -r ? 1 : 0
  }
  return out
}

/** The 4-connected regions of `on` cells, as arrays of indexes. */
function regionsOf(/** @type {Uint8Array} */ on) {
  const seen = new Uint8Array(N * N)
  const out = []
  for (let i = 0; i < N * N; i += 1) {
    if (!on[i] || seen[i]) continue
    const stack = [i]
    seen[i] = 1
    const cells = []
    while (stack.length) {
      const c = /** @type {number} */ (stack.pop())
      cells.push(c)
      const x = c % N
      for (const n of [c - N, c + N, x > 0 ? c - 1 : -1, x < N - 1 ? c + 1 : -1])
        if (n >= 0 && n < N * N && on[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
    }
    out.push(cells)
  }
  return out
}

/**
 * @typedef {{cells: number[], ink: number, box: [number, number, number, number], centre: [number, number],
 *   touchesRim: boolean, label: number}} Part
 */

/**
 * The outline band's width (master px) and the parts of the drawing inside it.
 * @param {Uint8Array} labels @param {Uint8Array} alpha @param {number} outline - the outline's label
 * @returns {{rim: number, parts: Part[]}}
 */
export function symbolsOf(labels, alpha, outline) {
  const outside = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i += 1) outside[i] = alpha[i] < 128 ? 1 : 0
  const depth = distanceTo(outside)
  // The band: as deep as the outline's colour keeps covering the whole edge (its share falls below a fifth past it).
  const atDepth = new Map()
  for (let i = 0; i < N * N; i += 1)
    if (!outside[i] && labels[i] === outline) {
      const k = Math.floor(depth[i])
      atDepth.set(k, (atDepth.get(k) ?? 0) + 1)
    }
  const plateau = Math.max(1, ...atDepth.values())
  let rim = 1
  while (rim < N / 4 && (atDepth.get(rim) ?? 0) >= plateau * 0.2) rim += 1
  const inner = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i += 1) inner[i] = !outside[i] && labels[i] !== 0 && depth[i] > rim + 1 ? 1 : 0
  const near = grown(inner, GROUP)
  const parts = []
  for (const region of regionsOf(near)) {
    const cells = region.filter((c) => inner[c])
    if (!cells.length) continue
    let [minX, minY, maxX, maxY, sx, sy, touchesRim] = [N, N, 0, 0, 0, 0, false]
    const tally = new Map()
    for (const c of cells) {
      const x = c % N
      const y = (c / N) | 0
      ;[minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)]
      sx += x
      sy += y
      if (depth[c] <= rim + 3) touchesRim = true
      tally.set(labels[c], (tally.get(labels[c]) ?? 0) + 1)
    }
    const label = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
    parts.push({
      cells,
      ink: cells.length,
      box: [minX, minY, maxX, maxY],
      centre: [sx / cells.length, sy / cells.length],
      touchesRim,
      label
    })
  }
  return { rim, parts }
}

/** A shape loses itself when a hole it draws (a racket's head, a ring) closes. Its holes (enclosed gaps of the closed
 * symbol at least `SHAPE_HOLE` of the largest one; the small gaps where strokes cross do not count) must stay at least
 * `HOLE` px of the size across once thickened, else the symbol is dropped whole at that size. */
const HOLE = 2
const SHAPE_HOLE = 0.5
function holesOpen(
  /** @type {Uint8Array} */ closed,
  /** @type {[number, number, number, number]} */ box,
  /** @type {number} */ grow,
  /** @type {number} */ scale
) {
  const [x0, y0, x1, y1] = box
  const free = new Uint8Array(N * N)
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) free[y * N + x] = closed[y * N + x] ? 0 : 1
  const holes = []
  for (const cells of regionsOf(free)) {
    let [minX, minY, maxX, maxY] = [N, N, 0, 0]
    for (const c of cells) {
      const x = c % N
      const y = (c / N) | 0
      ;[minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)]
    }
    if (minX > x0 && minY > y0 && maxX < x1 && maxY < y1)
      holes.push({ area: cells.length, across: Math.min(maxX - minX + 1, maxY - minY + 1) })
  }
  const largest = Math.max(0, ...holes.map((h) => h.area))
  return holes.every((h) => h.area < largest * SHAPE_HOLE || h.across - 2 * grow >= HOLE * scale)
}

/** The part that carries the mark, or null. @param {Part[]} parts @returns {Part | null} */
export function mainSymbol(parts) {
  const score = (/** @type {Part} */ p) =>
    p.ink * (1 - (0.5 * Math.hypot(p.centre[0] - N / 2, p.centre[1] - N / 2)) / (N / 2))
  const free = parts.filter((p) => !p.touchesRim)
  const pool = free.length ? free : parts
  return pool.sort((a, b) => score(b) - score(a))[0] ?? null
}

/**
 * The labels of one small size at master resolution: ground, the outline band, and the main symbol alone.
 * @param {Uint8Array} alpha @param {number} outline @param {{rim: number, parts: Part[]}} drawing @param {number} size
 * @returns {{labels: Uint8Array, kept: boolean}}
 */
export function smallLabels(alpha, outline, drawing, size) {
  const scale = N / size
  const labels = new Uint8Array(N * N)
  const outside = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i += 1) outside[i] = alpha[i] < 128 ? 1 : 0
  const depth = distanceTo(outside)
  const rim = Math.max(drawing.rim, scale)
  for (let i = 0; i < N * N; i += 1) if (alpha[i] > 0 && depth[i] <= rim) labels[i] = outline
  const main = mainSymbol(drawing.parts)
  if (!main) return { labels, kept: false }
  const [x0, y0, x1, y1] = main.box
  if (size <= 16 && Math.min(x1 - x0, y1 - y0) / scale < KEEP_AT_16) return { labels, kept: false }
  // Closed (its pieces joined into strokes), then thickened so its thinnest stroke is STROKE px of this size.
  const mask = new Uint8Array(N * N)
  for (const c of main.cells) mask[c] = 1
  const closed = grown(grown(mask, GROUP), -GROUP)
  const grow = Math.max(0, ((STROKE[size] ?? 1.5) * scale) / 2 - 3)
  if (!holesOpen(closed, main.box, grow, scale)) return { labels, kept: false }
  const thick = grown(closed, grow)
  for (let i = 0; i < N * N; i += 1) if (thick[i] && depth[i] > rim) labels[i] = main.label
  return { labels, kept: true }
}
