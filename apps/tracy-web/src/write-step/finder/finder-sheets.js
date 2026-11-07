// The finder's compact input (#448): one page's viewport tiles (lib/page-shots.js) stitched into a few sheets per width,
// so a finder call carries fewer images, fewer pixels and fewer bytes while every row of the page is still shown.
//
// - Overlap goes: the host starts each tile `SHOT_OVERLAP` px before the last one ended, plus the height of any sticky top
//   band, so each seam is cut `SHOT_OVERLAP` px above the last tile's foot. Every row is kept once, the next tile's sticky
//   header falls in the cut, and a bottom band of the last tile up to that height (a cookie bar) hides nothing.
// - Readable: desktop sheets are shrunk to `DESKTOP_SCALE` (text by a fifth at most), phone sheets never; a sheet stays
//   under a size the model takes whole, and consecutive sheets share `SHEET_OVERLAP` px, so a line cut at the foot of
//   one sheet shows whole at the head of the next.
// - Fault places stay true: a sheet says the page rows it shows (`y`, `height`), numbered per page and width as tiles
//   were, so the finder's answer is held to the sheets it was shown (finder-kinds.js heldFaults).
import sharp from 'sharp'

export const DESKTOP_SCALE = 0.8
/** The tallest sheet, in pixels of the image sent. */
export const SHEET_MAX_HEIGHT = Object.freeze({ desktop: 1024, phone: 1800 })
/** Page rows two consecutive sheets both show. */
export const SHEET_OVERLAP = 48
/** The host's own overlap between viewport tiles (tracy-host vision capture). */
export const SHOT_OVERLAP = 128
export const SHEET_QUALITY = 75
/** One image token per square of this many pixels: a rough estimate, the same for before and after. */
const TOKEN_PATCH = 28

const scaleOf = (viewport) => (viewport === 'desktop' ? DESKTOP_SCALE : 1)
const bytesOf = (image) => Buffer.from(String(image).split(',')[1] ?? '', 'base64')

/** The page rows each tile keeps: from where the last one was cut to `SHOT_OVERLAP` above its own foot. */
function pieces(tiles) {
  const out = []
  tiles.forEach((tile, i) => {
    const next = tiles[i + 1]
    const from = i === 0 ? tile.y : out.at(-1).to
    const foot = tile.y + tile.height
    const to = next ? Math.min(foot, Math.max(next.y, foot - SHOT_OVERLAP)) : foot
    if (to > from) out.push({ tile, from, to })
  })
  return out
}

/** The page rows each sheet shows, at most the sheet's height in page rows, overlapping by `SHEET_OVERLAP`. */
function sheetSpans(start, end, viewport) {
  const rows = Math.floor(SHEET_MAX_HEIGHT[viewport] / scaleOf(viewport))
  const spans = []
  for (let y = start; ; y = spans.at(-1).to - SHEET_OVERLAP) {
    const to = Math.min(end, y + rows)
    spans.push({ y, to })
    if (to >= end) return spans
  }
}

/** One sheet: the tile rows it shows laid one under another, shrunk to its width and saved as a JPEG. */
async function drawSheet(span, kept, decoded, viewport) {
  const width = decoded.get(kept[0].tile).info.width
  const layers = []
  for (const piece of kept) {
    const from = Math.max(piece.from, span.y)
    const to = Math.min(piece.to, span.to)
    if (to <= from) continue
    const { data, info } = decoded.get(piece.tile)
    const top = from - piece.tile.y
    const rows = Math.min(to - from, info.height - top)
    if (rows <= 0) continue
    const input = await sharp(data, { raw: info })
      .extract({ left: 0, top, width: Math.min(width, info.width), height: rows })
      .raw()
      .toBuffer({ resolveWithObject: true })
    layers.push({ input: input.data, raw: input.info, top: from - span.y, left: 0 })
  }
  const height = span.to - span.y
  const canvas = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const jpeg = await sharp(canvas.data, { raw: canvas.info })
    .resize({ width: Math.round(width * scaleOf(viewport)) })
    .jpeg({ quality: SHEET_QUALITY, mozjpeg: true })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/**
 * One page's tiles as sheets, desktop first. A tile that cannot be read is a thrown error; the caller names the page.
 * @param {{ page: string, viewport: 'desktop' | 'phone', index: number, y: number, height: number,
 *   documentHeight?: number, image: string }[]} tiles
 * @returns {Promise<{ page: string, viewport: string, index: number, y: number, height: number,
 *   documentHeight: number | null, image: string }[]>} `index` numbers the sheets per width from 0
 */
export async function pageSheets(tiles) {
  const sheets = []
  for (const viewport of ['desktop', 'phone']) {
    const mine = tiles.filter((t) => t.viewport === viewport).sort((a, b) => a.index - b.index)
    if (!mine.length) continue
    const kept = pieces(mine)
    const decoded = new Map()
    for (const tile of mine) {
      const { data, info } = await sharp(bytesOf(tile.image))
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })
      decoded.set(tile, { data, info: { width: info.width, height: info.height, channels: info.channels } })
    }
    const spans = sheetSpans(kept[0].from, kept.at(-1).to, viewport)
    for (const [index, span] of spans.entries())
      sheets.push({
        page: mine[0].page,
        viewport,
        index,
        y: span.y,
        height: span.to - span.y,
        documentHeight: mine[0].documentHeight ?? null,
        image: await drawSheet(span, kept, decoded, viewport)
      })
  }
  return sheets
}

/**
 * The template demo's block shots (finder-ask.js demoBlockShots) at the size of the site's desktop sheets: wider than a
 * sheet, shrunk to its width; one that cannot be read is sent as it came, never dropped.
 */
export async function shrunkDemoShots(shots) {
  const width = Math.round(1440 * DESKTOP_SCALE)
  return Promise.all(
    (shots ?? []).map(async (shot) => {
      try {
        const buffer = bytesOf(shot.image)
        const meta = await sharp(buffer).metadata()
        if (!(meta.width > width)) return shot
        const jpeg = await sharp(buffer)
          .flatten({ background: '#ffffff' })
          .resize({ width })
          .jpeg({ quality: SHEET_QUALITY, mozjpeg: true })
          .toBuffer()
        return { ...shot, image: `data:image/jpeg;base64,${jpeg.toString('base64')}` }
      } catch {
        return shot
      }
    })
  )
}

/** What a list of images costs a call: how many, their bytes, and an estimate of their image tokens. */
export async function imageBudget(shots) {
  let bytes = 0
  let tokens = 0
  for (const shot of shots) {
    const buffer = bytesOf(shot.image)
    const { width = 0, height = 0 } = await sharp(buffer).metadata()
    bytes += buffer.length
    tokens += Math.ceil(width / TOKEN_PATCH) * Math.ceil(height / TOKEN_PATCH)
  }
  return { images: shots.length, bytes, tokens }
}
