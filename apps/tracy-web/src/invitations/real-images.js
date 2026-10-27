import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { realError } from './real-store.js'

// Serialize this decoder without changing sharp's process-wide settings.
let pending = Promise.resolve()
export function decodeEmailImage({ bytes }) {
  const next = pending.then(() => decode(bytes))
  pending = next.catch(() => {})
  return next
}
async function decode(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) throw realError('REAL_IMAGE_LIMIT')
  const format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'jpeg'
      : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))
        ? 'gif'
        : null
  if (!format) throw realError('REAL_IMAGE_FORMAT')
  try {
    const image = sharp(bytes, { animated: true, limitInputPixels: 20_000_000, failOn: 'warning' })
    const meta = await image.metadata()
    const frames = meta.pages ?? 1,
      width = meta.width,
      height = meta.pageHeight ?? meta.height
    if (meta.format !== format || !width || !height || frames > 100 || width * height * frames > 20_000_000)
      throw realError('REAL_IMAGE_LIMIT')
    const stored = await image[format](
      format === 'gif' ? { interPaletteMaxError: 0, interFrameMaxError: 0 } : {}
    ).toBuffer()
    if (stored.length > 2 * 1024 * 1024) throw realError('REAL_IMAGE_LIMIT')
    const after = await sharp(stored, { animated: true }).metadata()
    if ((after.pages ?? 1) !== frames) throw realError('REAL_IMAGE_ANIMATION')
    return {
      bytes: stored,
      mediaType: `image/${format}`,
      width,
      height,
      frames,
      sha256: createHash('sha256').update(stored).digest('hex')
    }
  } catch (error) {
    if (error.code?.startsWith('REAL_')) throw error
    throw realError('REAL_IMAGE_INVALID')
  }
}
