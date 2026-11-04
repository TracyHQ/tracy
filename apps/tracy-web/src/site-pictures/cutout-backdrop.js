// The backdrop a cut-out's demo picture bakes in behind its figure (ADR 0043 section 1a, the backdrop): a large disc
// of one near-uniform colour, and bands in the accent's hue across it (JA Boxing's hero figure: a near-black disc with
// red chevron bands in its lower part). The drawn figure is cut out alone, so code draws that backdrop again from a
// small recipe of SHAPE and colour ROLES, never colour values: step 9 paints it in the customer's brand.
//
// backdropOf reads the recipe from the demo picture, or returns null: a demo without transparent corners, without a
// large disc of one colour, or with nothing it can measure gets no backdrop (code never invents one). Pure, apart from
// decoding the picture.
//
// The recipe's units: the disc's centre in fractions of the picture's width and height, its radius in fractions of the
// width; the bands in disc radii, from the disc's centre. The bands are a chevron pointing up (`^`): each band is
// bounded by two lines at `angle` degrees from the horizontal that meet on the apex's vertical; `apex` is the top edge
// of the first band, `band` the vertical height of one band, `gap` the vertical gap to the next, `count` how many
// bands are drawn (the bands the demo shows, or down to the disc's bottom when the disc's edge cuts its last one). `texture` is null or a speckle of darker spots (`share` of the band, the spot colour the
// accent mixed `shade` of the way toward the disc colour).
import sharp from 'sharp'
import { stripesOf } from './cutout-backdrop-stripes.js'
import { hexOf } from '../lib/picture-paint/icons/icon-ink.js'
import { roleOf } from '../lib/picture-paint/paint.js'

/** The longest side the demo is measured at. */
const MEASURE_MAX = 400
const round3 = (v) => Math.round(v * 1000) / 1000

// A circle through points by least squares (Kasa), refitted on the points near it.
function fitCircle(points, tolerance) {
  let c = kasa(points)
  let kept = points
  for (let i = 0; i < 4 && c; i++) {
    const { cx, cy, r } = c
    kept = points.filter(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r) < tolerance * r)
    c = kept.length >= 8 ? kasa(kept) : null
  }
  return c ? { ...c, inliers: kept.length / points.length } : null
}

function kasa(points) {
  const m = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]
  for (const [x, y] of points) {
    const z = x * x + y * y
    const row = [x, y, 1]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j]
      m[i][3] += row[i] * z
    }
  }
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      if (!m[i][i]) return null
      const f = m[j][i] / m[i][i]
      for (let k = i; k < 4; k++) m[j][k] -= f * m[i][k]
    }
  const s = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let v = m[i][3]
    for (let k = i + 1; k < 3; k++) v -= m[i][k] * s[k]
    s[i] = v / m[i][i]
  }
  const cx = s[0] / 2
  const cy = s[1] / 2
  const r = Math.sqrt(s[2] + cx * cx + cy * cy)
  return Number.isFinite(r) ? { cx, cy, r } : null
}

/**
 * The backdrop recipe of a cut-out's demo picture, or null when it has none.
 * @param {Buffer | Uint8Array} bytes the demo picture @param {{ accent?: string | null }} [opts] the template accent
 * @returns {Promise<null | { shape: object, paint: { circle: string, stripes: string | null },
 *   demoColours: { circle: string, stripes: string | null } }>} `demoColours` the colours measured on the demo, for
 *   the record only: the manifest carries the shape and the roles, never a colour
 */
export async function backdropOf(bytes, { accent = null } = {}) {
  let img
  try {
    img = await sharp(Buffer.from(bytes), { failOn: 'none' })
      .rotate()
      .resize(MEASURE_MAX, MEASURE_MAX, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  } catch {
    return null
  }
  const { data, info } = img
  const W = info.width
  const H = info.height
  const at = (x, y) => (y * W + x) * 4
  // 1. Transparent corners: a picture that fills its box has no backdrop to draw again.
  if ([at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].some((i) => data[i + 3] >= 16)) return null
  // 2. The disc: a circle through the left and right edges of the opaque rows.
  const edges = []
  for (let y = 0; y < H; y++) {
    let l = -1
    let r = -1
    for (let x = 0; x < W; x++)
      if (data[at(x, y) + 3] >= 128) {
        if (l < 0) l = x
        r = x
      }
    if (l >= 0) edges.push([l, y], [r + 1, y])
  }
  const disc = edges.length >= 16 ? fitCircle(edges, 0.015) : null
  if (!disc || disc.inliers < 0.6 || disc.r < 0.3 * Math.min(W, H)) return null
  const { cx, cy, r } = disc
  if (cx < 0 || cx > W || cy < 0 || cy > H) return null
  let inside = 0
  let solid = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - cx, y - cy) > 0.97 * r) continue
      inside += 1
      if (data[at(x, y) + 3] >= 200) solid += 1
    }
  if (!inside || solid / inside < 0.97) return null
  // 3. The disc's colour: one near-uniform colour fills most of its rim.
  const rim = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d >= 0.8 * r && d <= 0.95 * r && data[at(x, y) + 3] >= 200) rim.push(at(x, y))
    }
  const buckets = new Map()
  for (const i of rim) {
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  const top = [...buckets].sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  const centre = {
    r: ((top[0] >> 8) << 4) + 8,
    g: (((top[0] >> 4) & 15) << 4) + 8,
    b: ((top[0] & 15) << 4) + 8
  }
  const near = (i, c, tol) =>
    Math.max(Math.abs(data[i] - c.r), Math.abs(data[i + 1] - c.g), Math.abs(data[i + 2] - c.b)) <= tol
  const groundPx = rim.filter((i) => near(i, centre, 24))
  if (groundPx.length < 0.4 * rim.length) return null
  const mean = (list, k) => list.reduce((s, i) => s + data[i + k], 0) / list.length
  const ground = { r: mean(groundPx, 0), g: mean(groundPx, 1), b: mean(groundPx, 2) }
  const groundHex = hexOf(ground)
  const role = roleOf(groundHex, accent)
  const circle = {
    x: round3(cx / W),
    y: round3(cy / H),
    r: round3(r / W)
  }
  const measured = stripesOf({ data, W, H, at, cx, cy, r, ground, accent, near })
  const { colour = null, ...stripes } = measured ?? {}
  return {
    shape: { circle, stripes: measured ? stripes : null },
    paint: { circle: role === 'text' ? 'surface' : role, stripes: measured ? 'accent' : null },
    demoColours: { circle: groundHex, stripes: colour }
  }
}
