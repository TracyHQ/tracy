/**
 * The customer's brand pictures: the logo (one or two variants) and the favicon of "Customize your site"
 * (plan `tasks/plan-ten-logo-favicon.md`, decisions Q4, U5, U7, D8).
 *
 *   checkBrandImage  the HARD check, run by the upload door (`sites/brand-files.js`) before a byte is kept
 *   prepareBrand     a logo fitted into the frame of the template's placement, and down to the height of its demo logo
 *                    where the template's CSS would show it at its own size, before a writer puts it on the site
 *
 * 🔒 PNG ONLY, BY ITS BYTES. The name and the declared type of an upload say nothing: an SVG renamed `.png` is still
 * an SVG (and can carry script), so only the PNG signature counts.
 * 🔒 NO FAVICON IS EVER MADE HERE. No favicon given means the template keeps its own icon (U7); a drawn or cut one
 * would be an icon the customer never chose.
 * The soft warnings (a logo that blends into its background) are the browser's (D8), not this file's.
 */
import sharp from 'sharp'

/** The largest file a brand picture may be. */
export const BRAND_MAX_BYTES = 8 * 1024 * 1024
/** The shortest a logo's long edge may be. */
export const LOGO_MIN_EDGE = 500
/** The smallest side of a (square) favicon. */
export const FAVICON_MIN_EDGE = 512
/** What an upload is for: a logo for light or dark backgrounds, the one logo, or the browser-tab icon. */
export const BRAND_ROLES = Object.freeze(['logo-light', 'logo-dark', 'logo', 'favicon'])
/** The longest edge `prepareBrand` lets a padded logo grow to; a bigger result is scaled down to it. */
const MAX_PADDED_EDGE = 4096

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** @param {Uint8Array} bytes */
const isPng = (bytes) => bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b)

/**
 * Check one uploaded picture for its role.
 *
 * Problem codes: `BAD_ROLE`, `TOO_LARGE`, `PNG_ONLY`, `PNG_UNREADABLE`, `LOGO_TOO_SMALL`, `FAVICON_NOT_SQUARE`,
 * `FAVICON_TOO_SMALL`. A file over the size cap is not decoded at all, so its size is not reported.
 * @param {Uint8Array} bytes
 * @param {string} role - one of `BRAND_ROLES`
 * @returns {Promise<{ ok: boolean, problems: string[], width: number | null, height: number | null }>}
 */
export async function checkBrandImage(bytes, role) {
  const verdict = (problems, width = null, height = null) => ({
    ok: problems.length === 0,
    problems,
    width,
    height
  })
  if (!BRAND_ROLES.includes(role)) return verdict(['BAD_ROLE'])
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(0)
  if (data.length > BRAND_MAX_BYTES) return verdict(isPng(data) ? ['TOO_LARGE'] : ['TOO_LARGE', 'PNG_ONLY'])
  if (!isPng(data)) return verdict(['PNG_ONLY'])
  let width = 0
  let height = 0
  try {
    // The header only: no pixel is decoded to answer the size.
    const meta = await sharp(data).metadata()
    if (meta.format !== 'png' || !meta.width || !meta.height) return verdict(['PNG_UNREADABLE'])
    width = meta.width
    height = meta.height
  } catch {
    return verdict(['PNG_UNREADABLE'])
  }
  const problems = []
  if (role === 'favicon') {
    if (width !== height) problems.push('FAVICON_NOT_SQUARE')
    else if (width < FAVICON_MIN_EDGE) problems.push('FAVICON_TOO_SMALL')
  } else if (Math.max(width, height) < LOGO_MIN_EDGE) problems.push('LOGO_TOO_SMALL')
  return verdict(problems, width, height)
}

/**
 * Pad one logo with transparency, centred, to the shape of `frame`. Nothing is cut and nothing is scaled unless the
 * result would pass `MAX_PADDED_EDGE`, so every opaque pixel of the logo is in the result.
 * @param {Uint8Array} bytes
 * @param {{ width: number, height: number }} frame
 */
