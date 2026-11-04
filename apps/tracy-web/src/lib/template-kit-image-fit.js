// Fit a kit image for the model (ADR 0041, #301). Kit pages are full-page captures, 1440 px wide and up to ten
// thousand tall. The Anthropic API refuses an image with a side over 8000 px, and once a request carries more than 20
// images every image must be at most 2000x2000 px. A planner run opens about forty images and every request sends
// the whole conversation again, so both limits are reached; a capture sent raw ends the run with an HTTP 400.
// Claude Code downsizes an image before sending it, which is how the approved reference runs saw the same kit.
//
// The caller has already checked the original bytes against the kit's sha256. A fitted image is written once, beside
// the originals, under a name holding the image id and that sha256, and read back on every later use.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/**
 * The longest side an image may have when it reaches the model: the provider's limit for a request with more than
 * 20 images (2000 px), which is also under its limit for any single image (8000 px).
 */
export const MAX_IMAGE_SIDE = 2000
/** JPEG quality of a fitted image: text in a capture stays readable. */
const JPEG_QUALITY = 85

const sizeOf = async (bytes) => {
  try {
    const { width, height } = await sharp(bytes).metadata()
    return width && height ? { width, height } : null
  } catch {
    return null
  }
}

/**
 * The image as the model should receive it. Inside MAX_IMAGE_SIDE on both sides: the same bytes. Larger: scaled down
 * to fit (aspect ratio kept, never enlarged), PNG for a PNG source and JPEG for any other, from the cache when it holds
 * the fitted file, else fitted now and cached. Bytes sharp cannot read go as they are, the way they always went.
 * @param {{ bytes: Buffer, mediaType: string, cacheFile: string }} image cacheFile has no extension; one is added
 * @returns {Promise<{ bytes: Buffer, mediaType: string, width?: number, height?: number,
 *   original?: { width: number, height: number } }>}
 */
export async function fittedImage({ bytes, mediaType, cacheFile }) {
  const original = await sizeOf(bytes)
  if (!original) return { bytes, mediaType }
  if (original.width <= MAX_IMAGE_SIDE && original.height <= MAX_IMAGE_SIDE)
    return { bytes, mediaType, ...original }

  const png = mediaType === 'image/png'
  const fitted = { mediaType: png ? 'image/png' : 'image/jpeg', original }
  const file = `${cacheFile}.${png ? 'png' : 'jpg'}`
  const cached = await readFile(file).catch(() => null)
  const cachedSize = cached && (await sizeOf(cached))
  if (cachedSize) return { ...fitted, bytes: cached, ...cachedSize }

  const resized = sharp(bytes).resize({
    width: MAX_IMAGE_SIDE,
    height: MAX_IMAGE_SIDE,
    fit: 'inside',
    withoutEnlargement: true
  })
  const { data, info } = await (png ? resized.png() : resized.jpeg({ quality: JPEG_QUALITY })).toBuffer({
    resolveWithObject: true
  })
  await writeOnce(file, data)
  return { ...fitted, bytes: data, width: info.width, height: info.height }
}

/** Write under a temporary name, then rename: a reader never sees half a file. A failed write only costs a refit. */
async function writeOnce(file, data) {
  const incoming = `${file}.incoming-${randomBytes(6).toString('hex')}`
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(incoming, data)
    await rename(incoming, file)
  } catch {
    await rm(incoming, { force: true })
  }
}
