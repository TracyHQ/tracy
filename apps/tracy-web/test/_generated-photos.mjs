/**
 * Generated test photos for the sharpness gate (spec TracyHQ/tracy#189): fictional scenes of a bakery counter and of a
 * dental clinic, made crisp, blurred, heavily compressed, drawn small and enlarged 3x, or padded with a blurred copy.
 */
import sharp from 'sharp'

export const PALETTES = {
  bakery: ['#7a4a21', '#c98b4f', '#e9d2a9', '#3b2414', '#f4ead8'],
  dental: ['#e8f3f2', '#2f8f8a', '#ffffff', '#1d4c57', '#9fd3cf']
}

/** A scene of many outlined shapes, rendered at twice the size and shrunk (crisp edges), with a fine camera grain. */
export async function scene(trade, width, height, seed = 3) {
  let x = seed
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pal = PALETTES[trade]
  const W = width * 2
  const H = height * 2
  let shapes = ''
  for (let i = 0; i < 260; i += 1) {
    const c = pal[Math.floor(rnd() * pal.length)]
    const cx = rnd() * W
    const cy = rnd() * H
    const r = 6 + rnd() * W * 0.06
    shapes +=
      trade === 'bakery'
        ? `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.6}" fill="${c}" stroke="#2a180c" stroke-width="2"/>`
        : `<rect x="${cx}" y="${cy}" width="${r * 1.6}" height="${r}" rx="${r * 0.2}" fill="${c}" stroke="#123" stroke-width="2"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${pal[2]}"/>${shapes}</svg>`
  const base = await sharp(Buffer.from(svg)).resize(width, height).raw().toBuffer({ resolveWithObject: true })
  const d = base.data
  for (let i = 0; i < d.length; i += 1)
    d[i] = Math.max(0, Math.min(255, d[i] + Math.round((rnd() - 0.5) * 18)))
  return sharp(d, { raw: { width, height, channels: base.info.channels } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** The four kinds of photo an owner hands over. */
export async function kinds(trade, width, height) {
  const crisp = await scene(trade, width, height)
  return {
    crisp,
    blurred: await sharp(crisp).blur(3).jpeg({ quality: 90 }).toBuffer(),
    compressed: await sharp(crisp).jpeg({ quality: 4 }).toBuffer(),
    enlarged: await sharp(await scene(trade, Math.round(width / 3), Math.round(height / 3)))
      .resize(width, height, { kernel: 'lanczos3' })
      .jpeg({ quality: 90 })
      .toBuffer()
  }
}

/** A crisp picture whose left quarter is a blurred, stretched copy of its own edge: a padded wide frame. */
export async function padded(trade, width, height) {
  const crisp = await scene(trade, width, height)
  const band = Math.round(width / 4)
  const smear = await sharp(crisp)
    .extract({ left: band, top: 0, width: Math.round(band / 2), height })
    .resize(band, height, { fit: 'fill' })
    .blur(6)
    .toBuffer()
  return sharp(crisp)
    .composite([{ input: smear, left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}
