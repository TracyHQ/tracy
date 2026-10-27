/** Bounded variants of a frozen source, using the existing Sharp crop/source-canvas helpers. */
import sharp from 'sharp'
import { cutForPlace, extendForPlace } from '../lib/picture-cut.js'

/** How many photos one `media.look` sheet shows, and how. */
export const LOOK_SHEET = { photos: 12, columns: 4, tile: { width: 300, height: 225 }, label: 28 }

/**
 * The research's photos on one sheet the agent can see, each tile numbered as `media.look` lists them — so a photo
 * goes where its subject fits (local round 21, 25/10/2026: with no caption on any photo, an EmDash bakery's plain
 * croissant showed a coloured wall and its macarons the cafe's chairs). A photo that does not decode is a grey tile.
 * @param {{ n: number, bytes: Buffer | null }[]} tiles
 * @returns {Promise<Buffer>} a JPEG.
 */
export async function agentContactSheet(tiles) {
  const { columns, tile, label } = LOOK_SHEET
  const rows = Math.max(1, Math.ceil(tiles.length / columns))
  const width = columns * tile.width
  const height = rows * (tile.height + label)
  const parts = []
  for (const [i, t] of tiles.entries()) {
    const left = (i % columns) * tile.width
    const top = Math.floor(i / columns) * (tile.height + label)
    let picture = null
    try {
      picture = t.bytes
        ? await sharp(t.bytes).rotate().resize(tile.width, tile.height, { fit: 'cover' }).jpeg().toBuffer()
        : null
    } catch {
      picture = null
    }
    parts.push({
      input: picture ?? {
        create: { width: tile.width, height: tile.height, channels: 3, background: '#9a9a9a' }
      },
      left,
      top
    })
    parts.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.width}" height="${label}"><rect width="100%" height="100%" fill="#111"/><text x="10" y="20" font-family="sans-serif" font-size="18" fill="#fff">${t.n}</text></svg>`
      ),
      left,
      top: top + tile.height
    })
  }
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(parts)
    .jpeg({ quality: 72 })
    .toBuffer()
}

const fail = (code, why = null) => Object.assign(new Error(code), { code, ...(why ? { why } : {}) })
const recipeFail = (why) => fail('AGENT_DEMO_IMAGE_RECIPE_INVALID', why)

/** A slot's shape as a number: `1.5`, `"3/2"` or `"3:2"` (the forms a slot's size is written in). */
function aspectOf(value) {
  if (typeof value === 'number') return value
  const m =
    typeof value === 'string' ? value.trim().match(/^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/) : null
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : Number.NaN
}

/** The largest box of `aspect` inside a `width × height` picture. */
function boxIn(width, height, aspect) {
  return width / height > aspect
    ? { width: Math.max(1, Math.round(height * aspect)), height }
    : { width, height: Math.max(1, Math.round(width / aspect)) }
}
const positiveSize = (size) =>
  size &&
  Number.isInteger(size.width) &&
  Number.isInteger(size.height) &&
  size.width > 0 &&
  size.height > 0 &&
  size.width <= 4096 &&
  size.height <= 4096 &&
  size.width * size.height <= 16_000_000
/** A size of `aspect` to the whole pixel: rounding either side by one pixel keeps it the same shape. */
const shaped = (size, aspect) =>
  Math.abs(size.width / size.height - aspect) <= Math.max(0.001, (1 + aspect) / size.height)
const allowed = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key))

/**
 * A plan owns the recipe. The import request selects only its row, never arbitrary dimensions/bytes/URLs.
 *
 * 🔒 THE SHAPE IS THE AGENT'S, THE ARITHMETIC IS TRACY'S (pilot 24/10/2026): every crop of a WordPress build was
 * refused with a bare code, because the agent wrote the slot's shape as "500/399", sent the whole picture's size
 * as `source` and asked an output larger than the crop. Those three are read here, the same way at plan.save and
 * at import: `aspect` may be written `"w/h"`; a `source` of another shape is the picture, and the crop is the
 * largest box of `aspect` inside it; an output larger than that box is brought down to it, never enlarged. A
 * recipe still unusable is refused with why.
 *
 * 🔒 WHOLE PIXELS ARE NOT A REFUSAL (Levain local round 18, 25/10/2026): a 942×881 photo for a 2000/800 band is brought
 * down to 942×377, which is 2.4987, not 2.5; the old 0.001 tolerance refused Tracy's own arithmetic with a message
 * about 4096 px, and the agent gave up on every photo. One pixel of rounding on either side is the slot's shape.
 */
