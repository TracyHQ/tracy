/**
 * WHERE TWO PICTURES OF ONE WINDOW DIFFER, COUNTED FROM THEIR PIXELS (B1, 26/10/2026).
 *
 * WHY. The visual check (`visual-check.mjs`) hands one image model the window before and after a turn's
 * writes. That model reads a picture coarsely — DeepSeek, the model of most sessions, spends one token on
 * each 42 px square (`image-tokens.ts` of `llm-deepseek`) — so a menu link is one or two tokens of a few
 * hundred, and a change of its colour is easy to miss. Measured on dev 25/10/2026 (saigon-iron-boxing):
 * five turns asked a top-menu link in another colour, the picture after showed it, and the comparison
 * answered "still white" each time; the agent read the page again, found it right, and the turn's record
 * kept `not_shown`. Replayed on the same pictures, 10 of 21 judgements of a change that showed were
 * `not_shown`.
 *
 * WHAT. The pixels say for certain WHERE the window changed. This module finds those places — cells of
 * the window whose pixels moved by more than JPEG noise, joined when they are close — and cuts each small
 * place out of both pictures, enlarged, so the comparison sees a small change as large as a heading.
 *
 * 🔒 A FACT FOR THE COMPARISON, NEVER A VERDICT. Where the pixels changed says nothing about whether the
 * change asked is the one that shows there: the comparison still judges that. Pictures that cannot be
 * compared — not both JPEGs, or not the same size — measure nothing, and the check runs as before.
 */
import jpeg from 'jpeg-js'

/** The side of the square cells the window is compared in, px. */
export const CELL = 8

/**
 * A pixel counts as changed when one of its channels moved by more than this. Two drawings of an
 * unchanged page are the same JPEG byte for byte; JPEG noise around a real change stays well under it,
 * while text recoloured against its ground moves by far more (white → #2E86DE: 209 on red).
 */
export const PIXEL_DELTA = 48

/** A cell counts as changed when at least this many of its pixels did (one stray pixel is noise). */
export const CELL_PIXELS = 3

/** Changed cells this close (px) are one place: the letters of one word, the lines of one block. */
export const JOIN_GAP = 24

/** At most this many places are named to the comparison, and this many cut out and enlarged. */
export const PLACES_NAMED = 8
export const PLACES_ZOOMED = 3

/**
 * A place larger than this share of the window shows well enough in the whole picture, and a window
 * that changed over more than `MOSTLY_CHANGED` of its cells moved (a scroll, a layout shift): its
 * places are named but none is cut out.
 */
export const ZOOM_MAX_SHARE = 0.2
export const MOSTLY_CHANGED = 0.5

/** Room kept around a place when it is cut out, px, so the words beside it say what it is. */
export const ZOOM_PAD = 40

/** A cut-out place is enlarged until its longer side is about this long, by a whole factor of 1–4. */
export const ZOOM_EDGE = 640
export const ZOOM_MAX = 4

/** JPEG quality of a cut-out place. */
export const ZOOM_QUALITY = 90

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Place - a rectangle of the window, px.
 * @typedef {{ place: Place, scale: number, before: Buffer, after: Buffer }} Zoom
 * @typedef {{ width: number, height: number, share: number, places: Place[], more: number, zooms: Zoom[] }} Changes
 *   `share`: the part of the window's cells that changed (0 = the same in every cell); `places` in reading
 *   order, at most `PLACES_NAMED`, and `more` how many others there were.
 */

/** @param {Buffer} bytes */
const decode = (bytes) => jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true })

/**
 * Where the window changed between two pictures of it, and the small places cut out of both, enlarged.
 * @param {Buffer} before - the picture drawn before the turn (JPEG).
 * @param {Buffer} after - the same window drawn now (JPEG).
 * @returns {Changes | null} null when the two cannot be compared.
 */
