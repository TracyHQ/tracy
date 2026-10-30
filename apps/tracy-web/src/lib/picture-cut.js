/**
 * A collected picture measured and cut for a demo picture's place (the picture planner's eyes and hands; the plan itself is
 * the Website Opportunities domain's `pictures/placement.mjs`).
 *
 *   measure  dHash (64 bits, 9×8 grey), the share of the two most common tones and the edge density (64×64 grey, the
 *            graphic detector of plan §7 C10) and the centre's mean luminance — a few ms per picture
 *   cut      the planner's crop at the planner's size: `attention` for food, a little low for people, the centre
 *            otherwise; never enlarged, always a JPEG named by the sha256 of its own bytes (the Apply door's rule)
 *   fill     a neutral placeholder in the brand's colours for a place nothing fits (C6), never another restaurant's photo
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const MAX_PIXELS = 100_000_000
const JPEG = { quality: 84, mozjpeg: false }
const PNG = { compressionLevel: 9 }
/** A Laplacian response past this (0–255 scale) is an edge. */
const EDGE = 48
/** An alpha value below this in a corner makes the picture a cut-out. */
const OPAQUE = 250

const open = (bytes) => sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{dhash: string, top2Share: number, edgeDensity: number, centreLuminance: number}>}
 */
export async function pictureFeatures(bytes) {
  const tiny = await open(bytes).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let hash = 0n
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) hash = (hash << 1n) | (tiny[y * 9 + x] > tiny[y * 9 + x + 1] ? 1n : 0n)
  const size = 64
  const grey = await open(bytes).greyscale().resize(size, size, { fit: 'fill' }).raw().toBuffer()
  const bins = new Array(16).fill(0)
  for (const v of grey) bins[v >> 4] += 1
  bins.sort((a, b) => b - a)
  let edges = 0
  for (let y = 1; y < size - 1; y += 1)
    for (let x = 1; x < size - 1; x += 1) {
      const at = y * size + x
      const lap = Math.abs(4 * grey[at] - grey[at - 1] - grey[at + 1] - grey[at - size] - grey[at + size])
      if (lap > EDGE) edges += 1
    }
  let centre = 0
  let n = 0
  for (let y = size / 4; y < (size * 3) / 4; y += 1)
    for (let x = size / 4; x < (size * 3) / 4; x += 1) {
      centre += grey[y * size + x]
      n += 1
    }
  return {
    dhash: hash.toString(16).padStart(16, '0'),
    top2Share: Number(((bins[0] + bins[1]) / grey.length).toFixed(4)),
    edgeDensity: Number((edges / ((size - 2) * (size - 2))).toFixed(4)),
    centreLuminance: Number((centre / n / 255).toFixed(4))
  }
}

/**
 * Whether a demo picture is a cut-out: true when a corner is transparent, false when it is opaque (or has no alpha), null
 * when it cannot be read. Needs the whole file, not a header.
 * @param {Uint8Array} bytes
 * @returns {Promise<boolean | null>}
 */
export async function demoTransparency(bytes) {
  try {
    const meta = await open(bytes).metadata()
    if (!meta.width || !meta.height) return null
    if (!meta.hasAlpha) return false
    const { data, info } = await open(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + info.channels - 1]
    const w = info.width - 1
    const h = info.height - 1
    return [alphaAt(0, 0), alphaAt(w, 0), alphaAt(0, h), alphaAt(w, h)].some((a) => a < OPAQUE)
  } catch {
    return null
  }
}

/**
 * Where a crop of `box` sits inside `width × height` for an anchor, or at `share` of the free room (a subject crop, #136:
 * the fill plan placed it around the subject and every face, as a share so a smaller copy keeps the same place).
 */
function placeOf(width, height, box, anchor, share = null) {
  const free = { x: width - box.width, y: height - box.height }
  const at = share ? { x: share.x, y: share.y } : { x: 0.5, y: 0.5 }
  if (anchor === 'centre-low') at.y = 0.6
  if (anchor === 'left') at.x = 0
  if (anchor === 'right') at.x = 1
  if (anchor === 'top') at.y = 0
  if (anchor === 'bottom') at.y = 1
  return {
    left: Math.round(free.x * at.x),
    top: Math.round(free.y * at.y),
    width: box.width,
    height: box.height
  }
}

/**
 * Cut a picture to the planner's crop and size.
 * `keepAlpha` keeps a cut-out (`demoTransparency`) transparent, PNG out: as JPEG a logo's clear ground turns black
 * (q. patisserie, local round 24, 25/10/2026: a PNG logo became a black block in a light header).
 * @param {Uint8Array} bytes
 * @param {{aspect: number, source: {width: number, height: number}, output: {width: number, height: number},
 *   strategy: 'attention' | 'entropy' | 'centre' | 'anchor' | 'subject', anchor?: string,
 *   at?: {x: number, y: number}}} crop
 * @param {{keepAlpha?: boolean}} [opts]
 * @returns {Promise<{bytes: Buffer, ext: 'jpg' | 'png', width: number, height: number, sha256: string, rect: object | null}>}
 */
