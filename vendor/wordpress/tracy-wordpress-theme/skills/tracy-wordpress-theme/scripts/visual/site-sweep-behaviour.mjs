// The behaviour checks of site-sweep.mjs, port against source, read-only: what the five plain-property checks cannot see because it
// is not a property of a box but a thing a visitor does or looks at.
//
//   fixed-widgets      fixed/sticky widgets after scrolling (back-to-top, floating buttons, cookie bars): present on both sides, box, place, and a
//                      mark a visitor can SEE (the ink of a photograph of the widget against what is painted behind it)
//   icons              icon controls of the top band (a topbar before the header, the header) and footer, paired by link host / accessible name /
//                      network / purpose / place / order: box, mark, place in the row, pixels, and the drawn glyph (shapeOf / shapeLikeness)
//   forms              every visible form paired by purpose: fields, types, required, focus on load, placeholder, label, box, links of the region
//                      on one side only, the focus look of a text field
//   text               text blocks (a server-side cut against a CSS clamp, a different ending), the case, size, weight and letter-spacing of
//                      nav and button labels, and the words of short labels (logo, nav, button, pagination, footer line) paired by place
//   first-interaction  the theme switch on its FIRST click in every state of cookie and system scheme, the first touch tap on a parent menu
//                      item at 1024/1180, the mobile drawer (opens, same rows, back row, close, what the page does when it is open)
//
// Controls are found by role, name and shape; the dossier may name one in review.config.json `sweep.behaviour`:
//   { "themeToggle": sel|{site,source}, "drawerToggle": …, "drawerClose": …, "subToggle": …, "parentItems": … }
// A control that cannot be found is NOT-MEASURED with the reason, never clean. The judgements are in site-sweep-behaviour-judge.mjs.
import { PNG } from 'pngjs'
import { withPage, mapLimit, withTimeout } from '../lib/browser.mjs'
import { readSide } from './site-sweep-source-cache.mjs'
import { platformFontsOfMarked } from '../lib/platform-fonts.mjs'
import { widgetsInPage, iconsInPage, formsInPage, focusProbe, textInPage } from './site-sweep-behaviour-probe.mjs'
import { BEHAVIOUR_ORDER, BEHAVIOUR_TITLES, BEHAVIOUR_JUDGES } from './site-sweep-behaviour-judge.mjs'
import { DARK_DERIVED_REASON, darkPassGap, groupDefects } from './site-sweep-judge.mjs'

const SIDE_TIMEOUT_MS = 150000
export const THEME_WIDTHS = [390, 768, 1440]
export const TOUCH_WIDTHS = [1024, 1180]
export const DRAWER_WIDTHS = [390, 768]
const HEIGHT = 900

/** Shape a none-page touch discovery for the target judge, retaining unread discoveries as debt. */
export function targetTouchRows({ route, width, state = 'touch', port }) {
  const parents = Array.isArray(port?.parents) ? port.parents : null
  const found = Math.max(Number.isInteger(port?.found) ? port.found : 0, parents?.length ?? 0)
  const row = (reading, readCount) => ({ route, referenceKind: 'none', width, state, kind: 'touch', source: null, port: reading, found, readCount, what: 'parent menu items' })
  if (port?.missing) return [row(port, found)]
  if (!parents) return [row({ missing: 'parent menu discovery did not return a list' }, found)]
  if (!found) return [row({ parents: [] }, 0)]
  const rows = parents.map((parent) => ({ ...row({ parents: [parent] }, found), what: `"${parent.text}"` }))
  for (let i = parents.length; i < found; i++) {
    rows.push({ ...row({ parents: [{ text: `unread parent ${i + 1}`, taps: [] }] }, found), what: `unread parent ${i + 1}` })
  }
  return rows
}

// ---- photographs ------------------------------------------------------------------------------------------------------

/**
 * What a small photograph holds: the most common colour (the paint behind the mark), the share of pixels that stand out from it by
 * more than 48 in some channel (the ink) and the box of that ink. `ratio` < 0.4% is a box with nothing to see in it.
 */
export function inkOf(png) {
  const img = typeof png === 'object' && 'data' in png ? png : PNG.sync.read(png)
  const hist = new Map()
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]
    if (a < 8) continue
    const k = `${img.data[i] >> 4},${img.data[i + 1] >> 4},${img.data[i + 2] >> 4}`
    const e = hist.get(k)
    if (e) {
      e.n++
      e.r += img.data[i]
      e.g += img.data[i + 1]
      e.b += img.data[i + 2]
    } else hist.set(k, { n: 1, r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] })
  }
  let best = null
  for (const e of hist.values()) if (!best || e.n > best.n) best = e
  if (!best) return { ratio: 0, bg: [0, 0, 0], box: null, w: img.width, h: img.height }
  const bg = [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)]
  let n = 0
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (Math.max(Math.abs(img.data[i] - bg[0]), Math.abs(img.data[i + 1] - bg[1]), Math.abs(img.data[i + 2] - bg[2])) > 48) {
        n++
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + 1)
        y1 = Math.max(y1, y + 1)
      }
    }
  return { ratio: n / (img.width * img.height), bg, box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, w: img.width, h: img.height }
}

export const SHAPE_MAX = 64
const EDGE_STEP = 48
// a cell of a shape is a digit: how much of it the glyph covers, 0 (the ground) to 9 (all painted)
const COVER = 9
const SOLID = 4

/**
 * The drawn SHAPE of a small photograph, apart from its colours and from the box that holds it: how much each pixel (up to 64 across)
 * differs from the colour most of the box holds (the tile's, or the page's), as a coverage 0–9 relative to the strongest difference in
 * the photograph. A thin stroke drawn at 10 px and at 12 px is the same stroke in coverage, which a black-and-white mask is not.
 * `tile`: the control paints a tile of its own (read from the page's styles); what the page draws around it and the tile's antialiased
 * rim are then left out, so that the glyph on the tile is what is read. A glyph alone in its box is read whole, whatever it spans.
 * `rim`: pixels of the box's edge that are the control's own border (a divider between controls), never part of the glyph.
 */