export function agentImageRecipe(image, assetIds) {
  if (image === undefined) return null
  if (!allowed(image, ['assetId', 'crop', 'canvas']))
    throw recipeFail('image takes assetId, crop and an optional canvas, nothing else')
  if (!assetIds.includes(image.assetId)) throw recipeFail("image.assetId must be one of the row's assetIds")
  if (!allowed(image.crop, ['aspect', 'source', 'output', 'strategy', 'anchor']))
    throw recipeFail('image.crop takes aspect, source, output, strategy and an optional anchor')
  const crop = { ...image.crop, aspect: aspectOf(image.crop.aspect) }
  if (!Number.isFinite(crop.aspect) || crop.aspect <= 0)
    throw recipeFail('crop.aspect is the slot\'s width / height: a number such as 1.5, or "3/2"')
  const sized = (size) =>
    size && Number.isInteger(size.width) && Number.isInteger(size.height) && size.width > 0 && size.height > 0
  if (!sized(crop.source))
    throw recipeFail("crop.source is the picture's {width, height} in pixels, from the media catalogue")
  if (Math.abs(crop.source.width / crop.source.height - crop.aspect) > Math.max(0.02, 1 / crop.source.height))
    crop.source = boxIn(crop.source.width, crop.source.height, crop.aspect)
  if (!sized(crop.output)) throw recipeFail("crop.output is the slot's {width, height} in pixels")
  if (!shaped(crop.output, crop.aspect))
    throw recipeFail(
      `crop.output ${crop.output.width}×${crop.output.height} is not of crop.aspect ${crop.aspect.toFixed(4)}`
    )
  if (crop.output.width > crop.source.width || crop.output.height > crop.source.height)
    crop.output = { ...crop.source }
  if (!positiveSize(crop.output))
    throw recipeFail(
      `crop.output ${crop.output.width}×${crop.output.height} is over 4096 px a side or 16 MP; write the slot's size`
    )
  if (crop.source.width * crop.source.height > 100_000_000)
    throw recipeFail('crop.source is over 100 MP; it is the picture size from the media catalogue')
  if (!['attention', 'entropy', 'centre', 'anchor'].includes(crop.strategy))
    throw recipeFail('crop.strategy is attention, entropy, centre or anchor')
  if (
    crop.anchor !== undefined &&
    !['centre', 'centre-low', 'left', 'right', 'top', 'bottom'].includes(crop.anchor)
  )
    throw recipeFail('crop.anchor is centre, centre-low, left, right, top or bottom')
  if (image.canvas !== undefined) {
    const canvas = image.canvas
    if (
      !allowed(canvas, ['version', 'output', 'foreground', 'minimumSourceWidth']) ||
      canvas.version !== 1 ||
      !positiveSize(canvas.output) ||
      !allowed(canvas.foreground, ['width', 'height', 'left', 'top']) ||
      !positiveSize(canvas.foreground) ||
      !Number.isInteger(canvas.foreground.left) ||
      !Number.isInteger(canvas.foreground.top) ||
      !Number.isInteger(canvas.minimumSourceWidth) ||
      canvas.minimumSourceWidth < 1 ||
      canvas.minimumSourceWidth > 4096
    )
      throw recipeFail(
        'image.canvas is {version: 1, output, foreground: {width, height, left, top}, minimumSourceWidth}'
      )
  }
  return structuredClone({ ...image, crop })
}

export async function makeAgentImage(bytes, image) {
  try {
    const variant = image.canvas
      ? await extendForPlace(bytes, image.crop, image.canvas)
      : await cutForPlace(bytes, image.crop, { keepAlpha: true })
    if (variant.bytes.length > 8 * 1024 * 1024) throw fail('AGENT_DEMO_IMAGE_TOO_LARGE')
    return variant
  } catch (error) {
    throw fail(
      error.code === 'AGENT_DEMO_IMAGE_TOO_LARGE' ? error.code : 'AGENT_DEMO_IMAGE_RECIPE_UNAVAILABLE'
    )
  }
}
