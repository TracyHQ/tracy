// How look_logo shows images to the reviewer: each image sits on its ground with a 20 px margin; an image under
// 128 px is enlarged by a whole factor with nearest-neighbour sampling, so its real pixels are shown. Each item gets
// its shownScale.
import { imageBytes, sharp } from './common.js'

/** The PNG images the reviewer receives, one per item, in order. */
export async function renderLooks(items, files) {
  const images = []
  for (const it of items) {
    const bytes = imageBytes(files, it.file)
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
