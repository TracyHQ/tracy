// Shared: the picture step and the write step's painted frames draw with it, so it is in lib/ (module-graph.test.mjs).
// Renders one Phosphor icon as a transparent PNG file (ported from the brief build branch, #189; spec #345): the
// weight, the one colour and the plate come from the measured demo icon, the size is the frame's. With a plate (the
// demo's own disc or tile behind its glyph) the glyph is set on a plate of the same shape, colour, opacity and size,
// so the content changes and the template's style does not.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { hasPhosphorIcon, phosphorSvg } from './phosphor-set.js'

/** The icon drawn when a name is not in the set. */
export const FALLBACK_ICON = 'check-circle'

/**
 * An icon as a transparent PNG. With `ground` (the demo's own disc or tile, measured by `icon-style.js`), the glyph is set
 * on a ground of the same shape, colour, opacity and size, in the demo glyph's place: the content changes, never the
 * template's style.
 * With `glyphBox` and no ground, the glyph takes that place in the file: a template icon with no backing rarely fills its box.
 * @param {{glyph: string, weight?: string, width: number, height: number, colour?: string,
 *   ground?: import('./icon-ground.js').GroundShape | null,
 *   glyphBox?: {x: number, y: number, w: number, h: number} | null}} input
 * @returns {Promise<{bytes: Buffer, ext: 'png', width: number, height: number, sha256: string}>}
 */
export async function iconPicture({
  glyph,
  weight = 'regular',
  width,
  height,
  colour = '#222222',
  ground = null,
  glyphBox = null
}) {
  const source = await phosphorSvg(hasPhosphorIcon(glyph) ? glyph : FALLBACK_ICON, weight)
  // The icon fills the box as the demo's icons do; its one colour is the demo's (a duotone's tint is that colour at 20%).
  const sized = (/** @type {number} */ w, /** @type {number} */ h) =>
    source
      .replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `)
      .replaceAll('currentColor', colour)
  const placed = ground ?? (glyphBox ? { glyph: glyphBox } : null)
  const bytes = placed
    ? await onGround({ svg: sized(512, 512), width, height, ground: placed })
    : await sharp(Buffer.from(sized(width, height)))
        .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
  return { bytes, ext: 'png', width, height, sha256: createHash('sha256').update(bytes).digest('hex') }
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * A glyph on the demo's ground: the ground drawn as a rounded box (a disc at radius 0.5), the glyph cut to its own ink
 * and fitted in a square as large as the demo glyph's longer side, centred where the demo glyph was.
 * @param {{svg: string, width: number, height: number, ground: import('./icon-ground.js').GroundShape}} input
 */
async function onGround({ svg, width, height, ground }) {
  const { box, glyph } = ground
  // With no ground (`box` absent) the file is clear behind the glyph.
  const rect = box
    ? `<rect x="${box.x * width}" y="${box.y * height}" width="${box.w * width}" height="${box.h * height}" rx="${ground.radius * Math.min(box.w * width, box.h * height)}" ry="${ground.radius * Math.min(box.w * width, box.h * height)}" fill="${ground.colour}" fill-opacity="${ground.opacity}"/>`
    : ''
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rect}</svg>`
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let x0 = info.width
  let x1 = -1
  let y0 = info.height
  let y1 = -1
  for (let p = 0; p < info.width * info.height; p += 1) {
    if (data[p * info.channels + 3] === 0) continue
    const x = p % info.width
    const y = Math.floor(p / info.width)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  const side = Math.max(1, Math.min(width, height, Math.round(Math.max(glyph.w * width, glyph.h * height))))
  const layers = []
  if (x1 >= 0) {
    const cut = await sharp(data, { raw: info })
      .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
      .resize(side, side, { fit: 'contain', background: CLEAR })
      .png()
      .toBuffer()
    const left = Math.round((glyph.x + glyph.w / 2) * width - side / 2)
    const top = Math.round((glyph.y + glyph.h / 2) * height - side / 2)
    layers.push({
      input: cut,
      left: Math.min(Math.max(0, left), width - side),
      top: Math.min(Math.max(0, top), height - side)
    })
  }
  return sharp(Buffer.from(base)).composite(layers).png().toBuffer()
}
