/**
 * Size and brightness of a demo logo picture, the two facts the logo rules read off a picture:
 * REL-3 (a light picture means the template shows it on a dark background) and LOGO-3 (how tall
 * the demo logo is). Brightness is the mean luminance of the opaque pixels, 0 to 255, the measure
 * `brand-joomla-places.js` was built on (above 180 is a light picture).
 *
 * `sharp` is loaded on first use, so a check that never reads a picture never needs it; a picture
 * that cannot be decoded answers null and the rule reports that part as `live-only`. A MISSING
 * `sharp` is not such a picture: it throws `MissingPictureLibraryError`, which stops the whole
 * check, because answering null there would quietly turn LOGO-3 / REL-3 into `live-only` on a
 * machine whose install lacks the library (seen 12/10/2026 in scratch trees that linked only the
 * root node_modules), while the server, which has it, reports FAIL.
 */

/** Above this mean luminance a logo is a light picture, drawn for a dark background. */
export const LIGHT_PICTURE = 180

/**
 * The width and height a Joomla media value states (`images/a.png#joomlaImage://local-images/a.png?width=352&height=100`),
 * and the file path without that suffix.
 * @param {unknown} value
 */
export function joomlaImageValue(value) {
  const text = String(value ?? '')
  const [file, hint = ''] = text.split('#')
  const width = Number(/[?&]width=(\d+)/.exec(hint)?.[1])
  const height = Number(/[?&]height=(\d+)/.exec(hint)?.[1])
  return {
    file: decodeURIComponent(file.trim()).replace(/^\/+/, ''),
    hint: width > 0 && height > 0 ? { width, height } : null
  }
}

/** The picture library cannot be loaded: the check must stop instead of reporting a picture it could not read. */
export class MissingPictureLibraryError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super(
      `sharp is not installed: run pnpm install in apps/tracy-web (the logo rules read pictures with it): ${cause instanceof Error ? cause.message : String(cause)}`
    )
    this.name = 'MissingPictureLibraryError'
    this.cause = cause
  }
}

/** @type {Promise<any> | null} */
let sharpLoaded = null

/** Loads `sharp` once; a failure is a MissingPictureLibraryError, never a null picture. */
const importSharp = () => import('sharp').then((m) => m.default)

/**
 * @param {Buffer} bytes
 * @param {{ load?: () => Promise<any> }} [options] `load`: replaces the library import (tests)
 * @returns {Promise<{ width: number, height: number, luminance: number | null } | null>}
 */
export async function pictureFacts(bytes, { load } = {}) {
  let sharp
  try {
    if (load) sharp = await load()
    else {
      sharpLoaded ??= importSharp()
      sharp = await sharpLoaded
    }
  } catch (e) {
    if (!load) sharpLoaded = null
    throw new MissingPictureLibraryError(e)
  }
  try {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let sum = 0
    let opaque = 0
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] <= 127) continue
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      opaque += 1
    }
    return { width: info.width, height: info.height, luminance: opaque ? sum / opaque : null }
  } catch {
    return null
  }
}
