/**
 * The business's name drawn in the STYLE of the template's own logo: what the page reader measures of that logo
 * (its box, its pixels, the fonts the theme declares) turned into the drawing's font, colour and lines. Pure: the
 * page measures and draws (`demo-qa-browser.js`), this decides, so each decision is tested without a browser.
 *
 * 🔒 THE TEMPLATE'S LOGO SETS THE LOOK, NEVER A SYMBOL OF ITS OWN (product owner, round 9, 24/10/2026). The owner
 * judged a wordmark in the theme's heading serif, on two small lines, in the link colour, against a template whose
 * logo is one compact handwritten block: the drawing now takes the logo's ink colour and its kind of letter
 * (script, serif, sans, display), from a font the theme itself loads when one is of that kind, else from a font
 * shipped here (`WORDMARK_FONTS`, each with its licence beside it, never fetched at build time). Anything that
 * cannot be measured falls back to the drawing of before: the heading's font and the colour words take there.
 */
import { readFileSync } from 'node:fs'

/** @typedef {'script' | 'serif' | 'sans' | 'display'} StyleClass */

/**
 * The fonts shipped for a class no font of the theme matches: SIL Open Font License 1.1, unmodified, each with its
 * licence file in `wordmark-fonts/` (Dancing Script from the Google Fonts release; the three others are the subsets
 * the Tracy WordPress themes already ship).
 * @type {Readonly<Record<StyleClass, {family: string, file: string, licence: string, weight: string}>>}
 */
export const WORDMARK_FONTS = Object.freeze({
  script: {
    family: 'Tracy Wordmark Script',
    file: 'dancing-script.ttf',
    licence: 'dancing-script-OFL.txt',
    weight: '700'
  },
  serif: {
    family: 'Tracy Wordmark Serif',
    file: 'playfair-display-latin.woff2',
    licence: 'playfair-display-OFL.txt',
    weight: '700'
  },
  sans: {
    family: 'Tracy Wordmark Sans',
    file: 'work-sans-latin.woff2',
    licence: 'work-sans-OFL.txt',
    weight: '600'
  },
  display: {
    family: 'Tracy Wordmark Display',
    file: 'teko-700-latin.woff2',
    licence: 'teko-OFL.txt',
    weight: '700'
  }
})

/**
 * A shipped font's bytes, base64, for the page to load as a FontFace; null when the file cannot be read.
 * @param {StyleClass} cls
 */
export function shippedFont(cls) {
  const font = WORDMARK_FONTS[cls]
  if (!font) return null
  try {
    return readFileSync(new URL(`./wordmark-fonts/${font.file}`, import.meta.url)).toString('base64')
  } catch {
    return null
  }
}

/**
 * Families whose name says their kind of letter: the common Google Fonts and system names, by class. The word
 * "Display" alone says nothing (`Playfair Display` is a serif).
 */
const FAMILY_WORDS = /** @type {Array<[StyleClass, RegExp]>} */ ([
  [
    'script',
    /script|hand|brush|signature|pacifico|satisfy|vibes|sacramento|allura|parisienne|kaushan|yellowtail|cookie|tangerine|caveat|marck|homemade|italianno|pinyon|rochester|niconne|norican|damion|courgette|lobster|amatic|shadows into|indie flower|permanent marker|reenie|calligraph|cursive/i
  ],
  [
    'display',
    /bebas|anton|oswald|teko|saira extra|barlow condensed|league gothic|fjalla|alfa slab|righteous|archivo black|black ops|bungee|staatliches|abril fatface|ultra|monoton|fascinate|fantasy/i
  ],
  [
    'serif',
    /serif|playfair|garamond|merriweather|lora|cormorant|baskerville|crimson|prata|eczar|alegreya(?! sans)|noticia|libre caslon|spectral|bodoni|didot|cinzel|marcellus|fraunces|domine|georgia|times|vollkorn|cardo|rufina|gelasio|old standard/i
  ],
  [
    'sans',
    /sans|roboto|open sans|lato|montserrat|poppins|inter|nunito|raleway|work sans|golos|readex|helvetica|arial|figtree|manrope|dm sans|outfit|mulish|karla|rubik|ubuntu|system-ui/i
  ]
])

