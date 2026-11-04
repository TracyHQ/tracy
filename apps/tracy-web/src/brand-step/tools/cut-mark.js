// cut_mark(mediaId, box): cuts the box (plus a 4% margin) out of a brief image, removes the ground OUTSIDE the figure
// and returns a transparent 512 x 512 mark (trimmed, centred, 6% margin). Ground the figure fully encloses keeps its
// original opaque pixels (the mark is never hollow) and is recorded in the sidecar mask (255 = kept fill, same 512
// geometry) that recolour_mark reads. Edge check: the mark on black and on white; partial pixels nearer the ground
// than the mark colours count as fringe. Ported from the approved lab's cut-mark. Never overwrites: run N >= 2
// writes mark/cut-mark.vN.png, its mask and its proofs. Files go to mark/.
import { BrandToolError, dist, groundOf, imageBytes, raw, runSuffix, sharp } from './common.js'
import { matteCrop } from './cut-mark-matte.js'

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

/** The box as [x, y, w, h] from an array, an { x, y, w, h } object or an "x,y,w,h" string. */
export function boxOf(box) {
  const v =
    typeof box === 'string'
      ? box.split(',').map(Number)
      : Array.isArray(box)
        ? box.map(Number)
        : box && typeof box === 'object'
          ? [box.x, box.y, box.w, box.h].map(Number)
          : []
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n)) || v[2] < 1 || v[3] < 1 || v[0] < 0 || v[1] < 0)
    throw new BrandToolError('box must be x,y,w,h in pixels of the image (w and h at least 1)')
  return v.map(Math.round)
}

export const tool = {
  name: 'cut_mark',
  description:
    'Cuts a box out of a brief image and removes the ground around the figure; returns a transparent square mark (512). Only ground outside the figure goes: ground the figure fully encloses keeps its original colour, so the mark is never hollow (a sidecar mask records it for recolour_mark). A shape with no closed outline has no inside.',
  inputSchema: {
    type: 'object',
    properties: {
      mediaId: { type: 'string', description: 'The id of the brief image (or its file path).' },
      box: {
        description:
          'The mark box from measure_logo: { x, y, w, h } or [x, y, w, h], in pixels of the image.',
        oneOf: [
          { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
          {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' }
            },
            required: ['x', 'y', 'w', 'h']
          }
        ]
      }
    },
    required: ['mediaId', 'box'],
    additionalProperties: false
  },
  async run({ mediaId, box }, ctx) {
    if (!mediaId || box == null) throw new BrandToolError('usage: cut_mark(mediaId, box)')
    const { files } = ctx
    const [bx, by, bw, bh] = boxOf(box)
    const source = imageBytes(files, mediaId)
    const meta = await sharp(source).metadata()
    if (bx >= meta.width || by >= meta.height)
      throw new BrandToolError(`box starts outside the image (${meta.width} x ${meta.height})`)
    const m = Math.round(Math.max(bw, bh) * 0.04)
    const L = Math.max(0, bx - m)
    const T = Math.max(0, by - m)
    const W = Math.min(meta.width, bx + bw + m) - L
    const H = Math.min(meta.height, by + bh + m) - T
    const whole = await raw(source)
    const g0 = groundOf(whole)
    const crop = await sharp(source)
      .ensureAlpha()
      .extract({ left: L, top: T, width: W, height: H })
      .raw()
      .toBuffer()
    const { out, fillMask, method } = await matteCrop(crop, W, H, g0)

    // trim (bounding box of alpha > 0), centre in a 512 square with a 6% margin; the mask gets the same geometry
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (out[(y * W + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
    if (x1 < 0) throw new BrandToolError('nothing left after removing the ground: check the box')
    const tb = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
    const inner = Math.round(512 * 0.88)
    const fitted = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
      .extract(tb)
      .resize(inner, inner, { fit: 'contain', background: CLEAR })
      .png()
      .toBuffer()
    const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: CLEAR } })
      .composite([{ input: fitted, gravity: 'centre' }])
      .png()
      .toBuffer()
    const mf = await sharp(fillMask, { raw: { width: W, height: H, channels: 1 } })
      .extract(tb)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0 }, kernel: 'nearest' })
      .extractChannel(0)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const mask = Buffer.alloc(512 * 512)
    const { width: mw, height: mh } = mf.info
    const ox = Math.round((512 - mw) / 2)
    const oy = Math.round((512 - mh) / 2)
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) mask[(y + oy) * 512 + x + ox] = mf.data[y * mw + x] >= 128 ? 255 : 0
    const maskPng = await sharp(mask, { raw: { width: 512, height: 512, channels: 1 } })
      .png()
      .toBuffer()

    // edge check
    const R = await raw(png)
    const solid = []
    const partial = []
    let fill = 0
    for (let i = 0; i < 512 * 512; i++) {
      const al = R.data[i * 4 + 3]
      const p = { r: R.data[i * 4], g: R.data[i * 4 + 1], b: R.data[i * 4 + 2] }
      if (mask[i]) fill++
      else if (al > 230) solid.push(p)
      else if (al > 10) partial.push(p)
    }
    const pal = []
    for (let i = 0; i < solid.length; i += Math.max(1, Math.floor(solid.length / 400))) pal.push(solid[i])
    let fringe = 0
    if (!g0.transparent)
      for (const p of partial) if (dist(p, g0.colour) < Math.min(...pal.map((q) => dist(p, q)))) fringe++

    const SUF = runSuffix(files, 'mark/cut-mark.png')
    const put = (stem, ext, bytes) => files.write(`mark/${stem}${SUF}.${ext}`, bytes)
    const file = put('cut-mark', 'png', png)
    const maskFile = files.write(file.replace(/\.png$/i, '.mask.png'), maskPng)
    const proofs = {}
    for (const [name, bg] of [
      ['on-black', '#000000'],
      ['on-white', '#ffffff']
    ])
      proofs[name] = files.write(
        file.replace(/\.png$/i, `.${name}.png`),
        await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } })
          .composite([{ input: png }])
          .png()
          .toBuffer()
      )
    return {
      ok: true,
      file,
      size: [512, 512],
      box: [bx, by, bw, bh],
      method,
      edges: {
        partialPixels: partial.length,
        fringePixels: fringe,
        fringeShare: partial.length ? +(fringe / partial.length).toFixed(3) : 0,
        proofs
      },
      transparentShare: +((512 * 512 - solid.length - partial.length - fill) / (512 * 512)).toFixed(3),
      fill: {
        mask: maskFile,
        keptGroundPixels: fill,
        share: +(fill / (512 * 512)).toFixed(3),
        note: 'ground enclosed by the figure is kept with its original pixels, opaque; mask 255 = this fill (recolour_mark leaves it as is)'
      }
    }
  }
}
