/**
 * A photo's weight for the page it is uploaded to (spec TracyHQ/tracy#189, criterion 9.2): no wider than twice the widest
 * box the template shows it in, and no heavier than its byte budget (`picture-acceptance.mjs`), re-encoded as a JPEG at a
 * lower quality in turn until it is. A photo already within both is returned untouched, byte for byte. A clear-ground
 * picture (PNG) is never touched here: its alpha is the point of it.
 */
import sharp from 'sharp'
import {
  JPEG_QUALITIES,
  pictureByteBudget
} from 'website-opportunities/domain/pictures/picture-acceptance.mjs'

const MAX_PIXELS = 100_000_000

/**
 * @param {Buffer} bytes
 * @param {{ext: string, maxWidth: number}} input - `maxWidth`: `weightCapOf` of the picture's slots
 * @returns {Promise<{bytes: Buffer, width: number, height: number, quality: number | null, changed: boolean,
 *   budget: number}>}
 */
export async function weighed(bytes, { ext, maxWidth }) {
  const open = (/** @type {Buffer} */ b) => sharp(b, { limitInputPixels: MAX_PIXELS, failOn: 'none' })
  const meta = await open(bytes).metadata()
  const width0 = meta.width ?? 0
  const height0 = meta.height ?? 0
  const photo = ext === 'jpg' || ext === 'jpeg'
  const tooWide = Number(maxWidth) > 0 && width0 > maxWidth
  const width = tooWide ? Math.round(maxWidth) : width0
  const height = tooWide ? Math.max(1, Math.round((height0 * width) / width0)) : height0
  const budget = pictureByteBudget(width, height)
  if (!photo || !width0 || !height0 || (!tooWide && bytes.length <= budget))
    return { bytes, width: width0, height: height0, quality: null, changed: false, budget }
  let out = bytes
  let quality = JPEG_QUALITIES[0]
  for (const q of JPEG_QUALITIES) {
    quality = q
    out = await open(bytes)
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer()
    if (out.length <= budget) break
  }
  return { bytes: out, width, height, quality, changed: true, budget }
}