export function shapeOf(png, { tile = false, rim = 0 } = {}) {
  const img = typeof png === 'object' && 'data' in png ? png : PNG.sync.read(png)
  const W = img.width
  const H = img.height
  const w = Math.min(W, SHAPE_MAX)
  const h = Math.min(H, SHAPE_MAX)
  const rgb = (x, y) => (y * W + x) * 4
  const bg = inkOf(img).bg
  const diff = (i) => Math.max(Math.abs(img.data[i] - bg[0]), Math.abs(img.data[i + 1] - bg[1]), Math.abs(img.data[i + 2] - bg[2]))
  // what the page draws in the corners of the box, outside a rounded tile or a rounded band: the colour of a corner, reached from it without
  // crossing anything else. On a tile (the page says the control paints one) every such region goes, however large and joined to the others
  // by the margin; elsewhere only a small patch that holds one corner and no other (the bend of a rounded header). A glyph whose strokes
  // end in the corners of its box is one patch holding several, and stays.
  const outside = new Uint8Array(W * H)
  if (W > 4 && H > 4) {
    const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
    for (const [sx, sy] of corners) {
      if (outside[sy * W + sx]) continue
      const c = rgb(sx, sy)
      if (img.data[c + 3] < 8) continue
      const colour = [img.data[c], img.data[c + 1], img.data[c + 2]]
      if (Math.max(...colour.map((v, k) => Math.abs(v - bg[k]))) <= EDGE_STEP) continue
      const seenHere = new Uint8Array(W * H)
      const region = []
      const todo = [[sx, sy]]
      seenHere[sy * W + sx] = 1
      while (todo.length) {
        const [x, y] = todo.pop()
        region.push(y * W + x)
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seenHere[ny * W + nx]) continue
          const i = rgb(nx, ny)
          // never across the colour most of the box holds (the tile): a corner that is a dark page next to a dark-blue tile is not the tile
          if (diff(i) <= EDGE_STEP) continue
          if (Math.max(Math.abs(img.data[i] - colour[0]), Math.abs(img.data[i + 1] - colour[1]), Math.abs(img.data[i + 2] - colour[2])) > EDGE_STEP * 2) continue
          seenHere[ny * W + nx] = 1
          todo.push([nx, ny])
        }
      }
      const held = corners.filter(([x, y]) => seenHere[y * W + x]).length
      if (!tile && (held > 1 || region.length > 0.12 * W * H)) continue
      for (const k of region) outside[k] = 1
    }
    // two pixels more: the blended pixels along the curve that bounds what was taken away
    for (let pass = 0; pass < 2; pass++) {
      const grown = new Uint8Array(outside)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (outside[y * W + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) grown[(y + dy) * W + x + dx] = 1
      outside.set(grown)
    }
  }
  const cover = new Float32Array(W * H)
  let strongest = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = rgb(x, y)
      // the outermost pixel is where the photograph was cut (a box on a half pixel takes in a sliver of the page behind it); on a tile
      // the outermost two are the tile's own antialiased rim (the points where a circle touches the box)
      const edge = Math.max(tile ? 2 : 1, rim)
      if (outside[y * W + x] || img.data[i + 3] < 8 || x < edge || y < edge || x >= W - edge || y >= H - edge) continue
      cover[y * W + x] = diff(i)
      strongest = Math.max(strongest, cover[y * W + x])
    }
  // a difference under 48 is no mark (the ink threshold of inkOf); the rest is read against the strongest
  const cell = new Float32Array(w * h)
  const count = new Float32Array(w * h)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = Math.floor((y * h) / H) * w + Math.floor((x * w) / W)
      cell[k] += strongest > EDGE_STEP ? Math.min(1, cover[y * W + x] / strongest) : 0
      count[k]++
    }
  const rows = []
  let cells = 0
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const v = Math.round((cell[y * w + x] / count[y * w + x]) * COVER)
      row += v
      if (v >= SOLID) cells++
    }
    rows.push(row)
  }
  return { w, h, rows, cells }
}

/** The box of the painted cells (coverage over a third) of a shape, or null when none are painted. */
export function shapeBox(s) {
  let x0 = s.w
  let y0 = s.h
  let x1 = -1
  let y1 = -1
  s.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++)
      if (Number(row[x]) >= SOLID) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  })
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** A shape as a picture for a report: `#` painted, `+` partly, `.` ground, cut to its painted box. */
export function shapePicture(s) {
  const b = shapeBox(s)
  if (!b) return []
  return s.rows.slice(b.y, b.y + b.h).map((row) => [...row.slice(b.x, b.x + b.w)].map((c) => (Number(c) >= 6 ? '#' : Number(c) >= 2 ? '+' : '.')).join(''))
}

/**
 * How alike two shapes are: the shared coverage over the larger coverage (a fuzzy intersection over union), each shape read inside the
 * box of its own painted cells — the size of a mark is the size checks' business — and resampled by area onto the larger of the two
 * boxes, at the best of the shifts of one cell either way. 1 is the same drawing; null when either has nothing painted.
 */
export function shapeLikeness(a, b) {
  const ba = shapeBox(a)
  const bb = shapeBox(b)
  if (!ba || !bb) return null
  const w = Math.max(ba.w, bb.w)
  const h = Math.max(ba.h, bb.h)
  // the shape's painted box resampled onto w × h cells, each cell the mean coverage of the source area it covers; one cell of margin all round
  const frame = (s, box) => {
    const out = new Float32Array((w + 2) * (h + 2))
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx0 = box.x + (x * box.w) / w
        const sx1 = box.x + ((x + 1) * box.w) / w
        const sy0 = box.y + (y * box.h) / h
        const sy1 = box.y + ((y + 1) * box.h) / h
        let sum = 0
        let area = 0
        for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++)
          for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
            const ov = (Math.min(xx + 1, sx1) - Math.max(xx, sx0)) * (Math.min(yy + 1, sy1) - Math.max(yy, sy0))
            if (ov <= 0) continue
            sum += ov * (Number(s.rows[yy]?.[xx] ?? 0) / COVER)
            area += ov
          }
        out[(y + 1) * (w + 2) + x + 1] = area ? sum / area : 0
      }
    return out
  }
  // a stroke of one pixel drawn at 10 px and at 12 px lands a pixel apart: each is blurred by one cell before they are laid on each other
  const blur = (f) => {
    const W2 = w + 2
    const g = new Float32Array(f.length)
    for (let y = 0; y < h + 2; y++)
      for (let x = 0; x < W2; x++) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy
            const xx = x + dx
            if (yy < 0 || xx < 0 || yy >= h + 2 || xx >= W2) continue
            const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1
            sum += f[yy * W2 + xx] * k
            n += k
          }
        g[y * W2 + x] = sum / n
      }
    return g
  }
  const A = blur(frame(a, ba))
  const B = blur(frame(b, bb))
  let best = 0
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      let both = 0
      let either = 0
      for (let y = 1; y <= h; y++)
        for (let x = 1; x <= w; x++) {
          const p = A[y * (w + 2) + x]
          const yy = y - dy
          const xx = x - dx
          const q = yy >= 0 && xx >= 0 && yy < h + 2 && xx < w + 2 ? B[yy * (w + 2) + xx] : 0
          both += Math.min(p, q)
          either += Math.max(p, q)
        }
      if (either) best = Math.max(best, both / either)
    }
  return best
}

