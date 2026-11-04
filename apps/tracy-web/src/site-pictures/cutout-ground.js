// The ground of a cut-out (#346, ADR 0043 sections 3 and 4): a cut-out frame is filled by drawing the figure on a flat
// plain ground of one known colour (ladder-draw.js, mode `cutout`), and code removes that ground here. No model removes
// a background.
//
// - The ground colour is chosen from the plan's words for the frame: chroma green, unless the words name something of
//   that colour (grass, a tennis ball), then magenta, then blue (groundFor).
// - The ground the model really painted is measured on the picture's border, near the asked colour.
// - Each pixel's alpha comes from how much the ground's own channels dominate it (a colour difference key, as a green
//   screen is keyed), soft between two thresholds. Its colour is then unmixed from the ground (the edge pixel was
//   alpha * figure + (1 - alpha) * ground) and the ground's spill is suppressed, so the edge keeps no fringe of the
//   ground colour (no halo).
// - The removal fails, and the drawing counts as a failed draw, when the border holds too little ground, too much of
//   the picture is only partly removed (a ground that is not plain, a shadow, ground colour inside the figure), no
//   figure or no ground is left, or the figure touches the top, left or right edge (it may stand on the bottom edge).
//   Each failure names the looker fault the redraw is told about.
//
// The cut-out is then fitted inside the frame's output size (contained, never cropped, transparent around it) as a PNG
// with alpha.
import sharp from 'sharp'

/** The grounds a cut-out may be drawn on, in the order they are tried, with the words that rule each out. */
export const GROUNDS = Object.freeze([
  Object.freeze({
    name: 'chroma green',
    hex: '#00b140',
    rgb: [0, 177, 64],
    key: 'green',
    clashes:
      /\b(green|grass|lawn|turf|leaf|leaves|plant|tree|forest|moss|lime|olive|mint|emerald|jade|tennis ball)/i
  }),
  Object.freeze({
    name: 'magenta',
    hex: '#ff00ff',
    rgb: [255, 0, 255],
    key: 'magenta',
    clashes: /\b(pink|magenta|purple|violet|fuchsia|rose|lilac|lavender|plum|berry)/i
  }),
  Object.freeze({
    name: 'chroma blue',
    hex: '#0047bb',
    rgb: [0, 71, 187],
    key: 'blue',
    clashes: /\b(blue|navy|denim|sky|sea|ocean|water|pool|cobalt|teal|turquoise)/i
  })
])

/** At least this share of the border must be ground of the asked colour. */
export const MIN_BORDER_GROUND = 0.5
/** At most this share of the picture may be only partly removed. */
export const MAX_SOFT = 0.06
/** At least this share must be ground, and at least FIGURE_MIN figure. */
export const MIN_CLEAR = 0.05
export const FIGURE_MIN = 0.03
/** The figure touches an edge when more than this share of that edge is figure. */
export const EDGE_TOUCH = 0.02
// A pixel whose ground dominance is at most KEY_LOW of the ground's is figure, at least KEY_HIGH of it ground.
const KEY_LOW = 0.15
const KEY_HIGH = 0.85
// A border pixel within this share of the ground's dominance of the asked colour is ground.
const NEAR_ASKED = 0.6

/** How much a pixel shows the ground's own channels over the others (green screen: green over red and blue). */
const DOMINANCE = {
  green: (r, g, b) => g - Math.max(r, b),
  blue: (r, g, b) => b - Math.max(r, g),
  magenta: (r, g, b) => Math.min(r, b) - g
}
/** The pixel with the ground's spill taken out (its dominance brought to zero at most). */
const DESPILL = {
  green: (p) => [p[0], Math.min(p[1], Math.max(p[0], p[2])), p[2]],
  blue: (p) => [p[0], p[1], Math.min(p[2], Math.max(p[0], p[1]))],
  magenta: (p) => {
    const over = Math.max(0, Math.min(p[0], p[2]) - p[1])
    return [p[0] - over, p[1], p[2] - over]
  }
}

const wordsOf = (wish) =>
  [wish?.shows, ...(Array.isArray(wish?.mustInclude) ? wish.mustInclude : []), wish?.mood].join(' ')