/**
 * A family's kind of letter by its name, or null when the name says nothing. "Sans" first (`Noto Sans`,
 * `Alegreya Sans`, `sans-serif`), then the more telling classes before the plainer ones.
 * @param {string} family
 * @returns {StyleClass | null}
 */
export function classOfFamily(family) {
  const name = String(family ?? '')
    .replace(/["']/g, '')
    .trim()
  if (!name || /awesome|icon|dashicons|ionicons|glyph|emoji/i.test(name)) return null
  if (/sans/i.test(name)) return 'sans'
  for (const [cls, words] of FAMILY_WORDS) if (words.test(name)) return cls
  return null
}

/** Distance between two colours, each `[r, g, b]`. */
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * The template logo's ink: its most common colour among the pixels that are not its ground, and the mask of the
 * pixels in that ink's family. A logo with transparency has no ground; an opaque one's ground is its border's most
 * common colour. Colours are counted in steps of 16 so anti-aliasing does not split one ink in many.
 * @param {Uint8Array | Uint8ClampedArray | number[]} rgba
 * @param {number} width
 * @param {number} height
 * @returns {{colour: string, rgb: [number, number, number], mask: Uint8Array} | null} null when nothing is inked
 */
export function inkOf(rgba, width, height) {
  const n = width * height
  if (!(n > 0) || rgba.length < n * 4) return null
  const at = (i) => /** @type {[number, number, number]} */ ([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]])
  let transparent = 0
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 128) transparent++
  /** @type {[number, number, number] | null} */
  let ground = null
  if (transparent < n * 0.05) {
    const border = new Map()
    for (let x = 0; x < width; x++)
      for (const y of [0, height - 1]) {
        const c = at(y * width + x).map((v) => v >> 4)
        border.set(c.join(), (border.get(c.join()) ?? 0) + 1)
      }
    const top = [...border.entries()].sort((a, b) => b[1] - a[1])[0]
    ground = /** @type {[number, number, number]} */ (top[0].split(',').map((v) => Number(v) * 16 + 8))
  }
  const inked = (i) => rgba[i * 4 + 3] >= 128 && (ground === null || distance(at(i), ground) > 60)
  const counts = new Map()
  for (let i = 0; i < n; i++) {
    if (!inked(i)) continue
    const key = at(i)
      .map((v) => v >> 4)
      .join()
    const held = counts.get(key) ?? { count: 0, sum: [0, 0, 0] }
    held.count++
    const c = at(i)
    for (let k = 0; k < 3; k++) held.sum[k] += c[k]
    counts.set(key, held)
  }
  if (counts.size === 0) return null
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  const rgb = /** @type {[number, number, number]} */ (top.sum.map((v) => Math.round(v / top.count)))
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (inked(i)) mask[i] = 1
  return { colour: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, rgb, mask }
}

/**
 * Runs of consecutive set entries.
 * @param {boolean[]} on
 * @returns {Array<[number, number]>} `[start, length]`
 */