export function pictureChanges(before, after) {
  let a
  let b
  try {
    a = decode(before)
    b = decode(after)
  } catch {
    // Not a JPEG this decoder reads: nothing measured, and the check goes on without it.
    return null
  }
  if (a.width !== b.width || a.height !== b.height || a.width === 0 || a.height === 0) return null
  const { width, height } = a
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const counts = new Uint16Array(cols * rows)
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / CELL) * cols
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const moved = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2])
      )
      if (moved > PIXEL_DELTA) counts[row + Math.floor(x / CELL)] += 1
    }
  }
  const changed = counts.map((n) => (n >= CELL_PIXELS ? 1 : 0))
  let total = 0
  for (const c of changed) total += c
  const share = total / (cols * rows)
  if (total === 0) return { width, height, share: 0, places: [], more: 0, zooms: [] }

  // Join changed cells within JOIN_GAP of each other into places (a flood over the cell grid).
  const reach = Math.ceil(JOIN_GAP / CELL)
  const seen = new Uint8Array(cols * rows)
  /** @type {Place[]} */
  const found = []
  for (let start = 0; start < changed.length; start += 1) {
    if (changed[start] === 0 || seen[start] === 1) continue
    seen[start] = 1
    const stack = [start]
    let [left, top, right, bottom] = [cols, rows, -1, -1]
    while (stack.length > 0) {
      const cell = /** @type {number} */ (stack.pop())
      const cx = cell % cols
      const cy = Math.floor(cell / cols)
      left = Math.min(left, cx)
      right = Math.max(right, cx)
      top = Math.min(top, cy)
      bottom = Math.max(bottom, cy)
      for (let ny = Math.max(0, cy - reach); ny <= Math.min(rows - 1, cy + reach); ny += 1) {
        for (let nx = Math.max(0, cx - reach); nx <= Math.min(cols - 1, cx + reach); nx += 1) {
          const next = ny * cols + nx
          if (changed[next] === 1 && seen[next] === 0) {
            seen[next] = 1
            stack.push(next)
          }
        }
      }
    }
    const x = left * CELL
    const y = top * CELL
    found.push({
      x,
      y,
      w: Math.min(width, (right + 1) * CELL) - x,
      h: Math.min(height, (bottom + 1) * CELL) - y
    })
  }
  found.sort((p, q) => p.y - q.y || p.x - q.x)
  const places = found.slice(0, PLACES_NAMED)
  const small =
    share > MOSTLY_CHANGED ? [] : places.filter((p) => p.w * p.h <= ZOOM_MAX_SHARE * width * height)
  const zooms = small.slice(0, PLACES_ZOOMED).map((place) => zoom(a, b, place))
  return { width, height, share, places, more: found.length - places.length, zooms }
}

/**
 * One place cut out of both pictures with `ZOOM_PAD` around it, enlarged by the same whole factor
 * (nearest pixel, so letters stay sharp and colours stay the page's own).
 * @param {{ width: number, height: number, data: Uint8Array }} a
 * @param {{ width: number, height: number, data: Uint8Array }} b
 * @param {Place} place
 * @returns {Zoom}
 */
function zoom(a, b, place) {
  const x0 = Math.max(0, place.x - ZOOM_PAD)
  const y0 = Math.max(0, place.y - ZOOM_PAD)
  const x1 = Math.min(a.width, place.x + place.w + ZOOM_PAD)
  const y1 = Math.min(a.height, place.y + place.h + ZOOM_PAD)
  const w = x1 - x0
  const h = y1 - y0
  const scale = Math.max(1, Math.min(ZOOM_MAX, Math.round(ZOOM_EDGE / Math.max(w, h))))
  /** @param {{ width: number, data: Uint8Array }} image */
  const cut = (image) => {
    const out = Buffer.alloc(w * scale * h * scale * 4)
    for (let y = 0; y < h * scale; y += 1) {
      const from = ((y0 + Math.floor(y / scale)) * image.width + x0) * 4
      for (let x = 0; x < w * scale; x += 1) {
        const i = from + Math.floor(x / scale) * 4
        const o = (y * w * scale + x) * 4
        out[o] = image.data[i]
        out[o + 1] = image.data[i + 1]
        out[o + 2] = image.data[i + 2]
        out[o + 3] = 255
      }
    }
    return Buffer.from(jpeg.encode({ width: w * scale, height: h * scale, data: out }, ZOOM_QUALITY).data)
  }
  return { place, scale, before: cut(a), after: cut(b) }
}
