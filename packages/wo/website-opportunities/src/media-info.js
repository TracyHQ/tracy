/** Size and a small colour palette of a downloaded image, the brand observation's input; and what the picture planner reads. */
import sharp from 'sharp'
import { requireHost } from './host.js'

const MAX_PIXELS = 100_000_000

/**
 * The measuring function, with the picture planner's numbers from `host.pictureFeatures`.
 * @param {Pick<import('./host.js').WoHost, 'pictureFeatures'>} host
 * @returns {(bytes: Uint8Array) => ReturnType<typeof measure>}
 */
export function imageInfoWith(host) {
  const { pictureFeatures } = requireHost(host, ['pictureFeatures'])
  return (bytes) => measure(bytes, pictureFeatures)
}

/**
 * @param {Uint8Array} bytes
 * @param {import('./host.js').WoHost['pictureFeatures']} pictureFeatures
 * @returns {Promise<{ width: number | null, height: number | null, palette: {r: number, g: number, b: number, weight: number}[],
 *   dhash: string | null, features: {top2Share: number, edgeDensity: number, centreLuminance: number} | null }>}
 */
async function measure(bytes, pictureFeatures) {
  const input = Buffer.from(bytes)
  const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata()
  const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .resize(16, 16, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  // The planner's numbers are a bonus: a picture they cannot be read from is still stored.
  const measured = await pictureFeatures(input).catch(() => null)
  // The size as the picture is shown: a phone photo stored on its side says so in EXIF, and every cut turns it upright
  // (`cutForPlace`), so a crop planned from the stored size would be the wrong shape.
  const turned = (meta.orientation ?? 1) >= 5
  return {
    width: (turned ? meta.height : meta.width) ?? null,
    height: (turned ? meta.width : meta.height) ?? null,
    palette: paletteOf(data, info.channels),
    dhash: measured?.dhash ?? null,
    features: measured ? featuresOf(measured) : null
  }
}

/** The measured numbers as `wo_media.labels.features` keeps them, with the version of the measuring. */
export function featuresOf({ top2Share, edgeDensity, centreLuminance }) {
  return { v: 1, top2Share, edgeDensity, centreLuminance }
}

/**
 * The `top` most frequent colours of raw pixels, quantised to 4 bits per channel. With 4 channels the fourth is alpha,
 * and a pixel less than half opaque is no colour of the picture (a logo's transparent background).
 */
export function paletteOf(data, channels = 3, { top = 8 } = {}) {
  const buckets = new Map()
  const pixels = Math.floor(data.length / channels)
  let counted = 0
  for (let i = 0; i < pixels; i += 1) {
    const at = i * channels
    if (channels === 4 && data[at + 3] < 128) continue
    counted += 1
    const key = ((data[at] >> 4) << 8) | ((data[at + 1] >> 4) << 4) | (data[at + 2] >> 4)
    const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    b.r += data[at]
    b.g += data[at + 1]
    b.b += data[at + 2]
    b.n += 1
    buckets.set(key, b)
  }
  return [...buckets.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, top)
    .map((b) => ({
      r: Math.round(b.r / b.n),
      g: Math.round(b.g / b.n),
      b: Math.round(b.b / b.n),
      weight: Number((b.n / (counted || 1)).toFixed(4))
    }))
}

const LOGO_EDGE = 64
const LOGO_TOP = 24

/**
 * The colours of a logo, finer than a photo's 16 x 16 palette: a small accent (a gold line of about 5% of a logo) is
 * averaged away at 16 x 16 (Harbour Sport Club, #1780 item 15). Sampled at 64 px by nearest pixel, so an edge never
 * blends two brand colours into a third; transparent pixels are left out. Null when the picture cannot be read.
 * @param {Uint8Array} bytes
 * @returns {Promise<{r: number, g: number, b: number, weight: number}[] | null>}
 */
export async function logoPaletteOf(bytes) {
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })
      .rotate()
      .resize(LOGO_EDGE, LOGO_EDGE, { fit: 'inside', kernel: 'nearest' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const palette = paletteOf(data, info.channels, { top: LOGO_TOP })
    return palette.length ? palette : null
  } catch {
    return null
  }
}