function runsOf(on) {
  /** @type {Array<[number, number]>} */
  const runs = []
  let start = -1
  for (let i = 0; i <= on.length; i++) {
    if (i < on.length && on[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push([start, i - start])
      start = -1
    }
  }
  return runs
}

/**
 * The template logo's kind of letter, read from its ink mask by three cheap signals, deterministic:
 *
 * - **joins**: how many separate upright strokes a line of it has against how many letters a line that wide holds
 *   in print (a letter is about 0.6 of the line's height). Printed letters stand apart; script letters join, so a
 *   script line has far fewer gaps than letters.
 * - **weight**: how much of the ink's box is ink. A heavy display face fills it.
 * - **contrast**: the spread of the strokes' thicknesses (the 85th over the 15th percentile of every horizontal and
 *   vertical run of ink). A serif's thick and thin strokes spread; a sans is even.
 *
 * Null when the mask holds too little to read (a few pixels, or a symbol taller than it is wide).
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {{cls: StyleClass, joins: number, weight: number, contrast: number, lines: number} | null}
 */
export function styleClassOf(mask, width, height) {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  let ink = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        ink++
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  const w = right - left + 1
  const h = bottom - top + 1
  if (ink < 40 || w < 8 || h < 6) return null
  const rows = Array.from({ length: h }, (_, y) => {
    for (let x = left; x <= right; x++) if (mask[(top + y) * width + x]) return true
    return false
  })
  // A line of text is a band of rows with ink; a thin band (an underline, a dot row) is not a line.
  const lines = runsOf(rows).filter(([, len]) => len >= h * 0.15)
  if (lines.length === 0) return null
  let strokes = 0
  let letters = 0
  for (const [start, len] of lines) {
    const cols = Array.from({ length: w }, (_, x) => {
      for (let y = start; y < start + len; y++) if (mask[(top + y) * width + left + x]) return true
      return false
    })
    const marks = runsOf(cols)
    if (marks.length === 0) continue
    const span = marks.at(-1)[0] + marks.at(-1)[1] - marks[0][0]
    strokes += marks.length
    letters += span / (len * 0.6)
  }
  if (!(letters > 0) || letters < 1.5) return null
  const joins = strokes / letters
  const weight = ink / (w * h)
  /** @type {number[]} */
  const thickness = []
  for (let y = top; y <= bottom; y++) {
    const row = Array.from({ length: w }, (_, x) => mask[y * width + left + x] === 1)
    for (const [, len] of runsOf(row)) thickness.push(len)
  }
  for (let x = left; x <= right; x++) {
    const col = Array.from({ length: h }, (_, y) => mask[(top + y) * width + x] === 1)
    for (const [, len] of runsOf(col)) thickness.push(len)
  }
  thickness.sort((a, b) => a - b)
  const pick = (q) => thickness[Math.min(thickness.length - 1, Math.floor(q * thickness.length))]
  const contrast = pick(0.85) / Math.max(1, pick(0.15))
  /** @type {StyleClass} */
  const cls = joins < 0.45 ? 'script' : weight > 0.5 ? 'display' : contrast >= 3.2 ? 'serif' : 'sans'
  return {
    cls,
    joins: Math.round(joins * 100) / 100,
    weight: Math.round(weight * 100) / 100,
    contrast: Math.round(contrast * 100) / 100,
    lines: lines.length
  }
}

/**
 * The font the wordmark is set in: (a) a family the theme declares whose name is of the logo's class; (b) else the
 * font shipped for that class; and with no class read, the heading's own font, as before.
 * @param {{cls: StyleClass | null, families?: string[], heading?: {family: string, weight?: string, style?: string} | null}} input
 * @returns {{family: string, weight: string, style: string, source: 'theme' | 'shipped' | 'heading', cls: StyleClass | null, file?: string}}
 */
export function pickFont({ cls, families = [], heading = null }) {
  const fromHeading = {
    family: heading?.family ?? 'serif',
    weight: heading?.weight ?? '700',
    style: heading?.style ?? 'normal',
    source: /** @type {'heading'} */ ('heading'),
    cls
  }
  if (cls === null) return fromHeading
  const theme = [...new Set(families.map((f) => String(f).replace(/["']/g, '').trim()))].find(
    (f) => classOfFamily(f) === cls
  )
  if (theme)
    return {
      family: `"${theme}"`,
      weight: cls === 'sans' ? '600' : '700',
      style: 'normal',
      source: 'theme',
      cls
    }
  const shipped = WORDMARK_FONTS[cls]
  return {
    family: `"${shipped.family}"`,
    weight: shipped.weight,
    style: 'normal',
    source: 'shipped',
    cls,
    file: shipped.file
  }
}

/** The smallest a wordmark's letters may be, in CSS pixels, before one line gives way to two. */
export const LEGIBLE_PX = 16

/**
 * How the template's logo sits in its box, read from its ink mask (`inkOf`), in CSS pixels of the box:
 * - `ink`: the box its ink fills, which the name's block is sized to fill the same way;
 * - `lines`: 2 when the ink stands in two bands of rows with a clear gap between, or, its bands touching (a script
 *   logo's loops run from one line into the next), when the ink is less than {@link ONE_LINE_ASPECT} times as wide as
 *   tall; else 1. A one-line logo is a long strip; a stacked one is near square.
 * - `cap`: an estimate of its letters' cap height, {@link CAP_OF_LINE} of one line's ink height (a line's ink runs
 *   from ascender to descender). An estimate: what it bounds is the floor the name may not shrink below.
 * Null when the mask has no ink.
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @param {{width: number, height: number}} box
 * @returns {{lines: 1 | 2, ink: {width: number, height: number}, cap: number} | null}
 */
export function logoLayoutOf(mask, width, height, box) {
  let x0 = width
  let x1 = -1
  let y0 = height
  let y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return null
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const rows = []
  for (let y = y0; y <= y1; y++) {
    let n = 0
    for (let x = x0; x <= x1; x++) n += mask[y * width + x]
    // A row crossed by a stray flourish only is a gap between lines, not ink of either.
    rows.push(n > bw * 0.02)
  }
  const bands = runsOf(rows).filter(([, length]) => length >= bh * 0.15)
  const lines = bands.length >= 2 || bw / bh < ONE_LINE_ASPECT ? 2 : 1
  const sx = box.width / width
  const sy = box.height / height
  const line = bands.length >= 2 ? Math.max(...bands.map(([, length]) => length)) : bh / lines
  return {
    lines,
    ink: { width: bw * sx, height: bh * sy },
    cap: Math.round(line * sy * CAP_OF_LINE * 10) / 10
  }
}

/** Under this width-to-height ratio of its ink, a logo whose lines touch reads as two lines stacked. */
export const ONE_LINE_ASPECT = 2.4

/** A line's cap height, as a share of its ink from ascender to descender. */
export const CAP_OF_LINE = 0.6

/**
 * The name's lines and size inside the logo's box.
 *
 * 🔒 THE TEMPLATE'S OWN LOGO SETS THE LINES AND THE SIZE (product owner, round 10, 24/10/2026), for every template,
 * with no table of them. Given its `layout` (`logoLayoutOf`): two balanced lines when it stands in two, else one;
 * the name's block fills the box the template's ink fills; and the letters never fall below its cap height
 * (`capRatio`, the chosen font's cap height per pixel of size, turns that into a size), even when the block then
 * runs past the box (`block` says how large to draw). With no layout (the template logo could not be read): one
 * line when it is legible in the box at the size the box allows, else two lines when they come out larger.
 *
 * `widths` are measured at 100px in the chosen font: the whole name (`one`) and, for each split after word k, the
 * two halves (`splits[k - 1]`).
 * @param {{words: string[], one: number, splits: Array<[number, number]>}} widths
 * @param {{width: number, height: number}} box - the logo's box, CSS pixels
 * @param {{legible?: number, lead?: number, layout?: {lines: 1 | 2, ink: {width: number, height: number}, cap: number} | null, capRatio?: number | null}} [options]
 * @returns {{lines: string[], size: number, block: {width: number, height: number}}} CSS pixels
 */
export function fitWordmark(
  widths,
  box,
  { legible = LEGIBLE_PX, lead = 1.2, layout = null, capRatio = null } = {}
) {
  const words = widths.words
  let k = 1
  let widest = Number.POSITIVE_INFINITY
  widths.splits.forEach(([a, b], i) => {
    if (Math.max(a, b) < widest) {
      widest = Math.max(a, b)
      k = i + 1
    }
  })
  const split = [words.slice(0, k).join(' '), words.slice(k).join(' ')]
  const answer = (/** @type {string[]} */ lines, /** @type {number} */ raw) => {
    const size = Math.floor(raw * 10) / 10
    const wide = lines.length === 2 ? widest : widths.one
    return {
      lines,
      size,
      block: { width: (wide * size) / 100, height: lines.length * lead * size }
    }
  }
  if (layout) {
    const two = layout.lines === 2 && words.length >= 2
    const room = layout.ink.width
    const tall = layout.ink.height
    const fill = two
      ? Math.min((room * 100) / Math.max(1, widest), tall / (2 * lead))
      : Math.min((room * 100) / Math.max(1, widths.one), tall / lead)
    const floor = capRatio && capRatio > 0 && layout.cap > 0 ? layout.cap / capRatio : 0
    return answer(two ? split : [words.join(' ')], Math.max(fill, floor))
  }
  const room = box.width * 0.94
  const tall = box.height * 0.84
  const one = Math.min((room * 100) / Math.max(1, widths.one), tall / lead)
  if (one >= legible || words.length < 2) return answer([words.join(' ')], one)
  const two = Math.min((room * 100) / Math.max(1, widest), tall / (2 * lead))
  // Two lines only when they are larger: a short, wide box sets one line bigger than two, legible or not.
  if (two <= one) return answer([words.join(' ')], one)
  return answer(split, two)
}
