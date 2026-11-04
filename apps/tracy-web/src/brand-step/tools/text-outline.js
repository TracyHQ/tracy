// Text as glyph outlines in the template's heading font (no text engine, no system font): the lab used opentype.js,
// here fontkit reads the same font bytes (ctx.font = { family, bytes }). Output is an SVG of one filled path.
import { create as createFont } from 'fontkit'
import { BrandToolError } from './common.js'

const parsed = new WeakMap()

/** The parsed font of ctx.font. */
export function fontOf(font) {
  if (!font?.bytes) throw new BrandToolError('the template heading font is not available for this run')
  let f = parsed.get(font.bytes)
  if (!f) {
    f = createFont(Buffer.from(font.bytes))
    if (f.fonts) f = f.fonts[0]
    parsed.set(font.bytes, f)
  }
  return f
}

const round = (v, d = 2) => {
  const k = 10 ** d
  return Math.round(v * k) / k
}

/** Outline commands (px, y down, baseline at 0) and the exact bounding box of a text at a size. */
function outline(f, text, size) {
  const s = size / f.unitsPerEm
  const run = f.layout(text)
  const cmds = []
  let x = 0
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i]
    const ox = x + pos.xOffset
    const oy = pos.yOffset
    const map = (px, py) => [(ox + px) * s, -(oy + py) * s]
    for (const { command, args } of g.path.commands) {
      const pts = []
      for (let k = 0; k < args.length; k += 2) pts.push(...map(args[k], args[k + 1]))
      cmds.push({ command, pts })
    }
    const b = g.path.bbox
    if (g.path.commands.length) {
      const [a1, c1] = map(b.minX, b.maxY)
      const [a2, c2] = map(b.maxX, b.minY)
      box.x1 = Math.min(box.x1, a1)
      box.y1 = Math.min(box.y1, c1)
      box.x2 = Math.max(box.x2, a2)
      box.y2 = Math.max(box.y2, c2)
    }
    x += pos.xAdvance
  })
  return { cmds, box }
}

const LETTER = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }

/** { svg, width, height }: the text as filled glyph outlines, tight around the ink, plus pad on every side. */
export function textSvg(font, text, { size = 200, colour = '#000000', pad = 0 } = {}) {
  const { cmds, box } = outline(fontOf(font), text, size)
  if (!Number.isFinite(box.x1))
    throw new BrandToolError(`the template heading font has no glyphs for "${text}"`)
  const w = Math.ceil(box.x2 - box.x1) + pad * 2
  const h = Math.ceil(box.y2 - box.y1) + pad * 2
  const dx = pad - box.x1
  const dy = pad - box.y1
  const d = cmds
    .map(({ command, pts }) => {
      const n = pts.map((v, i) => round(v + (i % 2 ? dy : dx))).join(' ')
      return `${LETTER[command]}${n}`
    })
    .join('')
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${d}" fill="${colour}"/></svg>`,
    width: w,
    height: h
  }
}

/** Advance width of a text in the template font at letter (cap) height 1, so widths compare across lines. */
export function textWidthPerLetterHeight(font, text) {
  const t = textSvg(font, text, { size: 1000 })
  return t.width / t.height
}

/**
 * The most balanced split of a name into two lines at a word boundary: the split whose longer line is the
 * shortest (widths measured in the template font). Null for a one-word name.
 */
export function twoLineSplit(font, text) {
  const words = String(text).trim().split(/\s+/)
  if (words.length < 2) return null
  let best = null
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const widest = Math.max(...lines.map((l) => textWidthPerLetterHeight(font, l)))
    if (!best || widest < best.widest) best = { lines, widest: +widest.toFixed(3) }
  }
  return best
}