/** The ground for one frame: the first ground whose colour its words do not name, else the one they name least. */
export function groundFor(wish) {
  const words = wordsOf(wish)
  const hits = (g) => (words.match(new RegExp(g.clashes.source, 'gi')) ?? []).length
  return GROUNDS.find((g) => hits(g) === 0) ?? [...GROUNDS].sort((x, y) => hits(x) - hits(y))[0]
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const byte = (x) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x))
const hex = (rgb) => `#${rgb.map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Remove the ground from one drawing.
 * @param {Buffer} bytes the drawer's picture
 * @param {{ rgb: number[], key: string }} ground the asked ground (GROUNDS)
 * @returns {Promise<{ ok: true, data: Buffer, width: number, height: number, measured: string, clear: number,
 *   soft: number, figure: number } | { ok: false, reason: string, fault: string }>} `data` raw RGBA
 */
export async function removeGround(bytes, ground) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const dom = DOMINANCE[ground.key]
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
  // The ground as painted: the mean of the border pixels close to the asked colour.
  const asked = dom(...ground.rgb)
  const border = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1)
  const near = border.filter((i) => dom(...px(i)) >= NEAR_ASKED * asked)
  if (near.length < MIN_BORDER_GROUND * border.length)
    return { ok: false, reason: 'the border is not the plain ground asked for', fault: 'leftover ground' }
  const g = [0, 1, 2].map((c) => near.reduce((n, i) => n + data[i * 3 + c], 0) / near.length)
  const strength = dom(...g)
  const out = Buffer.alloc(width * height * 4)
  let clear = 0
  let soft = 0
  let solid = 0
  for (let i = 0; i < width * height; i++) {
    const p = px(i)
    const a = clamp01((KEY_HIGH - dom(...p) / strength) / (KEY_HIGH - KEY_LOW))
    let rgb = [0, 0, 0]
    if (a > 0) rgb = DESPILL[ground.key](p.map((v, c) => (v - (1 - a) * g[c]) / a).map(byte))
    out.set([...rgb.map(byte), byte(a * 255)], i * 4)
    if (a <= 0.02) clear++
    else if (a >= 0.98) solid++
    else soft++
  }
  const n = width * height
  const share = { clear: clear / n, soft: soft / n, figure: solid / n }
  const round = (x) => Math.round(x * 1000) / 1000
  const fail = (reason, fault) => ({ ok: false, reason, fault })
  if (share.clear < MIN_CLEAR) return fail('almost no ground is left around the figure', 'leftover ground')
  if (share.soft > MAX_SOFT)
    return fail(
      `${Math.round(share.soft * 100)}% of the picture is only partly removed: the ground is not plain, or its colour is in the figure`,
      'leftover ground'
    )
  if (share.figure < FIGURE_MIN) return fail('no figure is left once the ground is removed', 'missing part')
  const alphaAt = (x, y) => out[(y * width + x) * 4 + 3]
  const touches = (count, length) => count > EDGE_TOUCH * length
  const edges = {
    top: Array.from({ length: width }, (_, x) => alphaAt(x, 0)),
    left: Array.from({ length: height }, (_, y) => alphaAt(0, y)),
    right: Array.from({ length: height }, (_, y) => alphaAt(width - 1, y))
  }
  for (const [side, alphas] of Object.entries(edges))
    if (touches(alphas.filter((v) => v > 127).length, alphas.length))
      return fail(`the figure touches the ${side} edge of the picture`, 'subject cut off')
  return {
    ok: true,
    data: out,
    width,
    height,
    measured: hex(g),
    clear: round(share.clear),
    soft: round(share.soft),
    figure: round(share.figure)
  }
}

/**
 * A drawing as the cut-out file of a frame: its ground removed, contained in the output size (never cropped, the rest
 * transparent), as a PNG with alpha. `figure` is the share of the file the figure covers.
 * @returns {Promise<{ ok: true, png: Buffer, cutout: object } | { ok: false, reason: string, fault: string }>}
 */
export async function cutoutFile(bytes, ground, out) {
  const removed = await removeGround(bytes, ground)
  if (!removed.ok) return removed
  const keyed = sharp(removed.data, { raw: { width: removed.width, height: removed.height, channels: 4 } })
  const png = await keyed
    .resize(out.width, out.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const placed =
    (removed.width / removed.height > out.width / out.height
      ? out.width / removed.width
      : out.height / removed.height) ** 2
  const figure =
    Math.round(
      ((removed.figure * removed.width * removed.height * placed) / (out.width * out.height)) * 1000
    ) / 1000
  return {
    ok: true,
    png,
    cutout: {
      ground: ground.hex,
      groundName: ground.name,
      measured: removed.measured,
      groundRemoved: true,
      soft: removed.soft,
      figure
    }
  }
}
