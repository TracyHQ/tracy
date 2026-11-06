// The chevron bands of a cut-out's demo backdrop (cutout-backdrop.js): bands in the accent's hue across the disc,
// measured on the disc's two sides away from the figure in the middle. Units as in cutout-backdrop.js.
import { hexOf, rgbOf } from '../lib/picture-paint/icons/icon-ink.js'

const round3 = (v) => Math.round(v * 1000) / 1000
const hueOf = (r, g, b) => {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

// The chevron bands across the disc, measured on its two sides (away from the figure in the middle), or null.
export function stripesOf({ data, W, H, at, cx, cy, r, ground, accent, near }) {
  const a = rgbOf(accent)
  const sat = (i) => {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    return max >= 50 && (max - Math.min(data[i], data[i + 1], data[i + 2])) / max >= 0.6
  }
  // The bands' hue: the accent's, or the commonest strong hue of the sides when the template accent is unknown.
  const sides = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = at(x, y)
      if (data[i + 3] < 200 || Math.abs(x - cx) < 0.45 * r || Math.hypot(x - cx, y - cy) > 0.97 * r) continue
      sides.push([x, y, i])
    }
  let hue = a ? hueOf(a.r, a.g, a.b) : null
  if (hue == null) {
    const count = Array.from({ length: 36 }, () => 0)
    for (const [, , i] of sides)
      if (sat(i)) count[Math.floor(hueOf(data[i], data[i + 1], data[i + 2]) / 10)]++
    hue = count.indexOf(Math.max(...count)) * 10 + 5
  }
  const isBand = (i) => sat(i) && hueGap(hueOf(data[i], data[i + 1], data[i + 2]), hue) <= 25
  const half = (sign) =>
    sideBands(
      sides.filter(([x]) => Math.sign(x - cx) === sign),
      isBand,
      (i) => near(i, ground, 24),
      sign,
      r
    )
  const left = half(-1)
  const right = half(1)
  if (!left || !right || Math.abs(left.angle - right.angle) > 3) return null
  const angle = (left.angle + right.angle) / 2
  const t = Math.tan((angle * Math.PI) / 180)
  // Left lines y = vL - x t, right lines y = vR + x t: the first bands' top edges meet at the apex.
  const ax = (left.runs[0].from - right.runs[0].from) / (2 * t)
  const ay = (left.runs[0].from + right.runs[0].from) / 2
  const full = [left, right].flatMap((s) => s.runs.slice(0, -1))
  const gaps = [left, right].flatMap((s) => s.runs.slice(1).map((run, k) => run.from - s.runs[k].to - 1))
  const avg = (list) => list.reduce((s, v) => s + v, 0) / list.length
  const band = full.length
    ? avg(full.map((run) => run.to - run.from + 1))
    : left.runs[0].to - left.runs[0].from + 1
  const px = [...left.px, ...right.px]
  const light = px.map((i) => Math.max(data[i], data[i + 1], data[i + 2])).sort((p, q) => p - q)
  const peak = light[Math.floor(light.length * 0.9)]
  const spots = light.filter((v) => v < 0.8 * peak)
  const groundMax = Math.max(ground.r, ground.g, ground.b)
  const spotMid = spots[Math.floor(spots.length / 2)]
  const share = spots.length / light.length
  const colourPx = px.filter((i) => Math.max(data[i], data[i + 1], data[i + 2]) >= 0.8 * peak)
  const mean = (k) => colourPx.reduce((s, i) => s + data[i + k], 0) / colourPx.length
  return {
    pattern: 'chevron',
    angle: Math.round(angle * 2) / 2,
    apex: { x: round3((ax - cx) / r), y: round3((ay - cy) / r) },
    band: round3(band / r),
    gap: round3((gaps.length ? avg(gaps) : 0) / r),
    // A last band the disc's edge cuts goes on under the figure: the bands then repeat down to the disc's bottom.
    count:
      left.clipped || right.clipped
        ? Math.max(1, Math.ceil((cy + r - ay) / (band + (gaps.length ? avg(gaps) : 0))))
        : Math.max(left.runs.length, right.runs.length),
    texture:
      share >= 0.04 && peak > groundMax
        ? { kind: 'speckle', share: round3(share), shade: round3((peak - spotMid) / (peak - groundMax)) }
        : null,
    colour: hexOf({ r: mean(0), g: mean(1), b: mean(2) })
  }
}

// One side's bands: the angle whose band/ground profile is sharpest, and the runs of band along it.
function sideBands(points, isBand, isGround, sign, r) {
  const classed = points
    .filter(([, , i]) => isBand(i) || isGround(i))
    .map(([x, y, i]) => [x, y, isBand(i), i])
  const bandCount = classed.filter((p) => p[2]).length
  if (bandCount < 0.05 * points.length) return null
  let best = null
  for (let deg = 15; deg <= 75; deg += 0.5) {
    const t = Math.tan((deg * Math.PI) / 180)
    const n = new Map()
    for (const [x, y, b] of classed) {
      const v = Math.round(y - sign * x * t)
      const c = n.get(v) ?? [0, 0]
      c[0] += 1
      if (b) c[1] += 1
      n.set(v, c)
    }
    let impurity = 0
    for (const [all, hit] of n.values()) impurity += hit * (1 - hit / all)
    impurity /= classed.length
    if (!best || impurity < best.impurity) best = { deg, impurity, n }
  }
  if (best.impurity > 0.04) return null
  const runs = []
  let cur = null
  for (const v of [...best.n.keys()].sort((p, q) => p - q)) {
    const [all, hit] = best.n.get(v)
    if (all < 2) continue
    const on = hit / all > 0.5
    if (!cur || cur.on !== on || v > cur.to + 2) {
      cur = { on, from: v, to: v }
      runs.push(cur)
    } else cur.to = v
  }
  const bands = runs.filter((run) => run.on && run.to - run.from + 1 >= 0.03 * r)
  if (!bands.length) return null
  const last = Math.max(...best.n.keys())
  return {
    angle: best.deg,
    runs: bands,
    clipped: bands.at(-1).to >= last - 2,
    px: classed.filter((p) => p[2]).map((p) => p[3])
  }
}
