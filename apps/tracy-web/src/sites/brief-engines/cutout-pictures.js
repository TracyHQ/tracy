/**
 * The pictures of the cut-out ladder (spec TracyHQ/tracy#189, `website-opportunities/domain/cutout-ladder.mjs`), made at
 * the size of the slot's frame so the site takes them as the demo's figure was taken:
 *
 *   own      the owner's transparent picture, trimmed to its visible pixels and stood where the demo's figure stood (its
 *            footprint): never larger than that place, never covering more of the frame than the figure's own pixels did,
 *            on the footprint's bottom edge and on its side of the frame (a figure on the right stays on the right)
 *   framed   an ordinary photo, cover-cropped around its focus into a rounded frame with a soft shadow, on a clear ground
 *            inside the figure's box (the site refuses an opaque picture in a cut-out slot; clear corners pass)
 *   off      a clear picture of the frame's size; the head block hides it, so no empty box is left (`cutout-css.js`)
 *
 * 🔒 NOTHING HERE DRAWS OR REMOVES A GROUND: every pixel shown is the owner's own.
 */
import sharp from 'sharp'

const MAX_PIXELS = 100_000_000
const PNG = { compressionLevel: 9 }
/** The share of the frame's short side left round the photo for its shadow, and the corner radius. */
const MARGIN_SHARE = 0.05
const RADIUS_SHARE = 0.035

const open = (/** @type {Uint8Array} */ bytes) =>
  sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })
const clear = (/** @type {number} */ width, /** @type {number} */ height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })

/**
 * The box of a picture's visible pixels (alpha above a trace) and how many there are, or null when it has none.
 * @param {Uint8Array} bytes
 */
export async function visibleBox(bytes) {
  const { data, info } = await open(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  let count = 0
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1)
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        count += 1
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  return right < 0
    ? null
    : { left, top, width: right - left + 1, height: bottom - top + 1, count, frame: info.width * info.height }
}

/**
 * Where the demo's figure stands in its frame: the box of its visible pixels as shares of the frame, and `fill`, the
 * share of the frame its pixels cover.
 * @param {Uint8Array | null} bytes - the demo file
 * @returns {Promise<{left: number, top: number, width: number, height: number, fill: number} | null>}
 */
export async function footprintOf(bytes) {
  if (!bytes) return null
  const meta = await open(bytes)
    .metadata()
    .catch(() => null)
  if (!meta?.width || !meta?.height || !meta.hasAlpha) return null
  const box = await visibleBox(bytes).catch(() => null)
  if (!box) return null
  return {
    left: box.left / meta.width,
    top: box.top / meta.height,
    width: box.width / meta.width,
    height: box.height / meta.height,
    fill: box.count / box.frame
  }
}

/**
 * The owner's transparent picture stood in the demo figure's place.
 * @param {Uint8Array} bytes - the owner's picture (clear ground)
 * @param {number} width - the frame
 * @param {number} height
 * @param {{left: number, top: number, width: number, height: number, fill?: number} | null} footprint
 * @returns {Promise<Buffer>}
 */
export async function ownCutOutPicture(bytes, width, height, footprint = null) {
  const png = await open(bytes).ensureAlpha().png().toBuffer()
  const box = await visibleBox(png)
  if (!box) return clear(width, height).png(PNG).toBuffer()
  const foot = footprint ?? { left: 0, top: 0, width: 1, height: 1, fill: 1 }
  const area = {
    left: Math.round(foot.left * width),
    top: Math.round(foot.top * height),
    width: Math.max(1, Math.round(foot.width * width)),
    height: Math.max(1, Math.round(foot.height * height))
  }
  // As large as the place holds, and never covering more of the frame than the demo figure's own pixels did.
  const fitScale = Math.min(area.width / box.width, area.height / box.height)
  const budget = (foot.fill ?? 1) * width * height
  const coverScale = Math.sqrt(budget / Math.max(1, box.count))
  const scale = Math.min(fitScale, coverScale)
  const w = Math.max(1, Math.min(area.width, Math.round(box.width * scale)))
  const h = Math.max(1, Math.min(area.height, Math.round(box.height * scale)))
  const object = await sharp(png)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(w, h, { fit: 'fill' })
    .png()
    .toBuffer()
  // On the footprint's side of the frame: a figure right of centre keeps to the right edge of its place.
  const centre = foot.left + foot.width / 2
  const left =
    centre > 0.55
      ? area.left + area.width - w
      : centre < 0.45
        ? area.left
        : area.left + Math.round((area.width - w) / 2)
  return clear(width, height)
    .composite([
      {
        input: object,
        left: Math.max(0, Math.min(width - w, left)),
        top: Math.max(0, Math.min(height - h, area.top + area.height - h))
      }
    ])
    .png(PNG)
    .toBuffer()
}

/**
 * An ordinary photo in a frame: cover-cropped around its focus, rounded corners, a soft shadow, a clear ground.
 * @param {Uint8Array} bytes
 * @param {number} width - the frame (the slot's box shape)
 * @param {number} height
 * @returns {Promise<Buffer>}
 */
export async function framedPicture(bytes, width, height) {
  const short = Math.min(width, height)
  const margin = Math.max(4, Math.round(short * MARGIN_SHARE))
  const inner = { width: width - 2 * margin, height: height - 2 * margin }
  const radius = Math.max(6, Math.round(short * RADIUS_SHARE))
  const photo = await open(bytes)
    .rotate()
    .resize(inner.width, inner.height, { fit: 'cover', position: sharp.strategy.attention })
    .ensureAlpha()
    .png()
    .toBuffer()
  const rounded = Buffer.from(
    `<svg width="${inner.width}" height="${inner.height}"><rect width="${inner.width}" height="${inner.height}" rx="${radius}" ry="${radius}"/></svg>`
  )
  const shaped = await sharp(photo)
    .composite([{ input: rounded, blend: 'dest-in' }])
    .png()
    .toBuffer()
  const blur = Math.max(1, margin / 2.5)
  const shadow = await sharp(
    Buffer.from(
      `<svg width="${width}" height="${height}"><rect x="${margin}" y="${margin + Math.round(margin / 3)}" width="${inner.width}" height="${inner.height}" rx="${radius}" ry="${radius}" fill="rgb(0,0,0)" fill-opacity="0.28"/></svg>`
    )
  )
    .blur(blur)
    .png()
    .toBuffer()
  return clear(width, height)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: shaped, left: margin, top: margin }
    ])
    .png(PNG)
    .toBuffer()
}