async function padToFrame(bytes, frame) {
  const image = sharp(bytes).ensureAlpha()
  const { width, height } = await image.metadata()
  const want = frame.width / frame.height
  const outWidth = Math.max(width, Math.round(height * want))
  const outHeight = Math.max(height, Math.round(width / want))
  const left = Math.floor((outWidth - width) / 2)
  const top = Math.floor((outHeight - height) / 2)
  let padded = image.extend({
    left,
    right: outWidth - width - left,
    top,
    bottom: outHeight - height - top,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  if (Math.max(outWidth, outHeight) > MAX_PADDED_EDGE) {
    // `extend` and `resize` in one pipeline resize first; the padded picture is resized as a second step.
    padded = sharp(await padded.png().toBuffer()).resize({
      width: MAX_PADDED_EDGE,
      height: MAX_PADDED_EDGE,
      fit: 'inside'
    })
  }
  return padded.png().toBuffer()
}

/**
 * One logo scaled down, aspect and transparency kept, to `height` pixels; a logo no taller is returned as it came.
 * @param {Uint8Array} bytes
 * @param {number} height
 */
async function scaleToHeight(bytes, height) {
  const meta = await sharp(bytes).metadata()
  if (!meta.height || meta.height <= height) return bytes
  return sharp(bytes).ensureAlpha().resize({ height, withoutEnlargement: true }).png().toBuffer()
}

/** The height `prepareBrand` scales a logo down to, or null. */
const logoHeightOf = (profile) =>
  Number.isInteger(profile?.logoHeight) && profile.logoHeight > 0 ? profile.logoHeight : null

/** A frame `prepareBrand` can pad to, or null. */
function frameOf(profile) {
  const frame = profile?.frame
  return frame && Number(frame.width) > 0 && Number(frame.height) > 0
    ? { width: Number(frame.width), height: Number(frame.height) }
    : null
}

/**
 * The brand pack a writer puts on the site: each logo variant padded into the placement frame the template profile
 * names (`profile.frame`, `{ width, height }`), then scaled down to `profile.logoHeight` where the row sets one, the
 * favicon as given.
 * 🔒 THE LOGO HEIGHT IS FOR A TEMPLATE WHOSE CSS DOES NOT HOLD A LOGO: there the picture's own size is the size on the
 * page (JA Sensei 1.0.0 showed a 384 × 109 header logo where its demo's is 81 × 23), so the picture is made exactly as
 * tall as the demo logo, at one pixel per CSS pixel. A template that caps the logo itself (the re-releases that print
 * "max-height" on img.logo-img) has no `logoHeight` and gets the full picture, sharp on a dense screen. Keys absent from `pack` are absent from the
 * result: no logo given, no logo; no favicon given, no favicon (never a made one).
 * @param {{ name?: string, logo?: { light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array }, favicon?: Uint8Array }} pack
 * @param {{ frame?: { width: number, height: number }, logoHeight?: number } | null | undefined} profile
 * @returns {Promise<{ name?: string, logo?: { light?: Buffer, dark?: Buffer, single?: Buffer }, favicon?: Uint8Array }>}
 */
export async function prepareBrand(pack, profile) {
  /** @type {any} */
  const out = {}
  if (typeof pack?.name === 'string') out.name = pack.name
  const frame = frameOf(profile)
  const height = logoHeightOf(profile)
  const logo = pack?.logo
  if (logo && typeof logo === 'object') {
    const variants = {}
    for (const variant of ['light', 'dark', 'single']) {
      const bytes = logo[variant]
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) continue
      const fitted = frame ? await padToFrame(bytes, frame) : bytes
      variants[variant] = height ? await scaleToHeight(fitted, height) : fitted
    }
    if (Object.keys(variants).length) out.logo = variants
  }
  if (pack?.favicon instanceof Uint8Array && pack.favicon.length > 0) out.favicon = pack.favicon
  return out
}