export async function cutForPlace(bytes, crop, { keepAlpha = false } = {}) {
  const meta = await open(bytes).rotate().metadata()
  const turned = (meta.orientation ?? 1) >= 5
  const width = turned ? meta.height : meta.width
  const height = turned ? meta.width : meta.height
  if (!width || !height) throw new Error('the picture has no readable size')
  // A crop larger than the picture shrinks by ONE factor: clamped side by side it would change shape, and the `fill` below
  // would then stretch the picture (a size stored before EXIF turning, 19/10/2026: a 4:3 box stretched to 16:9).
  const fit = Math.min(1, width / crop.source.width, height / crop.source.height)
  const box =
    fit < 1
      ? {
          width: Math.max(1, Math.floor(crop.source.width * fit)),
          height: Math.max(1, Math.floor(crop.source.height * fit))
        }
      : { width: crop.source.width, height: crop.source.height }
  if (crop.output.width > box.width || crop.output.height > box.height)
    throw new Error('the place would enlarge the picture, which is never done')
  let image = open(bytes).rotate()
  let rect = null
  if (crop.strategy === 'attention' || crop.strategy === 'entropy') {
    // `cover` at the crop's own size is a crop with no scaling: the box is the largest of its shape inside the picture.
    image = sharp(
      await image
        .resize(box.width, box.height, { fit: 'cover', position: sharp.strategy[crop.strategy] })
        .toBuffer()
    )
  } else {
    const share = crop.strategy === 'subject' ? crop.at : null
    rect = placeOf(width, height, box, crop.strategy === 'anchor' ? crop.anchor : 'centre', share)
    image = sharp(await image.extract(rect).toBuffer())
  }
  // Only a cut-out stays PNG: an opaque photo that merely carries an alpha channel is a JPEG, or it weighs megabytes
  // (local round 26, 25/10/2026: a 1.2 MB PNG masthead).
  const alpha = keepAlpha && meta.hasAlpha === true && (await demoTransparency(bytes)) === true
  const sized = image.resize(crop.output.width, crop.output.height, { fit: 'fill' })
  const out = await (alpha ? sized.png(PNG) : sized.jpeg(JPEG)).toBuffer()
  return {
    bytes: out,
    ext: alpha ? 'png' : 'jpg',
    width: crop.output.width,
    height: crop.output.height,
    sha256: createHash('sha256').update(out).digest('hex'),
    rect,
    recipe: {
      version: 'sharp-source-variant/1',
      crop: structuredClone(crop),
      rect,
      effects: 'preserve-source',
      encoder: {
        ...(alpha ? { format: 'png', ...PNG } : { format: 'jpeg', ...JPEG }),
        sharp: sharp.versions.sharp,
        vips: sharp.versions.vips
      }
    }
  }
}

/** Extend a decorative frame using only the same source; the sharp foreground is never enlarged. */
export async function extendForPlace(bytes, crop, canvas) {
  const { output, foreground } = canvas
  if (
    canvas.version !== 1 ||
    !Number.isFinite(canvas.minimumSourceWidth) ||
    canvas.minimumSourceWidth <= 0 ||
    ![
      output.width,
      output.height,
      foreground.width,
      foreground.height,
      foreground.left,
      foreground.top
    ].every(Number.isInteger) ||
    output.width <= 0 ||
    output.height <= 0 ||
    output.width * output.height > MAX_PIXELS ||
    foreground.width < output.width / 2 ||
    foreground.height !== output.height ||
    foreground.top !== 0 ||
    foreground.left !== Math.floor((output.width - foreground.width) / 2) ||
    foreground.left < 0 ||
    foreground.width !== crop.output.width ||
    foreground.height !== crop.output.height
  )
    throw new Error('invalid source canvas recipe')
  const meta = await open(bytes).metadata()
  const turned = (meta.orientation ?? 1) >= 5
  const width = turned ? meta.height : meta.width,
    height = turned ? meta.width : meta.height
  const scale = Math.min(1, width / crop.source.width, height / crop.source.height)
  if (
    !width ||
    !height ||
    Math.floor(crop.source.width * scale) < canvas.minimumSourceWidth ||
    Math.floor(crop.source.width * scale) * Math.floor(crop.source.height * scale) < (width * height) / 2
  )
    throw new Error('source canvas would discard too much of the photograph')
  const clear = await cutForPlace(bytes, crop)
  const sigma = Math.max(1, Math.min(32, Math.round(output.height / 12)))
  const background = await open(bytes)
    .rotate()
    .resize(output.width, output.height, { fit: 'cover' })
    .blur(sigma)
    .toBuffer()
  const out = await sharp(background)
    .composite([{ input: clear.bytes, left: foreground.left, top: foreground.top }])
    .jpeg(JPEG)
    .toBuffer()
  return {
    ...clear,
    bytes: out,
    width: output.width,
    height: output.height,
    sha256: createHash('sha256').update(out).digest('hex'),
    recipe: {
      version: 'sharp-source-canvas/1',
      sourceHash: createHash('sha256').update(bytes).digest('hex'),
      crop: clear.recipe,
      output,
      foreground,
      minimumSourceWidth: canvas.minimumSourceWidth,
      background: { effect: 'blurred-source', sigma },
      generatedScene: false,
      encoder: clear.recipe.encoder
    }
  }
}

const HEX = /^#?([0-9a-f]{6})$/i
/** A soft diagonal of the brand's first two colours; a warm grey when the brand has none. */
export async function placeholderPicture({ width, height, colours = [] }) {
  const pick = colours.map((c) => HEX.exec(String(c))?.[1]).filter(Boolean)
  const [a, b] = [pick[0] ?? 'd9d4cc', pick[1] ?? pick[0] ?? 'efebe5']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${a}"/><stop offset="1" stop-color="#${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  const out = await sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' }).jpeg(JPEG).toBuffer()
  return { bytes: out, ext: 'jpg', width, height, sha256: createHash('sha256').update(out).digest('hex') }
}

export { initialsAvatar } from './initials-avatar.js'
