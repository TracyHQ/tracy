/**
 * The picture a shared link previews (TCH #1013, D5): the customer's logo, centred on a plain card, as a PNG.
 *
 *   shareCardOf  the uploaded logos → one 1200 × 630 PNG, or null when no logo was given
 *
 * 🔒 ONLY FOR SHARING. The card never replaces a logo on the page; the writers put it where a social network reads
 * its preview (WordPress `tracy_share_image`, Joomla `other_shareImage`, EmDash `seo.defaultOgImage`).
 * 🔒 ALWAYS A PNG. Facebook, Zalo and X draw no SVG share picture, so a logo in any format sharp reads (PNG today, an
 * SVG if the upload door ever takes one) comes out as a PNG. A transparent logo lands on a plain background: a
 * transparent share picture shows black on some networks.
 * 🔒 THE SHAPE SOCIAL NETWORKS ASK FOR. 1200 × 630 (1.91 : 1) is the size Facebook and LinkedIn crop to; the logo sits
 * inside a margin, so a network that crops the card to a square still shows it whole when the logo is not too wide.
 */
import sharp from 'sharp'

/** The card's size. */
export const SHARE_CARD = Object.freeze({ width: 1200, height: 630 })
/** The box the logo is fitted into, centred on the card. */
const LOGO_BOX = Object.freeze({ width: 840, height: 380 })
/** The card behind a logo drawn for light backgrounds, and behind one drawn for dark backgrounds. */
const BACKGROUND = Object.freeze({
  light: { r: 255, g: 255, b: 255, alpha: 1 },
  dark: { r: 24, g: 24, b: 27, alpha: 1 }
})
/** How sharply an SVG is drawn before it is fitted (a plain 72 dpi render of a small viewBox would blur). */
const SVG_DENSITY = 300

/** Whether the bytes are an SVG document rather than a raster picture. */
const isSvg = (/** @type {Uint8Array} */ bytes) =>
  /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    Buffer.from(bytes.subarray(0, 512)).toString('utf8')
  )

/**
 * The logo a card shows and the background it goes on: the one logo or the light-background one on white, else the
 * dark-background one on near-black.
 * @param {{ light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array } | undefined} logos
 * @returns {{ bytes: Uint8Array, background: { r: number, g: number, b: number, alpha: number } } | null}
 */
export function shareLogoOf(logos) {
  const usable = (/** @type {unknown} */ b) => b instanceof Uint8Array && b.length > 0
  if (usable(logos?.single))
    return { bytes: /** @type {Uint8Array} */ (logos?.single), background: BACKGROUND.light }
  if (usable(logos?.light))
    return { bytes: /** @type {Uint8Array} */ (logos?.light), background: BACKGROUND.light }
  if (usable(logos?.dark))
    return { bytes: /** @type {Uint8Array} */ (logos?.dark), background: BACKGROUND.dark }
  return null
}

/**
 * The share card of the customer's logos, or null when none was given or none can be read (the site then keeps what
 * it shares today: nothing changes).
 * @param {{ light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array } | undefined} logos
 * @returns {Promise<Buffer | null>}
 */
export async function shareCardOf(logos) {
  const chosen = shareLogoOf(logos)
  if (!chosen) return null
  try {
    const input = isSvg(chosen.bytes) ? sharp(chosen.bytes, { density: SVG_DENSITY }) : sharp(chosen.bytes)
    const fitted = await input
      .ensureAlpha()
      .resize({ ...LOGO_BOX, fit: 'inside', withoutEnlargement: !isSvg(chosen.bytes) })
      .png()
      .toBuffer()
    return await sharp({ create: { ...SHARE_CARD, channels: 4, background: chosen.background } })
      .composite([{ input: fitted, gravity: 'centre' }])
      .flatten({ background: chosen.background })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}
