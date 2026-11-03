// measure_logo(mediaId): pixel analysis of the found logo, no vision model. Ground: transparent when the border is
// clear, else the median border colour (with its spread: a gradient or photo ground spreads). Foreground: alpha, or
// colour distance from the ground. Shapes: recursive XY cut. Rows split on empty bands (>= 2% of the content
// height); a row then splits into columns only on wide empty gaps (>= 4% of the image width, wider than a letter
// gap), and each column into rows again. Every leaf box is one separate shape. `kind` is a guess (symbol / word
// line / small line); the agent confirms by looking. Ported from the approved lab tool measure-logo.
import { BrandToolError, dist, groundOf, hex, imagePath, raw } from './common.js'

export const tool = {
  name: 'measure_logo',
  description:
    'Size, solid or transparent ground, ground colour, and the boxes of every separate shape (symbol, word lines, small lines such as a date) of a brief image.',
  inputSchema: {
    type: 'object',
    properties: { mediaId: { type: 'string', description: 'The id of the brief image (or its file path).' } },
    required: ['mediaId'],
    additionalProperties: false
  },
  async run({ mediaId }, ctx) {
    if (!mediaId) throw new BrandToolError('usage: measure_logo(mediaId)')
    const file = imagePath(ctx.files, mediaId)
    const img = await raw(ctx.files.read(file))
    const { data, w, h } = img
    const ground = groundOf(img)
    const thr = ground.transparent ? 0 : Math.max(48, (ground.spread ?? 0) * 1.6)
    const fg = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) {
      const p = { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] }
      fg[i] = ground.transparent ? (data[i * 4 + 3] > 64 ? 1 : 0) : dist(p, ground.colour) > thr ? 1 : 0
    }

    const tight = (x0, y0, x1, y1) => {
      let a0 = x1
      let b0 = y1
      let a1 = x0 - 1
      let b1 = y0 - 1
      let n = 0
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (fg[y * w + x]) {
            n++
            if (x < a0) a0 = x
            if (x > a1) a1 = x
            if (y < b0) b0 = y
            if (y > b1) b1 = y
          }
      return n ? { x: a0, y: b0, w: a1 - a0 + 1, h: b1 - b0 + 1, ink: n } : null
    }
    /** Empty-band split of box b along axis; minGap in px. */
    const split = (b, axis, minGap) => {
      const lo = axis === 'y' ? b.y : b.x
      const hi = axis === 'y' ? b.y + b.h - 1 : b.x + b.w - 1
      const noise = Math.max(1, Math.round((axis === 'y' ? b.w : b.h) * 0.003))
      const has = []
      for (let t = lo; t <= hi; t++) {
        let n = 0
        if (axis === 'y') for (let x = b.x; x < b.x + b.w; x++) n += fg[t * w + x]
        else for (let y = b.y; y < b.y + b.h; y++) n += fg[y * w + t]
        has.push(n > noise)
      }
      const segs = []
      let s = -1
      let gap = 0
      for (let i = 0; i < has.length; i++) {
        if (has[i]) {
          if (s < 0) s = i
          gap = 0
        } else if (s >= 0 && ++gap >= minGap) {
          segs.push([s, i - gap])
          s = -1
          gap = 0
        }
      }
      if (s >= 0) segs.push([s, has.length - 1 - gap])
      return segs
        .map(([p, q]) =>
          axis === 'y' ? tight(b.x, lo + p, b.x + b.w - 1, lo + q) : tight(lo + p, b.y, lo + q, b.y + b.h - 1)
        )
        .filter(Boolean)
    }
    const content = tight(0, 0, w - 1, h - 1)
    if (!content) throw new BrandToolError('no foreground found', { file })
    const colGap = Math.max(6, Math.round(w * 0.04))
    const cut = (b, depth = 0) => {
      const rows = split(b, 'y', Math.max(3, Math.round(content.h * 0.02)))
      if (rows.length > 1) return rows.flatMap((r) => cut(r, depth + 1))
      const cols = split(b, 'x', colGap)
      if (cols.length > 1 && depth < 6) return cols.flatMap((c) => cut(c, depth + 1))
      return [b]
    }
    const shapes = cut(content).filter((s) => s.ink > content.w * content.h * 0.0005)

    // guesses: the symbol is the biggest roughly-compact shape clearly taller than the text lines
    const hs = shapes.map((s) => s.h).sort((p, q) => p - q)
    const medH = hs[hs.length >> 1]
    let symbol = -1
    let best = 0
    shapes.forEach((s, i) => {
      const ar = s.w / s.h
      if (ar > 0.4 && ar < 2.2 && s.h >= medH * 1.6 && s.w * s.h > best) {
        best = s.w * s.h
        symbol = i
      }
    })
    const textHs = shapes
      .filter((_, i) => i !== symbol)
      .map((s) => s.h)
      .sort((p, q) => q - p)
    const mainText = textHs[0] ?? 0
    const out = shapes.map((s, i) => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      aspect: +(s.w / s.h).toFixed(2),
      kind: i === symbol ? 'symbol' : s.h < mainText * 0.35 ? 'small line' : 'word line'
    }))
    return {
      ok: true,
      file,
      width: w,
      height: h,
      method:
        'pixel analysis: border-pixel ground, colour-distance (or alpha) mask, recursive XY cut; kind is a guess',
      ground: ground.transparent
        ? { kind: 'transparent', colour: null }
        : {
            kind: (ground.spread ?? 0) > 40 ? 'uneven (gradient or photo)' : 'solid',
            colour: hex(ground.colour.r, ground.colour.g, ground.colour.b),
            borderSpread: Math.round(ground.spread)
          },
      content: {
        x: content.x,
        y: content.y,
        w: content.w,
        h: content.h,
        aspect: +(content.w / content.h).toFixed(3)
      },
      shapes: out
    }
  }
}
