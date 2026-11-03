// How look_logo shows images to the reviewer. Blind mode (decision 15): the icon AT 128 PX, the size a visitor sees in
// the site header: trimmed, contained in a 128 x 128 square (4% margin, lanczos3), flattened on the image's ground, shown
// 2x with nearest-neighbour; the renderings are kept in the run folder. Otherwise the image sits on its ground with a
// 20 px margin; an image under 128 px is enlarged by a whole factor with nearest-neighbour sampling, so its real
// pixels are shown. Each item gets its shownScale (and, blind, shownAt, rendering, shownFile).
import { imageBytes, sharp } from './common.js'

export const BLIND_SIZE = 128
export const BLIND_ZOOM = 2
const NONE = { r: 0, g: 0, b: 0, alpha: 0 }

/** The PNG images the reviewer receives, one per item, in order. */
export async function renderLooks(items, files, blind) {
  const images = []
  for (const [i, it] of items.entries()) {
    const bytes = imageBytes(files, it.file)
    if (blind) {
      // the icon as it looks at 128 px (header size), on its ground
      const trimmed = await sharp(bytes).trim({ threshold: 0 }).png().toBuffer()
      const inner = Math.round(BLIND_SIZE * 0.92)
      const small = await sharp(trimmed)
        .resize(inner, inner, { fit: 'contain', background: NONE, kernel: 'lanczos3' })
        .png()
        .toBuffer()
      const atSize = await sharp({
        create: { width: BLIND_SIZE, height: BLIND_SIZE, channels: 4, background: it.ground }
      })
        .composite([{ input: small, gravity: 'centre' }])
        .flatten({ background: it.ground })
        .png()
        .toBuffer()
      const big = await sharp(atSize)
        .resize(BLIND_SIZE * BLIND_ZOOM, BLIND_SIZE * BLIND_ZOOM, { kernel: 'nearest' })
        .png()
        .toBuffer()
      const W = BLIND_SIZE * BLIND_ZOOM + 40
      const shown = await sharp({ create: { width: W, height: W, channels: 4, background: it.ground } })
        .composite([{ input: big, left: 20, top: 20 }])
        .png()
        .toBuffer()
      it.rendering = files.write(`look/blind-${i + 1}.${BLIND_SIZE}.png`, atSize)
      it.shownFile = files.write(`look/blind-${i + 1}.shown.png`, shown)
      it.shownScale = `${BLIND_SIZE} px rendering (lanczos3), shown ${BLIND_ZOOM}x nearest`
      it.shownAt = BLIND_SIZE
      images.push(shown)
      continue
    }
    const m = await sharp(bytes).metadata()
    const up = Math.max(m.width, m.height) < 128 ? Math.ceil(128 / Math.max(m.width, m.height)) : 1
    const scale = up > 1 ? up : Math.min(1, 1600 / m.width)
    const w = Math.round(m.width * scale)
    const h = Math.round(m.height * scale)
    const img = await sharp(bytes)
      .resize(w, h, up > 1 ? { kernel: 'nearest' } : {})
      .png()
      .toBuffer()
    images.push(
      await sharp({ create: { width: w + 40, height: h + 40, channels: 4, background: it.ground } })
        .composite([{ input: img, left: 20, top: 20 }])
        .png()
        .toBuffer()
    )
    it.shownScale = up > 1 ? `${up}x nearest` : null
  }

  return images
}