const clipOf = (page, r, pad = 0) => {
  const vp = page.viewportSize()
  const x = Math.max(0, Math.floor(r.x - pad))
  const y = Math.max(0, Math.floor(r.y - pad))
  const w = Math.min(vp.width - x, Math.ceil(r.w + pad * 2))
  const h = Math.min(vp.height - y, Math.ceil(r.h + pad * 2))
  return w >= 2 && h >= 2 ? { x, y, width: w, height: h } : null
}
// `shape`: also read the drawn glyph (see shapeOf); `shape: null` on the answer when that could not be read
const shoot = async (page, rect, pad = 0, { shape } = {}) => {
  const clip = clipOf(page, rect, pad)
  if (!clip) return null
  try {
    const png = PNG.sync.read(await page.screenshot({ clip, animations: 'disabled' }))
    const ink = inkOf(png)
    if (!shape) return ink
    try {
      return { ...ink, shape: shapeOf(png, shape) }
    } catch {
      return { ...ink, shape: null }
    }
  } catch {
    return null
  }
}

/**
 * The widget's OWN paint: the widget is photographed with and without itself (hidden), and what differs is its paint. A tile (a widget that
 * paints most of its box) reads as `inkOf` reads it — the tile colour and the mark on it. A widget with no tile of its own (a bare glyph over
 * the page) has `transparent: true`: its mark is what it draws, and the photograph beneath it is no part of it.
 */
export async function shootWidget(page, w) {
  const clip = clipOf(page, w.rect, 0)
  if (!clip) return null
  try {
    const on = PNG.sync.read(await page.screenshot({ clip, animations: 'disabled' }))
    await page.evaluate((i) => document.querySelector(`[data-sweep-widget="${i}"]`)?.style.setProperty('visibility', 'hidden', 'important'), w.index)
    const off = PNG.sync.read(await page.screenshot({ clip, animations: 'disabled' }))
    await page.evaluate((i) => document.querySelector(`[data-sweep-widget="${i}"]`)?.style.removeProperty('visibility'), w.index)
    return ownPaint(on, off)
  } catch {
    return null
  }
}

/**
 * A translucent tile (a background like rgba(0,0,0,.5)) shows the page through it, so its photograph is `on = a·off + b` per channel,
 * and a backdrop that is not one colour reads as ink spanning the tile (ja-fresco D-30: the same back-to-top read 50×29 on one side,
 * 32×26 on the other, from what stood behind it). Fitted twice (the second time without the pixels the first fit leaves out), the mark
 * is what the fit does not explain by more than 48 in a channel. An opaque tile (`a` near 0) or no tile at all (`a` near 1, a bare
 * glyph over the page) is read as before: {}. A tile dark over a dark page differs from it by less than the 12 that makes it "own paint", so
 * the bare-glyph branch asks too.
 */
export function throughTile(on, off) {
  const fit = (keep) => {
    const out = []
    for (let c = 0; c < 3; c++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
      for (let i = 0; i < on.data.length; i += 4) {
        if (!keep(i)) continue
        const x = off.data[i + c]
        const y = on.data[i + c]
        n++
        sx += x
        sy += y
        sxx += x * x
        sxy += x * y
      }
      const d = n * sxx - sx * sx
      const a = n && d > 1e-6 ? (n * sxy - sx * sy) / d : 0
      out.push([a, n ? (sy - a * sx) / n : 0])
    }
    return out
  }
  const miss = (f, i) => Math.max(...f.map(([a, b], c) => Math.abs(on.data[i + c] - (a * off.data[i + c] + b))))
  const first = fit(() => true)
  const f = fit((i) => miss(first, i) <= 24)
  const a = f.reduce((s, [k]) => s + k, 0) / 3
  if (a < 0.1 || a > 0.9) return {}
  let n = 0
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < on.height; y++)
    for (let x = 0; x < on.width; x++)
      if (miss(f, (y * on.width + x) * 4) > 48) {
        n++
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + 1)
        y1 = Math.max(y1, y + 1)
      }
  return { ratio: n / (on.width * on.height), box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
}

/** What of `on` is not in `off` (a pixel that differs by more than 12 in a channel), read as `inkOf` reads a photograph; `transparent` when it covers under half the box. */
export function ownPaint(on, off) {
  if (on.width !== off.width || on.height !== off.height) return inkOf(on)
  const own = new PNG({ width: on.width, height: on.height })
  let n = 0
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < on.height; y++)
    for (let x = 0; x < on.width; x++) {
      const i = (y * on.width + x) * 4
      if (Math.max(Math.abs(on.data[i] - off.data[i]), Math.abs(on.data[i + 1] - off.data[i + 1]), Math.abs(on.data[i + 2] - off.data[i + 2])) > 12) {
        own.data[i] = on.data[i]
        own.data[i + 1] = on.data[i + 1]
        own.data[i + 2] = on.data[i + 2]
        own.data[i + 3] = 255
        n++
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + 1)
        y1 = Math.max(y1, y + 1)
      }
    }
  const area = on.width * on.height
  // nothing of its own: the widget draws nothing (or is fully transparent): no mark
  if (!n) return { ratio: 0, bg: inkOf(off).bg, box: null, w: on.width, h: on.height, transparent: true }
  if (n / area >= 0.5) return { ...inkOf(own), ...throughTile(on, off), transparent: false }
  return { ratio: n / area, bg: inkOf(off).bg, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, w: on.width, h: on.height, ...throughTile(on, off), transparent: true }
}

/** The coarse picture of the left `edge` pixels of a screenshot: average colour of cells 8 px wide and 8 px high (what the strip beside an open drawer looks like). */
export function gridOf(buf, edge) {
  const img = PNG.sync.read(buf)
  const e = Math.min(edge, img.width)
  const cells = []
  for (let y0 = 0; y0 < img.height; y0 += 8)
    for (let x0 = 0; x0 < e; x0 += 8) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = y0; y < Math.min(img.height, y0 + 8); y++)
        for (let x = x0; x < Math.min(e, x0 + 8); x++) {
          const i = (y * img.width + x) * 4
          r += img.data[i]
          g += img.data[i + 1]
          b += img.data[i + 2]
          n++
        }
      cells.push(n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0])
    }
  return cells
}

// ---- the static parts: one load per route, side, width and scheme ----------------------------------------------------

