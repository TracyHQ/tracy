// Drawing a cut-out's backdrop recipe (cutout-backdrop.js) at a picture's size, in the colours given for its roles,
// and the review composite: the backdrop with the cut-out figure on top. The finished cut-out file stays the figure
// alone; the composite is only a preview (ADR 0043 section 1a, the backdrop). Step 9 draws the same recipe in the
// Design system's colours.
import sharp from 'sharp'
import { rgbOf } from './icons/icon-ink.js'

const n = (v) => Number(v.toFixed(2))

// A small seeded random source, so a recipe always draws the same speckle.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `a` mixed `share` of the way toward `b`, both `#rrggbb`. */
export function mixHex(a, b, share) {
  const x = rgbOf(a)
  const y = rgbOf(b)
  if (!x || !y) return a
  const m = (k) =>
    Math.round(x[k] + (y[k] - x[k]) * share)
      .toString(16)
      .padStart(2, '0')
  return `#${m('r')}${m('g')}${m('b')}`
}

/**
 * The SVG of a backdrop recipe at `width` x `height`, the disc and bands in `colours` ({ circle, stripes }, `#rrggbb`).
 * @param {{ shape: { circle: object, stripes: object | null } }} recipe
 */
export function backdropSvg(recipe, width, height, colours) {
  const { circle, stripes } = recipe.shape
  const cx = circle.x * width
  const cy = circle.y * height
  const r = circle.r * width
  const parts = [`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colours.circle}"/>`]
  if (stripes) {
    const t = Math.tan((stripes.angle * Math.PI) / 180)
    const ax = cx + stripes.apex.x * r
    const reach = 2 * r
    const bands = []
    for (let k = 0; k < stripes.count; k++) {
      const top = cy + (stripes.apex.y + k * (stripes.band + stripes.gap)) * r
      const bottom = top + stripes.band * r
      const pts = [
        [ax - reach, top + reach * t],
        [ax, top],
        [ax + reach, top + reach * t],
        [ax + reach, bottom + reach * t],
        [ax, bottom],
        [ax - reach, bottom + reach * t]
      ]
      bands.push(`<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}"/>`)
    }
    parts.push(`<g clip-path="url(#disc)" fill="${colours.stripes}">${bands.join('')}</g>`)
    if (stripes.texture?.kind === 'speckle') {
      const spot = mixHex(colours.stripes, colours.circle, stripes.texture.shade)
      const rand = seeded(Math.round(stripes.band * 1e4 + stripes.angle * 7 + stripes.count))
      const size = Math.max(1.5, r / 90)
      // Spots spread over the disc, kept inside the bands by the band mask: about `share` of the band area.
      const count = Math.round((stripes.texture.share * Math.PI * r * r) / (Math.PI * size * size * 2.2))
      const dots = []
      for (let i = 0; i < count; i++) {
        const a = rand() * 2 * Math.PI
        const d = Math.sqrt(rand()) * r
        dots.push(
          `<circle cx="${n(cx + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(size * (0.5 + rand()))}"/>`
        )
      }
      parts.push(`<mask id="bands"><g fill="#fff">${bands.join('')}</g></mask>`)
      parts.push(`<g clip-path="url(#disc)" mask="url(#bands)" fill="${spot}">${dots.join('')}</g>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><clipPath id="disc"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath></defs>${parts.join('')}</svg>`
}

/** The backdrop drawn as a transparent PNG. */
export const drawBackdrop = (recipe, width, height, colours) =>
  sharp(Buffer.from(backdropSvg(recipe, width, height, colours)))
    .png()
    .toBuffer()

/**
 * The review composite: the backdrop at the figure's size with the figure (a transparent PNG) on top.
 * @param {Buffer} figure @param {object} recipe @param {{ circle: string, stripes: string }} colours
 * @returns {Promise<{ png: Buffer, width: number, height: number }>}
 */
export async function backdropComposite(figure, recipe, colours) {
  const meta = await sharp(figure).metadata()
  const ground = await drawBackdrop(recipe, meta.width, meta.height, colours)
  const png = await sharp(ground)
    .composite([{ input: figure }])
    .png()
    .toBuffer()
  return { png, width: meta.width, height: meta.height }
}
