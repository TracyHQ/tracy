// Validate the image a spot actually writes, independently of the agent's declared shown variant.
import sharp from 'sharp'
import { LOGO_BLOCK_SHARE, LOGO_GONE_RATIO } from '../site-check/theme-reads.js'

export const BRAND_SPOT_CHECK = 'brand-spot-check/1'

const luminance = (rgb) =>
  rgb.reduce((sum, value, i) => {
    const c = value / 255
    return sum + [0.2126, 0.7152, 0.0722][i] * (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  }, 0)

/** The existing site-check ink rule, on the kit's known solid ground before any site write. */
export function spotInk(data, ground) {
  const bg = luminance([1, 3, 5].map((i) => Number.parseInt(ground.slice(i, i + 2), 16)))
  let ink = 0
  let under = 0
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 128) continue
    ink++
    const fg = luminance([data[p], data[p + 1], data[p + 2]])
    if ((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) < LOGO_GONE_RATIO) under++
  }
  return { ink, under2: ink ? under / ink : 0 }
}

/** Exact decoded pixels transfer a source's independent review through the tool's lossless contain operation. */
async function isFittedSource(bytes, source, width, height) {
  const cropped = await sharp(source).trim({ threshold: 0 }).png().toBuffer()
  for (const position of ['left', 'centre']) {
    const expected = await sharp(cropped)
      .resize(width, height, {
        fit: 'contain',
        position,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .ensureAlpha()
      .raw()
      .toBuffer()
    if (bytes.equals(expected)) return true
  }
  return false
}

/** Manually fitted assets remain valid when their own final file has an independent passing look. */
export async function checkSpotImages(ctx) {
  const { L, spots, files, norm, lastLookOn, sideMark, bad } = ctx
  for (const [i, spot] of (Array.isArray(L.spots) ? L.spots : []).entries()) {
    const kit = spots.find((x) => x.id === spot.spot)
    if (!kit || typeof spot.file !== 'string' || !files.has(norm(spot.file))) continue
    const field = `logo.spots[${i}].file`
    const side = kit.ground.side
    const source =
      spot.shows === 'mark'
        ? sideMark(side)
        : spot.shows === 'logo'
          ? L.logos?.[side]
          : L.logos?.twoLines?.[side]
    if (typeof source !== 'string' || !files.has(norm(source))) {
      bad(field, 'the shown variant has no source on this ground side')
      continue
    }
    try {
      const { data, info } = await sharp(await files.read(norm(spot.file)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const width = kit.width * 2
      const height = kit.height * 2
      if (info.width !== width || info.height !== height) {
        bad(
          field,
          `the actual image is ${info.width}x${info.height}; fit to the spot at 2x (${width}x${height})`
        )
        continue
      }
      const ground = kit.ground.colour.toLowerCase()
      const ownLook = lastLookOn.get(`${norm(spot.file)}@${ground}`) === 'pass'
      // An unrelated passing side mark never covers a different spot file. A tool-fitted copy can reuse
      // the exact source's independent look; an independently prepared file needs its own look.
      const sideGround =
        ctx.K?.site?.brandColours?.sides?.find((x) => x.groundSide === side)?.ground?.toLowerCase() ?? ground
      const sourceLook = lastLookOn.get(`${norm(source)}@${sideGround}`) === 'pass'
      const samePixels = await isFittedSource(data, await files.read(norm(source)), width, height)
      if (!ownLook && !(sourceLook && samePixels))
        bad(
          field,
          'the actual spot file needs a passing look_logo on its kit ground, or must be the fitted copy of that reviewed side variant'
        )
      // When the agent claims a mark, it cannot substitute the opposite side's raw mark for the selected one.
      if (
        spot.shows === 'mark' &&
        !samePixels &&
        norm(spot.file) === norm(sideMark(side === 'light' ? 'dark' : 'light')) &&
        norm(source) !== norm(spot.file)
      )
        bad(field, 'this is the other ground side mark; fit the selected mark for this side')
      const measured = spotInk(data, ground)
      if (!measured.ink) bad(field, 'the actual spot image has no visible ink')
      else if (measured.under2 > LOGO_BLOCK_SHARE)
        bad(
          field,
          `${Math.round(measured.under2 * 100)}% of the actual spot ink is under ${LOGO_GONE_RATIO}:1 on ${ground}; the site check blocks above ${LOGO_BLOCK_SHARE * 100}%`
        )
    } catch {
      bad(field, 'the actual spot file or shown source is not a readable image')
    }
  }
}