/** Read the parts asked for on a loaded page. Fixed widgets are last: reading them scrolls the page. */
export async function readStatic(page, parts) {
  // a source route that answers the web server's own page (no stylesheet) has no page to compare the port's with (load() marks it)
  const out = { bare: await page.evaluate(() => window.__sweepBare === true) }
  if (parts.forms) {
    out.forms = await page.evaluate(formsInPage)
    if (parts.targetOnly) out.formsFocusRead = Math.min(out.forms.length, 8)
    for (let i = 0; i < out.forms.length && i < 8; i++) out.forms[i].focus = await page.evaluate(focusProbe, i).catch(() => null)
  }
  if (parts.text) {
    out.text = await page.evaluate(textInPage)
    // the body face and the web fonts that loaded: wrapped text is comparable only when both sides draw in the same kind of face
    out.fonts = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim(), loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))], faces: [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), status: f.status, unicodeRange: f.unicodeRange, style: f.style, weight: f.weight, stretch: f.stretch })) }))
    // which fonts painted the words that are cut: only a clamped block can differ in its visible ending, so only those are asked
    const painted = await platformFontsOfMarked(page, 'data-sweep-block', out.text.blocks.filter((b) => b.clipped).map((b) => b.n)).catch(() => ({}))
    for (const b of out.text.blocks) if (painted[b.n]) b.platform = painted[b.n]
  }
  if (parts.icons) {
    const icons = []
    for (const land of ['header', 'footer']) {
      const seen = new Set()
      let all = await page.evaluate(iconsInPage)
      icons.push(...all.filter((x) => x.land === land && x.unmeasured))
      if (parts.targetOnly && all.filter((x) => x.land === land && !x.unmeasured).length > 24) icons.push({ land, unmeasured: `${land} has more than 24 icons; remaining icons were not read`, cap: true })
      const mine = all.filter((x) => x.land === land && !x.unmeasured).slice(0, 24)
      for (const ic of mine) {
        // bring the control to the middle of the window and read where it stands NOW (a page that settles after load moves it), whether it answers at its centre, then photograph it
        await page.evaluate((idx) => document.querySelector(`[data-sweep-icon="${idx}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }), ic.index)
        // a section that reveals itself on scrolling into view (a fade, a slide) is let finish before it is read: the animations that
        // run on the control or around it (a reveal script that starts one after a delay is waited for too), at most 2 s
        await page.waitForTimeout(500)
        await page
          .evaluate(
            (idx) => {
              const e = document.querySelector(`[data-sweep-icon="${idx}"]`)
              if (!e) return null
              const running = document.getAnimations().filter((a) => {
                const t = a.effect?.target
                return t && (t === e || t.contains(e) || e.contains(t)) && a.effect.getComputedTiming().iterations !== Infinity
              })
              return Promise.race([Promise.all(running.map((a) => a.finished.catch(() => null))), new Promise((r) => setTimeout(r, 2000))])
            },
            ic.index
          )
          .catch(() => null)
        const now = await page.evaluate((idx) => {
          const e = document.querySelector(`[data-sweep-icon="${idx}"]`)
          if (!e) return null
          let r = e.getBoundingClientRect()
          // an inline link draws in its painted child: its box is the child's
          if (getComputedStyle(e).display === 'inline') {
            const kr = e.querySelector('svg, img, i, span, [class*=icon], [class*=fa-]')?.getBoundingClientRect()
            if (kr && kr.width > 0 && kr.height > 0) r = kr
          }
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          const t = document.elementFromPoint(cx, cy)
          const c = t?.closest('a, button, [role=button], input')
          return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, reachable: Boolean(c) && (c === e || e.contains(c) || c.contains(e)) }
        }, ic.index)
        // a control the page took away while it was being scrolled to is a reading with no photograph, never a dropped one
        if (!now) {
          icons.push({ ...ic, reachable: true, ink: null, gone: true })
          continue
        }
        const key = `${land}|${Math.round(ic.rect.x)}|${Math.round(ic.rect.y)}`
        if (seen.has(key)) continue
        seen.add(key)
        ic.reachable = now.reachable
        // a mark that fades or slides in when it scrolls into view is photographed again until two photographs agree (up to three): the
        // glyph of the last one is what the visitor ends up seeing
        const shapeOpt = { shape: { tile: ic.tile, rim: ic.rim ?? 0 } }
        ic.ink = await shoot(page, now.rect, 0, shapeOpt)
        for (const wait of [250, 600]) {
          await page.waitForTimeout(wait)
          const again = await shoot(page, now.rect, 0, shapeOpt)
          const settled = Boolean(again && ic.ink && Math.abs(again.ratio - ic.ink.ratio) < 0.02 && (!again.shape || !ic.ink.shape || (shapeLikeness(again.shape, ic.ink.shape) ?? 1) >= 0.95))
          ic.ink = again ?? ic.ink
          if (settled) break
        }
        icons.push(ic)
      }
      all = null
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    out.icons = icons
  }
  if (parts.widgets) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, Math.min(1500, h - HEIGHT)))
    await page.waitForTimeout(1000)
    const widgets = await page.evaluate(widgetsInPage)
    for (const w of widgets) w.ink = await shootWidget(page, w)
    out.widgets = widgets
    out.scrollable = h > HEIGHT + 200
  }
  return out
}

// ---- first interaction ------------------------------------------------------------------------------------------------

const SCHEME_JS = () => {
  const lum = (c) => {
    const m = /rgba?\(([^)]*)\)/.exec(c)
    if (!m) return null
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number)
    if (p.length > 3 && p[3] < 0.05) return null
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
  }
  for (const e of [document.body, document.documentElement, document.querySelector('main')]) {
    const l = e ? lum(getComputedStyle(e).backgroundColor) : null
    if (l != null) return l < 128 ? 'dark' : 'light'
  }
  return getComputedStyle(document.documentElement).colorScheme?.includes('dark') ? 'dark' : 'light'
}

/** Tag the best control for `kind` (theme | drawer | close | sub) and answer its centre, or why none was found. */
export const FIND_JS = (arg) => {
  const { kind, hint } = arg
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const vis = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight
  }
  const hay = (e) =>
    [e.getAttribute('aria-label'), e.getAttribute('title'), e.id, typeof e.className === 'string' ? e.className : '', norm(e.innerText).slice(0, 30), e.getAttribute('aria-controls'), e.getAttribute('data-bs-target'), e.getAttribute('data-target'), e.querySelector('svg title')?.textContent, e.querySelector('use')?.getAttribute('href'), e.querySelector('i')?.className]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  document.querySelectorAll('[data-sweep-found]').forEach((e) => e.removeAttribute('data-sweep-found'))
  let list
  if (hint) {
    list = [...document.querySelectorAll(hint)].filter(vis)
  } else {
    const all = [...document.querySelectorAll('button, a, [role=button], [role=switch], label, input[type=checkbox], summary, [class*=toggle], [class*=trigger], [class*=burger], [onclick]')].filter(vis)
    const re = {
      theme: /theme|dark|colou?r.?(scheme|mode)|night|appearance|contrast|moon|\bsun\b|light.?mode|dark.?mode|mode.?(switch|toggle)/,
      drawer: /off-?canvas|drawer|burger|hamburger|navbar-toggler|menu.?(toggle|button|trigger|open)|(toggle|trigger|open).?(menu|nav)|nav.?(toggle|trigger)|^menu\b|\bmenu$|sidebar.?toggle/,
      close: /close|dismiss|cross|\bx\b|×|✕|exit/,
      sub: /sub.?menu|submenu|caret|chevron|expand|arrow|dropdown.?toggle|show the|open the/
    }[kind]
    // the drawer's own opener and closer are no sub-level opener: tapping the opener of an open drawer taps what covers it (the close button)
    const bad = { theme: /menu|search|cart|login|nav-?toggle|offcanvas/, drawer: /theme|dark|search|cart|login|close|sub|back/, close: /search|theme/, sub: /theme|search|close|off-?canvas|burger|hamburger|navbar-toggler|(open|close).?menu/ }[kind]
    const scored = all
      .map((e) => {
        const h = hay(e)
        // the mark inside the drawer's opener (its bars) is the opener
        const host = kind === 'sub' ? e.parentElement?.closest('button, a, [role=button]') : null
        if (host && bad.test(hay(host))) return { e, s: 0 }
        let s = (re.test(h) ? 2 : 0) + (re.test((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '')) ? 2 : 0) + (kind === 'theme' && e.getAttribute('role') === 'switch' ? 1 : 0)
        if (kind === 'sub') {
          // the opener of a sub-level is a small mark beside the link (a caret, a chevron); a link with words navigates
          const words = norm(e.innerText).length
          const isLink = e.tagName === 'A' && e.hasAttribute('href')
          if (e.tagName === 'BUTTON' && e.hasAttribute('aria-expanded')) s += 2
          if (words <= 2 && /toggle|caret|chevron|arrow|expand|sub/.test(h)) s += 3
          if (isLink && words > 2) s = 0
        }
        if (kind === 'drawer') {
          // a drawer's opener is a small box named for it; a wide link that merely mentions a menu is not
          if (/off-?canvas|drawer|burger|hamburger|toggler/.test(h)) s += 2
          if (e.getBoundingClientRect().width > 100) s -= 3
        }
        return { e, s: bad.test(h) && !re.test(h.replace(bad, '')) ? 0 : s }
      })
      .filter((x) => x.s > 0)
    scored.sort((a, b) => b.s - a.s)
    list = scored.map((x) => x.e)
  }
  const e = list[0]
  if (!e) return { found: false, why: hint ? `the hint ${hint} matches nothing visible` : `no visible ${kind} control by role/name` }
  e.setAttribute('data-sweep-found', kind)
  const r = e.getBoundingClientRect()
  return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, name: norm(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText).slice(0, 40), w: r.width, h: r.height }
}

/**
 * The links a visitor SEES: words drawn (not a label only a screen reader gets), not covered by something painted over them at their
 * centre, in the window. `href` and the box are kept so a link of the page that moved sideways can be told from a row of the drawer.
 */
export const LINKS_JS = () => {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  // the words drawn: a text node whose parent has a box (a screen-reader-only label is clipped to a pixel, a hidden one has none)
  const shownText = (a) => {
    let t = ''
    const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement
      const pr = p.getBoundingClientRect()
      const pcs = getComputedStyle(p)
      if (pr.width > 3 && pr.height > 3 && pcs.display !== 'none' && pcs.visibility !== 'hidden') t += n.data
    }
    return norm(t)
  }
  const out = []
  for (const a of document.querySelectorAll('a[href], [role=menuitem]')) {
    const cs = getComputedStyle(a)
    const r = a.getBoundingClientRect()
    const text = shownText(a)
    if (!text || text.length < 2 || r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue
    if (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) continue
    // covered: what is on top at the middle of the part of the link inside the window is not the link (or a part of it)
    const cx = Math.min(innerWidth - 1, Math.max(0, (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2))
    const cy = Math.min(innerHeight - 1, Math.max(0, (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2))
    const top = document.elementFromPoint(cx, cy)
    if (top && !(a.contains(top) || top.contains(a))) continue
    out.push({ text, href: a.getAttribute('href') || '', x: r.x, y: r.y, w: r.width, h: r.height, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400, transform: cs.textTransform, key: `${text.toLowerCase()}|${Math.round(r.x / 10)}|${Math.round(r.y / 10)}` })
  }
  return out
}

/** A link that was on the page before the drawer opened and stands on the same line now, further along: the page was pushed, it is not a row of the drawer. */
export const movedPageLink = (before, l) => before.some((b) => b.text.toLowerCase() === l.text.toLowerCase() && b.href === l.href && Math.abs(b.y - l.y) <= 2 && Math.abs(b.x - l.x) > 2)

const hintOf = (plan, side, name) => {
  const v = plan.behaviour?.[name]
  return v == null ? null : typeof v === 'string' ? v : (v[side === 'site' ? 'site' : 'source'] ?? null)
}

async function themeCase({ browser, o, s, width, sys, saved, load }) {
  const hooks = o.plan.hooks
  let hook = saved === 'auto' ? (hooks[s.side].dark ?? '').split('+').find((p) => /^(cookie|ls):/.test(p)) : saved === 'none' ? null : hooks[s.side][saved]
  if (saved === 'auto') hook = hook ? hook.replace(/=[^=+]*$/, '=auto') : null
  if (saved !== 'none' && !hook) return { missing: `the dossier names no ${saved === 'auto' ? 'cookie/localStorage "auto" value' : `${saved} switch`} for this side` }
  const ctx = { viewport: { width, height: HEIGHT }, colorScheme: sys, theme: saved === 'dark' ? 'dark' : 'light', darkRequestHook: saved === 'dark' ? hook : null, lightHook: saved === 'light' || saved === 'auto' ? hook : null, hookUrl: s.origin }
  return withPage(browser, ctx, async (page) => {
    await load(page, s.url, s.expect, o.settleMs)
    const before = await page.evaluate(SCHEME_JS)
    const hint = hintOf(o.plan, s.side, 'themeToggle')
    let found = await page.evaluate(FIND_JS, { kind: 'theme', hint })
    if (!found.found && width < 900) {
      // the switch may live in the mobile drawer: open it, look again
      const d = await page.evaluate(FIND_JS, { kind: 'drawer', hint: hintOf(o.plan, s.side, 'drawerToggle') })
      if (d.found) {
        await page.mouse.click(d.x, d.y)
        await page.waitForTimeout(900)
        found = await page.evaluate(FIND_JS, { kind: 'theme', hint })
      }
    }
    if (!found.found) return { missing: found.why, before }
    await page.mouse.click(found.x, found.y)
    await page.waitForTimeout(700)
    const after = await page.evaluate(SCHEME_JS)
    return { before, after, flips: before !== after, control: found.name }
  })
}

const PARENTS_JS = () => {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const shown = (e) => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight
  }
  document.querySelectorAll('[data-sweep-parent]').forEach((e) => e.removeAttribute('data-sweep-parent'))
  document.querySelectorAll('[data-sweep-ph]').forEach((e) => e.removeAttribute('data-sweep-ph'))
  const out = []
  const used = new Set()
  const roots = [...document.querySelectorAll('header, [role=banner], nav')]
  for (const a of document.querySelectorAll('a[href]')) {
    if (out.length >= 3) break
    if (!roots.some((r) => r.contains(a)) || !shown(a) || norm(a.innerText).length < 2 || a.getBoundingClientRect().top > 220) continue
    // the item: the nearest ancestor that holds this link and a panel of two or more links that are hidden at rest, and no other visible link
    for (let c = a.parentElement, d = 0; c && d < 4 && c !== document.body; c = c.parentElement, d++) {
      const links = [...c.querySelectorAll('a[href]')].filter((l) => l !== a)
      if (links.some(shown)) break
      const hidden = links.filter((l) => !shown(l))
      if (hidden.length >= 2) {
        if (used.has(c)) break
        used.add(c)
        const idx = out.length
        c.setAttribute('data-sweep-parent', String(idx))
        hidden.forEach((l) => l.setAttribute('data-sweep-ph', String(idx)))
        const r = a.getBoundingClientRect()
        out.push({ idx, text: norm(a.innerText).toLowerCase(), x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2, href: a.getAttribute('href') })
        break
      }
    }
  }
  return out
}

const PANEL_SHOWN_JS = (idx) =>
  [...document.querySelectorAll(`[data-sweep-ph="${idx}"]`)].some((x) => {
    const cs = getComputedStyle(x)
    const r = x.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight
  })

async function touchParents({ browser, o, s, width, load }) {
  const base = { viewport: { width, height: 800 }, colorScheme: 'light', theme: 'light', hasTouch: true, hookUrl: s.origin }
  const list = await withPage(browser, base, async (page) => {
    await load(page, s.url, s.expect, o.settleMs)
    return page.evaluate(PARENTS_JS)
  })
  const results = []
  for (const p of list) {
    const taps = await withPage(browser, base, async (page) => {
      await load(page, s.url, s.expect, o.settleMs)
      const again = (await page.evaluate(PARENTS_JS)).find((x) => x.idx === p.idx)
      if (!again) return null
      const start = page.url()
      const out = []
      for (let i = 0; i < 2; i++) {
        // a flag on the window: a tap that reloads the same address (the item links to the page itself) loses it, and that is a navigation
        await page.evaluate((n) => (window.__sweepTap = n), i)
        await page.touchscreen.tap(again.x, again.y)
        await page.waitForTimeout(800)
        const kept = await page.evaluate((n) => window.__sweepTap === n, i).catch(() => false)
        const navigated = page.url() !== start || !kept
        const opened = navigated ? false : await page.evaluate(PANEL_SHOWN_JS, p.idx)
        out.push({ navigated, opened })
        if (navigated) break
      }
      return out
    })
    if (taps) results.push({ text: p.text, taps })
  }
  return { parents: results, found: list.length }
}

/**
 * Runs in the page: where the header and the content region stand after the drawer pushed the page. A region the page lacks is null, not x = 0.
 * The content region is `main`, else `[role=main]`, else the one visible block between the header region and the footer region (in document order)
 * that holds the largest share of the height between them; none, or several of equal height, is null (not measured).
 */
export function pushGeometry() {
  const x = (e) => (e ? e.getBoundingClientRect().x : null)
  const shown = (e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    if (!(r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden')) return false
    // faded out, by itself or by a parent, is not drawn
    for (let a = e; a; a = a.parentElement) if (Number(getComputedStyle(a).opacity) === 0) return false
    return true
  }
  const header = document.querySelector('header, [role=banner]')
  // `main` first, then [role=main]; each among the ones drawn
  let content = [...document.querySelectorAll('main')].find(shown) ?? [...document.querySelectorAll('[role=main]')].find(shown) ?? null
  if (!content) {
    const footer = document.querySelector('footer, [role=contentinfo]')
    if (header && footer && shown(header) && shown(footer)) {
      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
      const between = [...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName)
        && !e.contains(header) && !e.contains(footer) && !header.contains(e) && !footer.contains(e)
        && header.compareDocumentPosition(e) & FOLLOWING && e.compareDocumentPosition(footer) & FOLLOWING && shown(e))
      const set = new Set(between)
      const blocks = between.filter((e) => !set.has(e.parentElement)).map((e) => ({ e, h: e.getBoundingClientRect().height })).sort((a, b) => b.h - a.h)
      if (blocks.length && (blocks.length === 1 || blocks[0].h - blocks[1].h > 1)) content = blocks[0].e
    }
  }
  return { pushedHeaderX: x(header), pushedMainX: x(content) }
}

async function drawerCase({ browser, o, s, width, load }) {
  const base = { viewport: { width, height: 844 }, colorScheme: 'light', theme: 'light', hasTouch: true, hookUrl: s.origin }
  return withPage(browser, base, async (page) => {
    await load(page, s.url, s.expect, o.settleMs)
    const find = (kind, hintName) => page.evaluate(FIND_JS, { kind, hint: hintOf(o.plan, s.side, hintName) })
    const burger = await find('drawer', 'drawerToggle')
    if (!burger.found) return { missing: burger.why }
    const beforeLinks = await page.evaluate(LINKS_JS)
    const before = new Set(beforeLinks.map((l) => l.key))
    // the page as it stands with the drawer CLOSED: what the strip beside the open panel is compared with, so that what the page itself draws
    // there (a hero copy, a picture) is no part of what the drawer does to it
    const closedShot = await page.screenshot({ animations: 'disabled' })
    await page.touchscreen.tap(burger.x, burger.y)
    await page.waitForTimeout(1000)
    const all = await page.evaluate(LINKS_JS)
    // the rows of the drawer: links that appeared and are not covered; a link of the page the drawer pushed sideways (a hero button now beside the panel) is not one
    const rows = all.filter((l) => !before.has(l.key) && l.x > -2 && l.x < width - 4 && !movedPageLink(beforeLinks, l))
    if (rows.length < 2) return { opens: false, rows: [], closes: null }
    const geometry = await page.evaluate(pushGeometry)
    const edge = Math.floor(Math.min(...rows.map((r) => r.x))) - 8
    const strip = edge >= 40 ? { edge, grid: gridOf(await page.screenshot({ animations: 'disabled' }), edge), closed: gridOf(closedShot, edge) } : null
    const firstKeys = new Set(rows.map((r) => r.key))
    // a sub-level: the first control inside the open drawer that opens one
    let back = null
    let backWorks = null
    const sub = await find('sub', 'subToggle')
    if (sub.found && sub.x > 0 && sub.x < width) {
      await page.touchscreen.tap(sub.x, sub.y)
      await page.waitForTimeout(900)
      back = await page.evaluate(() => {
        const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
        const found = []
        for (const e of document.querySelectorAll('a, button, span, li, div, [role=button]')) {
          const h = `${e.getAttribute('aria-label') ?? ''} ${typeof e.className === 'string' ? e.className : ''} ${e.id}`.toLowerCase()
          const t = norm(e.innerText)
          const cs = getComputedStyle(e)
          const r = e.getBoundingClientRect()
          if (!(/(^|[\s_-])back([\s_-]|$)|go-back|menu-back|prev(ious)?-?(menu|level)/.test(h) || /^[‹←<«]?\s*back$/i.test(t))) continue
          if (!t && !e.querySelector('svg, img, i')) continue
          if (r.width < 10 || r.height < 10 || cs.visibility === 'hidden' || cs.display === 'none' || r.x < 0 || r.x >= innerWidth) continue
          // the row itself: not a wrapper holding several rows
          if (e.querySelectorAll('a[href]').length > 3) continue
          const kids = [...e.children].filter((k) => k.getBoundingClientRect().width <= 2 || k.getBoundingClientRect().height <= 2)
          kids.forEach((k) => (k.style.display = 'none'))
          const text = norm(e.innerText)
          kids.forEach((k) => (k.style.display = ''))
          found.push({ e, row: { text, transform: cs.textTransform, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400, w: r.width, h: r.height, x: r.x, y: r.y } })
        }
        // the row is the innermost match: the button inside a list item named for going back is what is tapped and what carries the type
        const inner = found.find((f) => !found.some((g) => g !== f && f.e.contains(g.e)))
        return inner ? inner.row : null
      })
      if (back) {
        await page.touchscreen.tap(back.x + back.w / 2, back.y + back.h / 2)
        await page.waitForTimeout(900)
        const now = new Set((await page.evaluate(LINKS_JS)).map((l) => l.key))
        backWorks = [...firstKeys].filter((k) => now.has(k)).length >= Math.max(1, firstKeys.size * 0.5)
      }
    }
    // close: the control made for it, else the burger itself
    let closes = null
    const shownRows = async () => {
      const now = new Set((await page.evaluate(LINKS_JS)).map((l) => l.key))
      return [...firstKeys].filter((k) => now.has(k)).length
    }
    const close = await find('close', 'drawerClose')
    if (close.found) {
      await page.touchscreen.tap(close.x, close.y)
      await page.waitForTimeout(900)
      closes = (await shownRows()) < Math.max(1, firstKeys.size * 0.3)
    }
    if (closes !== true) {
      const burger2 = await find('drawer', 'drawerToggle')
      if (burger2.found && (await shownRows()) >= 1) {
        await page.touchscreen.tap(burger2.x, burger2.y)
        await page.waitForTimeout(900)
        if ((await shownRows()) < Math.max(1, firstKeys.size * 0.3)) closes = true
        else closes = close.found ? false : closes
      }
    }
    return { opens: true, rows: rows.slice(0, 40).map((r) => ({ text: r.text, size: r.size })), back, backWorks, closes, strip, ...geometry }
  })
}

// ---- the sweep --------------------------------------------------------------------------------------------------------

const widthsFor = (widths) => [...new Set([widths.includes(1440) ? 1440 : Math.max(...widths), widths.includes(390) ? 390 : Math.min(...widths)])]

/**
 * Measure the behaviour checks of `o.only` over `o.pairs`. `o` is the sweep's options plus `load` and `passContext` (site-sweep.mjs).
 * A scoped re-run names what the full run read (site-sweep-scope.mjs): `anchorWidths` (the static checks), `themeWidths` and `homePath` (first-interaction).
 * → { rows: { check: [row] }, owed: [], notOwed: [], ms: { check: ms } } — `notOwed`: dark cells closed by the contract's declaration (darkPassGap)
 */
export async function measureBehaviour(o) {
  const want = new Set(BEHAVIOUR_ORDER.filter((c) => o.only.has(c)))
  const rows = Object.fromEntries([...want].map((c) => [c, []]))
  const owed = []
  const notOwed = []
  const ms = {}
  const t0 = Date.now()
  const late = () => o.deadlineAt != null && Date.now() > o.deadlineAt
  const staticWant = ['fixed-widgets', 'icons', 'forms', 'text'].filter((c) => want.has(c))
  const sidesOf = (pg) => [
    { name: 'port', side: 'site', origin: new URL(o.site).origin, url: new URL(pg.path, o.site).href, expect: { status: pg.status, error: pg.status >= 400, onlyOrigin: new URL(o.site).origin } },
    ...(pg.referenceKind === 'none' ? [] : [{ name: 'source', side: 'source', origin: new URL(pg.sourceUrl).origin, url: pg.sourceUrl, expect: { status: pg.status, error: pg.status >= 400 } }])
  ]
  const measurable = o.pairs.filter((p) => p.sourceUrl || p.referenceKind === 'none')

  if (staticWant.length) {
    const widths = o.anchorWidths ?? widthsFor(o.widths)
    const jobs = []
    for (const pg of measurable) for (const width of widths) for (const scheme of o.schemes) jobs.push({ pg, width, scheme })
    await mapLimit(jobs, o.concurrency ?? 4, async ({ pg, width, scheme }) => {
      // widgets are read in every scheme; the rest is scheme-independent and read in the first one — in light when the source has no
      // dark of its own (darkPassGap): its dark cells are closed unread, so what is read once must be read where both sides are
      const once = o.plan.hooks.source.darkDerived === true && o.schemes.includes('light') ? 'light' : o.schemes[0]
      const first = scheme === once
      const parts = { widgets: want.has('fixed-widgets'), icons: want.has('icons') && first, forms: want.has('forms') && first, text: want.has('text') && first, ...(pg.referenceKind === 'none' ? { targetOnly: true } : {}) }
      // a cell owes only the checks read in its scheme: a dark cell is fixed-widgets', the other three are read in the first scheme
      const checks = [['fixed-widgets', 'widgets'], ['icons', 'icons'], ['forms', 'forms'], ['text', 'text']].filter(([, part]) => parts[part]).map(([c]) => c)
      if (!checks.length) return
      if (late()) return owed.push({ route: pg.path, width, scheme, checks, reason: 'the deadline was reached before this page was measured' })
      // a page with no reference (referenceKind none) is read on the port alone: only the port's dark switch is needed
      const gap = scheme !== 'dark' ? null : pg.referenceKind === 'none' ? (o.plan.hooks.site.dark ? null : 'owed') : darkPassGap(o.plan.hooks, o.schemes)
      if (gap === 'derived') return notOwed.push({ route: pg.path, width, scheme, checks, reason: DARK_DERIVED_REASON })
      if (gap === 'owed') return owed.push({ route: pg.path, width, scheme, checks, reason: 'no dark switch for one side' })
      try {
        const got = await Promise.all(
          sidesOf(pg).map((s) =>
            withTimeout(
              (() => {
                const ctx = o.passContext({ side: s.side, origin: s.origin, width, scheme, hooks: o.plan.hooks })
                return readSide(
                  o,
                  { s, kind: 'static', ctx, extra: { parts, settleMs: o.settleMs ?? null }, label: { route: pg.path, width, scheme, check: 'static' } },
                  (b) =>
                    withPage(b, ctx, async (page) => {
                      await o.load(page, s.url, s.expect, o.settleMs)
                      return readStatic(page, parts)
                    })
                )
              })(),
              SIDE_TIMEOUT_MS,
              `${pg.path} ${s.name}`
            )
          )
        )
        const [port, source] = got
        const row = { route: pg.path, ...(pg.referenceKind === 'none' ? { referenceKind: 'none' } : {}), width, scheme, source: pg.referenceKind === 'none' ? null : source, port }
        for (const c of staticWant) rows[c].push(row)
      } catch (e) {
        owed.push({ route: pg.path, width, scheme, checks, reason: String(e.message).split('\n')[0] })
      }
    })
  }

  if (want.has('first-interaction')) {
    const home = o.homePath ? measurable.find((p) => p.path === o.homePath) : (measurable.find((p) => p.path === '/') ?? measurable[0])
    if (!home && o.homePath) owed.push({ route: o.homePath, checks: ['first-interaction'], reason: 'the home route the full run read cannot be measured in this run' })
    if (home) {
      const sides = sidesOf(home)
      const mk = async (fn, args, state) => {
        // a page that navigates by itself while it is read (a redirect, a language switch) is read once more
        const once = (s) =>
          withTimeout(
            readSide(o, { s, kind: `first-interaction-${fn.name}`, extra: { args, hooks: o.plan.hooks[s.side], hints: o.plan.behaviour ?? {}, settleMs: o.settleMs ?? null }, label: { route: home.path, width: args.width, state, check: 'first-interaction' } }, (b) => fn({ browser: b, o, s, load: o.load, ...args })),
            SIDE_TIMEOUT_MS,
            `${home.path} ${s.name}`
          )
        const got = await Promise.all(sides.map((s) => once(s).catch((e) => (/context was destroyed|navigation/i.test(e.message) ? once(s) : Promise.reject(e))).catch((e) => ({ missing: `could not be read: ${String(e.message).split('\n')[0]}` }))))
        return { port: got[0], source: got[1] ?? null }
      }
      const jobs = []
      for (const width of o.themeWidths ?? (o.widths.filter((w) => THEME_WIDTHS.includes(w)).length ? THEME_WIDTHS.filter((w) => o.widths.includes(w)) : widthsFor(o.widths)))
        for (const sys of o.schemes) for (const saved of ['none', 'light', 'dark', 'auto']) jobs.push({ kind: 'theme', width, expect: saved === 'dark' ? 'dark' : saved === 'light' ? 'light' : saved === 'none' ? sys : null, state: `os-${sys}/${saved === 'none' ? 'no-choice' : saved === 'auto' ? 'old-auto-value' : `saved-${saved}`}`, run: () => mk(themeCase, { width, sys, saved }, `os-${sys}/${saved === 'none' ? 'no-choice' : saved === 'auto' ? 'old-auto-value' : `saved-${saved}`}`) })
      for (const width of TOUCH_WIDTHS.filter((w) => o.widths.includes(w))) jobs.push({ kind: 'touch', width, state: 'touch', run: () => mk(touchParents, { width }, 'touch') })
      for (const width of DRAWER_WIDTHS.filter((w) => o.widths.includes(w))) jobs.push({ kind: 'drawer', width, state: 'drawer', run: () => mk(drawerCase, { width }, 'drawer') })
      await mapLimit(jobs, o.concurrency ?? 4, async (j) => {
        if (late()) return owed.push({ route: home.path, width: j.width, state: j.state, reason: 'the deadline was reached before this case was measured' })
        try {
          const r = await j.run()
          if (j.kind === 'touch') {
            if (home.referenceKind === 'none') {
              const p = r.port?.missing ? r.port : r.port?.parents?.length ? r.port : { missing: `no parent menu item with a hidden panel was found in the header at ${j.width}px`, found: r.port?.found ?? 0 }
              rows['first-interaction'].push(...targetTouchRows({ route: home.path, width: j.width, state: j.state, port: p }))
              return
            }
            const side = (x) => (x.missing ? x : x.parents.length ? x : { missing: `no parent menu item with a hidden panel was found in the header at ${j.width}px` })
            const s = side(r.source)
            const p = side(r.port)
            if (s.missing || p.missing) rows['first-interaction'].push({ route: home.path, width: j.width, state: j.state, kind: 'touch', source: s, port: p, what: 'parent menu items' })
            else {
              let paired = 0
              for (const a of s.parents) {
                const b = p.parents.find((x) => x.text === a.text)
                if (!b) continue
                paired++
                rows['first-interaction'].push({ route: home.path, width: j.width, state: j.state, kind: 'touch', what: `"${a.text}"`, source: { taps: a.taps }, port: { taps: b.taps } })
              }
              if (!paired) rows['first-interaction'].push({ route: home.path, width: j.width, state: j.state, kind: 'touch', source: { missing: 'no parent item of this name on the port' }, port: { missing: 'no parent item of this name' }, what: 'parent menu items' })
            }
          } else rows['first-interaction'].push({ route: home.path, ...(home.referenceKind === 'none' ? { referenceKind: 'none' } : {}), width: j.width, state: j.state, kind: j.kind, expect: j.expect, source: r.source, port: r.port })
        } catch (e) {
          owed.push({ route: home.path, width: j.width, state: j.state, reason: String(e.message).split('\n')[0] })
        }
      })
    }
  }
  const total = Date.now() - t0
  for (const c of want) ms[c] = total
  return { rows, owed, notOwed, ms, want: [...want] }
}

/** Judge the measured rows → the same pieces judgeAll gives the five checks: { checks, judged }. */
export function judgeBehaviour(measured) {
  const judged = {}
  const checks = []
  for (const id of measured.want) {
    const rows = measured.rows[id] ?? []
    const j = id === 'text' ? BEHAVIOUR_JUDGES.text(rows) : BEHAVIOUR_JUDGES[id](rows)
    judged[id] = j
    const owedHere = measured.owed.filter((x) => (x.checks ? x.checks.includes(id) : (id === 'first-interaction') === Boolean(x.state)))
    const causes = {}
    for (const n of j.notMeasured) causes[n.cause] = { cases: (causes[n.cause]?.cases ?? 0) + 1, why: n.why, example: causes[n.cause]?.example ?? `${n.route}${n.width != null ? ` @${n.width}` : ''}${n.state ? ` ${n.state}` : ''}: ${n.detail ?? ''}` }
    checks.push({
      id,
      title: BEHAVIOUR_TITLES[id],
      cases: j.cases,
      defects: groupDefects(j.defects).length,
      defectRows: j.defects.length,
      listed: j.listed.length,
      notDefects: j.notDefects.length,
      notMeasured: j.notMeasured.length + owedHere.length,
      pass: j.defects.length === 0 && j.notMeasured.length === 0 && owedHere.length === 0 && j.cases > 0,
      probeMs: Math.round(measured.ms[id] ?? 0),
      behaviourCauses: causes,
      ...(j.unavailable?.length ? { statesUnavailable: statesUnavailableOf(j.unavailable) } : {})
    })
  }
  return { checks, judged }
}

/** States the dossier cannot put a side in, or a side did not take: counted per state with the reason (shown, never counted as measured). */
function statesUnavailableOf(list) {
  const out = new Map()
  for (const u of list) {
    const k = `${u.detail}|${u.why}`
    out.set(k, { state: u.detail, reason: u.why, routes: (out.get(k)?.routes ?? 0) + 1 })
  }
  return [...out.values()]
}
