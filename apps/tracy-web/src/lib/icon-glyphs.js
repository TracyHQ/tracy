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
    '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 19.5c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5"/><path d="M14.5 14.5c2.8-.6 5.6 1 6.5 4.5"/>',
  // Finer meanings (spec TracyHQ/tracy#189): items of one section each take their own glyph, so near trades need their own.
  padel:
    '<path d="M12 2.8c3.9 0 6.5 2.8 6.5 6.6 0 3.3-2 5.8-4.8 6.5V20a1.7 1.7 0 0 1-3.4 0v-4.1c-2.8-.7-4.8-3.2-4.8-6.5 0-3.8 2.6-6.6 6.5-6.6z"/><circle cx="9.5" cy="7.5" r=".55"/><circle cx="12" cy="6.5" r=".55"/><circle cx="14.5" cy="7.5" r=".55"/><circle cx="9.5" cy="10.5" r=".55"/><circle cx="12" cy="9.5" r=".55"/><circle cx="14.5" cy="10.5" r=".55"/><circle cx="12" cy="12.5" r=".55"/>',
  squash:
    '<path d="M10.5 13.5C7.5 10.5 8 5.5 11.5 3.8c3.6-1.7 8 1 7.8 5-.2 3.4-4.5 6.5-8.8 4.7z"/><path d="M10.5 13.5L4 20"/><path d="M12.5 6.5l4 4M11 9l3 3M14.5 5l3 3"/><circle cx="18.5" cy="18.5" r="1.8"/>',
  shuttlecock:
    '<path d="M9.5 16.5L6 4h12l-3.5 12.5z"/><path d="M10.5 16.5L10.2 4M13.5 16.5l.3-12.5M7.2 8.5h9.6M8.3 12.5h7.4"/><path d="M9.5 16.5h5v.5a2.5 2.5 0 0 1-5 0z"/>',
  pickleball:
    '<rect x="3.5" y="3" width="10.5" height="11.5" rx="4"/><path d="M8.75 14.5v6"/><circle cx="17.5" cy="16.5" r="3.5"/><circle cx="16.3" cy="15.7" r=".5"/><circle cx="18.7" cy="15.7" r=".5"/><circle cx="17.5" cy="17.7" r=".5"/>',
  kettlebell: '<path d="M8.6 10.3V7.5a3.4 3.4 0 0 1 6.8 0v2.8"/><path d="M7.5 20.5a6 6 0 1 1 9 0z"/>',
  'yoga-mat':
    '<ellipse cx="6.5" cy="12" rx="3" ry="5.5"/><path d="M6.5 6.5h11c1.7 0 3 2.5 3 5.5s-1.3 5.5-3 5.5h-11"/><path d="M6.5 12c0-1 .6-1.6 1.2-1.2"/>',
  running:
    '<path d="M3 17V9.5l3.2-.7 2.3 2.7c1.6 1.6 3.6 2.2 6 2.4l4.8.8a2.6 2.6 0 0 1 2.2 2.6v.7z"/><path d="M3 20h18"/><path d="M9 12.8l1.6-1.6M11.6 13.8l1.6-1.6"/>',
  trophy:
    '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5a2.8 2.8 0 0 0 3.2 4.2M16 5.5h3a2.8 2.8 0 0 1-3.2 4.2"/><path d="M12 13v3.5M8.5 20.5h7M9.5 16.5h5v4h-5z"/>',
  bike: '<circle cx="5.8" cy="15.5" r="3.8"/><circle cx="18.2" cy="15.5" r="3.8"/><path d="M5.8 15.5L9.5 8.5h6l2.7 7M9.5 8.5l3 7h-6.7M15.5 8.5l-.8-2.5h-2.2"/>',
  bread:
    '<path d="M4.8 10.6A3.4 3.4 0 0 1 6.5 4h11a3.4 3.4 0 0 1 1.7 6.6V19a1.5 1.5 0 0 1-1.5 1.5H6.3A1.5 1.5 0 0 1 4.8 19z"/>',
  croissant:
    '<path d="M2.5 15c1-1.6 2.6-2.1 4.2-1.5.6-4 2.7-6.8 5.3-6.8s4.7 2.8 5.3 6.8c1.6-.6 3.2-.1 4.2 1.5-1 1.6-3 2.1-4.6 1.4-.9 1.5-2.7 2.4-4.9 2.4s-4-.9-4.9-2.4c-1.6.7-3.6.2-4.6-1.4z"/><path d="M9.3 8c-.7 3-.7 7 .3 10.4M14.7 8c.7 3 .7 7-.3 10.4"/>',
  pizza:
    '<path d="M12 21L3.5 6.5c5-3 12-3 17 0z"/><path d="M5.2 9.4c4.4-2.3 9.2-2.3 13.6 0"/><circle cx="10" cy="12" r="1"/><circle cx="14.3" cy="12.8" r="1"/><circle cx="12" cy="16.3" r=".8"/>',
  'coffee-bean':
    '<ellipse cx="12" cy="12" rx="6" ry="8.8" transform="rotate(35 12 12)"/><path d="M16.2 6.3c-3 2.2-4 3.8-3.6 5.8.4 2-.6 3.6-3.6 5.8"/>',
  wine: '<path d="M7.5 3.5h9l-.4 5a4.1 4.1 0 0 1-8.2 0z"/><path d="M12 12.6v7.9M8.5 20.5h7"/>',
  braces:
    '<path d="M7 3.5c-2.5 0-3.5 2.5-3 5 .4 2 1.5 3 1.8 5.5L6.5 19c.2 1.5 2 1.5 2.3 0l.9-4c.3-1.2 1.2-1.6 2.3-1.6s2 .4 2.3 1.6l.9 4c.3 1.5 2.1 1.5 2.3 0l.7-5c.3-2.5 1.4-3.5 1.8-5.5.5-2.5-.5-5-3-5-2 0-3 1-5 1s-3-1-5-1z"/><path d="M2 9.5h20"/><rect x="10" y="7.8" width="4" height="3.4" rx=".6"/>',
  whitening:
    '<path d="M7 3.5c-2.5 0-3.5 2.5-3 5 .4 2 1.5 3 1.8 5.5L6.5 19c.2 1.5 2 1.5 2.3 0l.9-4c.3-1.2 1.2-1.6 2.3-1.6s2 .4 2.3 1.6l.9 4c.3 1.5 2.1 1.5 2.3 0l.7-5c.3-2.5 1.4-3.5 1.8-5.5.5-2.5-.5-5-3-5-2 0-3 1-5 1s-3-1-5-1z"/><path d="M12 6.4c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6z"/>',
  implant:
    '<path d="M6.8 3.5h10.4a1.6 1.6 0 0 1 1.6 1.7c-.2 2.8-1.9 5-4.4 5H9.6c-2.5 0-4.2-2.2-4.4-5a1.6 1.6 0 0 1 1.6-1.7z"/><path d="M9.5 10.2v8.3L12 21l2.5-2.5v-8.3"/><path d="M9.5 13.3h5M9.5 16.3h5"/>',
  stethoscope:
    '<path d="M5.5 3.5v5a4.5 4.5 0 0 0 9 0v-5"/><path d="M10 13v2.5a4.5 4.5 0 0 0 9 0v-2"/><circle cx="19" cy="11.5" r="2"/>',
  pill: '<g transform="rotate(-45 12 12)"><rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>',
  lipstick:
    '<rect x="7.5" y="13" width="9" height="8" rx="1.2"/><path d="M9.5 13V7.8l5-3.3V13"/><path d="M7.5 16h9"/>',
  'nail-polish':
    '<rect x="6.5" y="11" width="11" height="10" rx="2.2"/><path d="M9.5 11V8.2h5V11"/><path d="M10.5 8.2V3h3v5.2"/>',
  face: '<circle cx="12" cy="12" r="8.8"/><path d="M7.8 10.5c.8.9 2 .9 2.8 0M13.4 10.5c.8.9 2 .9 2.8 0"/><path d="M9.5 15c1.5 1.2 3.5 1.2 5 0"/>',
  stones:
    '<ellipse cx="12" cy="17.6" rx="7.5" ry="2.9"/><ellipse cx="12" cy="12.3" rx="5.2" ry="2.3"/><ellipse cx="12" cy="7.6" rx="3.2" ry="1.9"/>',
  key: '<circle cx="7.5" cy="16.5" r="4"/><path d="M10.4 13.6L20 4M16.2 7.8l2.8 2.8M13.9 10.1l2 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
  child:
    '<circle cx="12" cy="6" r="3"/><path d="M8.5 20.5v-5.5a3.5 3.5 0 0 1 7 0v5.5"/><path d="M8.5 14.5L5.5 11.5M15.5 14.5l3-3"/>',
  graduation:
    '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3 2.5 8 2.5 11 0v-4.5"/><path d="M21.5 9.5v5"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.2 2.2"/>',
  'map-pin':
    '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
  phone:
    '<path d="M5.2 3.8h3.3l1.6 4.1-2.1 1.5a11 11 0 0 0 6.6 6.6l1.5-2.1 4.1 1.6v3.3a1.6 1.6 0 0 1-1.7 1.6A16.4 16.4 0 0 1 3.6 5.5a1.6 1.6 0 0 1 1.6-1.7z"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10.5 5.5 7 4.5 6.5 6.5S9 8.5 12 8.5zM12 8.5c1.5-3 5-4 5.5-2S15 8.5 12 8.5z"/>',
  truck:
    '<path d="M2.5 6h11.5v10.5H2.5zM14 9.5h4.2l3.3 3.8v3.2H14"/><circle cx="6.5" cy="18" r="1.9"/><circle cx="17.5" cy="18" r="1.9"/>',
  plug: '<path d="M9 3v4M15 3v4"/><path d="M6.5 7h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 15.5V21"/>',
  drop: '<path d="M12 3.2s6.2 6.6 6.2 10.8a6.2 6.2 0 0 1-12.4 0c0-4.2 6.2-10.8 6.2-10.8z"/>',
  'paint-roller':
    '<rect x="3.5" y="3.5" width="13.5" height="5" rx="1.2"/><path d="M17 6h3v5.5h-8.5V14"/><rect x="10" y="14" width="3" height="7" rx="1"/>',
  bed: '<path d="M3 18.5V5.5M3 14.5h18v4M21 14.5v-2a3 3 0 0 0-3-3h-7.5v5"/><circle cx="6.8" cy="11.2" r="1.9"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5"/>',
  // Neutral marks: no meaning, so items of one section that nothing matches still differ from each other.
  spark: '<path d="M12 3c.6 4.9 3.1 7.4 8 8-4.9.6-7.4 3.1-8 8-.6-4.9-3.1-7.4-8-8 4.9-.6 7.4-3.1 8-8z"/>',
  'circle-dot': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  diamond: '<path d="M12 3l8.5 9-8.5 9-8.5-9z"/>',
  hexagon: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>'
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
 * The colour a demo icon is drawn in, as `#rrggbb`; null when it cannot be read.
 *
 * 🔒 THE INK, NOT THE AVERAGE. A demo icon may carry its own ground: a filled disc or tile behind a line glyph (a black
 * disc under red strokes for a dark section). The average of all its pixels is then the ground's colour more than the
 * glyph's, and a glyph drawn in it disappears on the section the demo was made for (measured on a local brief build: red
 * strokes on a black disc gave #231515, a near-black glyph on a dark band). So: when one colour fills most of the icon's
 * box (a ground), the ink is the other colour that contrasts most with it, held to 3:1 against that ground; without a
 * ground, the mean of the opaque pixels.
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
    /** @type {Map<string, {r: number, g: number, b: number, n: number, x0: number, x1: number, y0: number, y1: number}>} */
    const clusters = new Map()
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0, p = 0; i < data.length; i += info.channels, p += 1) {
      if (data[i + 3] < 128) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
      const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`
      const x = p % info.width
      const y = Math.floor(p / info.width)
      const c = clusters.get(key) ?? { r: 0, g: 0, b: 0, n: 0, x0: x, x1: x, y0: y, y1: y }
      c.r += data[i]
      c.g += data[i + 1]
      c.b += data[i + 2]
      c.n += 1
      c.x0 = Math.min(c.x0, x)
      c.x1 = Math.max(c.x1, x)
      c.y0 = Math.min(c.y0, y)
      c.y1 = Math.max(c.y1, y)
      clusters.set(key, c)
    }
    if (n === 0) return null
    const colourOf = (/** @type {{r: number, g: number, b: number, n: number}} */ c) => ({
      r: c.r / c.n,
      g: c.g / c.n,
      b: c.b / c.n
    })
    const ranked = [...clusters.values()].sort((a, z) => z.n - a.n)
    const top = ranked[0]
    const area = info.width * info.height
    // A ground: one colour over a third of the box, spanning most of it both ways.
    const ground =
      top.n >= area / 3 && top.x1 - top.x0 + 1 >= info.width * 0.7 && top.y1 - top.y0 + 1 >= info.height * 0.7
        ? colourOf(top)
        : null
    if (!ground) return hexOf({ r: r / n, g: g / n, b: b / n })
    const behind = luminance(ground)
    // The ink: the pixels that stand apart from the ground, averaged; the ones reaching 3:1 when there are enough of them,
    // so the glyph's anti-aliased edge does not dull it.
    const inkOver = (/** @type {number} */ bar) => {
      const ink = { r: 0, g: 0, b: 0, n: 0 }
      for (const c of ranked.slice(1))
        if (contrast(luminance(colourOf(c)), behind) >= bar) {
          ink.r += c.r
          ink.g += c.g
          ink.b += c.b
          ink.n += c.n
        }
      return ink.n >= n * 0.03 ? ink : null
    }
    const ink = inkOver(3) ?? inkOver(1.5) ?? inkOver(0)
    if (!ink) return hexOf({ r: r / n, g: g / n, b: b / n })
    const colour = colourOf(ink)
    return hexOf(contrast(luminance(colour), behind) >= 3 ? colour : towardContrast(colour, behind))
  } catch {
    return null
  }
}

/** `#rrggbb` of a colour. @param {{r: number, g: number, b: number}} c */
const hexOf = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** WCAG relative luminance. @param {{r: number, g: number, b: number}} c */
function luminance({ r, g, b }) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast of two luminances. */
const contrast = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * The colour moved toward white (on a dark ground) or black (on a light one) until it reaches 3:1 against the ground.
 * @param {{r: number, g: number, b: number}} c @param {number} behind - the ground's luminance
 */
function towardContrast(c, behind) {
  const to = behind < 0.18 ? 255 : 0
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = { r: c.r + (to - c.r) * t, g: c.g + (to - c.g) * t, b: c.b + (to - c.b) * t }
    if (contrast(luminance(mixed), behind) >= 3) return mixed
  }
  return { r: to, g: to, b: to }
}
