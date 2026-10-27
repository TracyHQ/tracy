/**
 * A card-sized copy of a stored screenshot: the first screen of the page, a few hundred pixels
 * wide, as WebP — what `GET /api/templates/:id/shots/:file?w=<width>` answers.
 *
 * 🔒 WHY THE DOOR SHRINKS PICTURES INSTEAD OF SERVING THEM AS STORED. A desktop shot is the WHOLE
 * page at 2× (2880×7200 measured, 4–7 MB of PNG), shot that way because the preview dialog shows it
 * full length. The grid draws the same file in a 279×160 box. Measured 29/09 on
 * cowork.tracy.site/design-inspiration: 28 cards pulled 99 MB of posters and the browser spent
 * 2.7 s of main-thread time decoding twenty-megapixel images to paint thumbnails — the tab
 * stuttered with no demo running at all. The card asks for `?w=`; the dialog keeps the original.
 *
 * 🔒 ONLY THE WIDTHS BELOW. Any other `w` is refused by the door with the original bytes, so a
 * stranger cannot make this process resize one picture into a thousand cached sizes.
 *
 * Crop, then resize: the top `16:10` of the page (the 1440×900 window the card frames, and the
 * shape the live demo fades in over), never enlarged — a 390-px phone shot stays 390 px.
 */
import sharp from 'sharp'

/** Widths a card may ask for: 1× and 2× of a grid card, and one step up for wide panes. */
export const THUMB_WIDTHS = Object.freeze([360, 720, 960])

/** Height over width of the window a card shows — `DEMO_WIDTH`×900 in the dsh plugin. */
const WINDOW_RATIO = 900 / 1440

/** Resized copies kept in memory, by sha256 and width. A card set is tens of pictures, not thousands. */
const CACHE_MAX = 128
/** @type {Map<string, Buffer>} */
const cache = new Map()

/**
 * The width a `?w=` value names, or null when it names none this door serves.
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function thumbWidth(raw) {
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return null
  const w = Number(raw)
  return THUMB_WIDTHS.includes(w) ? w : null
}

/**
 * The first screen of `bytes`, `width` wide, as WebP — or null when the picture cannot be read
 * (the door then serves the original: a thumbnail is an optimisation, never the only way to a picture).
 * @param {{ bytes: Buffer | Uint8Array, sha256: string }} shot
 * @param {number} width one of `THUMB_WIDTHS`
 * @returns {Promise<Buffer | null>}
 */
export async function shotThumb(shot, width) {
  const key = `${shot.sha256}:${width}`
  const hit = cache.get(key)
  if (hit) {
    // Re-insert so the Map's order is least-recently-used first.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  let out
  try {
    const img = sharp(Buffer.from(shot.bytes), { limitInputPixels: 64_000_000 })
    const meta = await img.metadata()
    if (!meta.width || !meta.height) return null
    const height = Math.min(meta.height, Math.round(meta.width * WINDOW_RATIO))
    out = await img
      .extract({ left: 0, top: 0, width: meta.width, height })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return null
  }
  cache.set(key, out)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return out
}
