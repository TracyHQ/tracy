/**
 * The icon set a brief build draws an item icon from (spec TracyHQ/tracy#189, ticket #195): one plain line glyph per
 * meaning of the domain's lexicon (`website-opportunities/domain/decor-plan.mjs` `ICON_LEXICON`), drawn here on a 24 x 24
 * grid with round 1.8 px strokes, so every glyph has one weight and one style. Tracy's own drawings: no third-party set.
 *
 * `iconPicture` renders a glyph as a transparent PNG of the demo icon's size, in the demo icon's own colour, so a dark and
 * a light icon of one item stay a pair.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

/** Glyph name → SVG elements on a 24 x 24 grid (stroked, no fill unless a shape says so). */
export const GLYPHS = Object.freeze({
  check: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  racquet:
    '<ellipse cx="14.5" cy="9" rx="5.5" ry="6.5" transform="rotate(40 14.5 9)"/><path d="M10.6 13.9L4 20.5"/><path d="M12 6.5l5 5M10.6 9l5 5M14 5l3.5 3.5"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M4.5 9.5c4 1.5 11 1.5 15 0M4.5 14.5c4-1.5 11-1.5 15 0"/>',
  waves:
    '<path d="M3 9c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/><path d="M3 14c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/><path d="M3 19c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/>',
  dumbbell:
    '<path d="M7 12h10"/><rect x="3.5" y="8" width="3.5" height="8" rx="1"/><rect x="17" y="8" width="3.5" height="8" rx="1"/><path d="M2 10.5v3M22 10.5v3"/>',
  lotus:
    '<path d="M12 19c-3-2.5-4-6-2.5-10 1 .5 2 1.6 2.5 3 .5-1.4 1.5-2.5 2.5-3 1.5 4 .5 7.5-2.5 10z"/><path d="M12 19c-4 0-7.5-2-8.5-5.5 2-.3 4 .2 5.5 1.5M12 19c4 0 7.5-2 8.5-5.5-2-.3-4 .2-5.5 1.5"/>',
  spa: '<path d="M12 21c-5 0-8-3-8-7 3 0 6 1.5 8 4.5 2-3 5-4.5 8-4.5 0 4-3 7-8 7z"/><path d="M12 13c-1.5-2-1.5-5 0-8 1.5 3 1.5 6 0 8z"/>',
  tooth:
    '<path d="M7 3.5c-2.5 0-3.5 2.5-3 5 .4 2 1.5 3 1.8 5.5L6.5 19c.2 1.5 2 1.5 2.3 0l.9-4c.3-1.2 1.2-1.6 2.3-1.6s2 .4 2.3 1.6l.9 4c.3 1.5 2.1 1.5 2.3 0l.7-5c.3-2.5 1.4-3.5 1.8-5.5.5-2.5-.5-5-3-5-2 0-3 1-5 1s-3-1-5-1z"/>',
  scissors:
    '<circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8.2 8L20 18M8.2 16L20 6"/>',
  cake: '<rect x="4" y="11" width="16" height="9" rx="1.5"/><path d="M4 15c2 1.2 4 1.2 6 0s4-1.2 6 0 3 1.2 4 0"/><path d="M12 11V7.5"/><path d="M12 3.5c1 1 1 2.3 0 3-1-.7-1-2 0-3z"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5v2M11 3.5v2M14 3.5v2"/>',
  utensils:
    '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  house: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5.5h4V20"/>',
  wrench:
    '<path d="M14.5 4a5 5 0 0 0-4.6 6.9L3.5 17.3a1.9 1.9 0 0 0 2.7 2.7l6.4-6.4A5 5 0 0 0 19.6 9l-3 3-3-1-1-3z"/>',
  car: '<path d="M4 16v-3.5L6 7.5h12l2 5V16"/><rect x="3" y="12.5" width="18" height="4.5" rx="1.5"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/>',
  paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15.5" cy="7" r="1.8"/><circle cx="18" cy="11" r="1.8"/><path d="M8 17.5c0-3 2-5.5 4.5-5.5s4.5 2.5 4.5 5c0 2-2 2.5-4.5 2s-4.5.5-4.5-1.5z"/>',
  leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
  music:
    '<path d="M9 17V5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
  camera:
    '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5L9 4.5h6L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/><circle cx="12" cy="13" r="3.5"/>',
  shield:
    '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  people:
    '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 19.5c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5"/><path d="M14.5 14.5c2.8-.6 5.6 1 6.5 4.5"/>'
})

/**
 * A glyph as a transparent PNG.
 * @param {{glyph: string, width: number, height: number, colour?: string}} input
 * @returns {Promise<{bytes: Buffer, ext: 'png', width: number, height: number, sha256: string}>}
 */
export async function iconPicture({ glyph, width, height, colour = '#222222' }) {
  const body = GLYPHS[glyph] ?? GLYPHS.check
  const side = Math.min(width, height)
  // The glyph fills the box as the demo's icons do, with the stroke scaled to stay one weight at any size.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="${colour}" stroke-width="${side < 48 ? 2.2 : 1.8}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  const bytes = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return { bytes, ext: 'png', width, height, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * The colour a demo icon is drawn in: the mean of its opaque pixels, as `#rrggbb`; null when it cannot be read.
 * @param {Uint8Array | null} bytes
 */
export async function iconColourOf(bytes) {
  if (!bytes) return null
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
      .ensureAlpha()
      .resize(48, 48, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 128) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
    if (n === 0) return null
    const hex = (v) =>
      Math.round(v / n)
        .toString(16)
        .padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  } catch {
    return null
  }
}
