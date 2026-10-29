// The neutral substitute of a signature slot (ADR 0040, spec TracyHQ/tracy#132): when the brief holds no signature, the
// slot shows the signer's name set in a script font, sized to the slot's Slot fit box (ADR 0039), so the layout stays
// complete and no demo hand stays. Never a guess: with no name to sign, the slot empties. Pure: no file, no network.
//
// A picture slot gets an SVG at the demo file's own size (else its desktop box); a text slot gets the name as text,
// shortened to its first name when the box holds fewer characters. A rasteriser (sharp) can turn the SVG into the file
// the slot needs; `font` lets a text slot style the name.

/** The script fonts tried in order; the generic `cursive` keeps any renderer on a hand-written face. */
export const SIGNATURE_FONT_FAMILY = "'Great Vibes', 'Allura', 'Brush Script MT', 'Segoe Script', cursive"
/** How wide a script letter is, as a share of the font size: the estimate a name is fitted with. */
export const SCRIPT_LETTER_WIDTH = 0.55

// Words of a person's relationship or role that make them the business's own signer.
const OWNER_WORDS = new Set(['owner', 'co-owner', 'founder', 'co-founder', 'proprietor'])
// Words that make an owner word speak of someone who no longer is one.
const PAST_WORDS = new Set(['former', 'previous', 'ex', 'late'])
/** The name is inked in a dark neutral unless the caller gives the template's own ink. */
const DEFAULT_INK = '#222222'

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')
const escapeXml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isOwner = (person) => {
  const words = `${text(person?.value?.relationship)} ${text(person?.value?.role)}`
    .toLowerCase()
    .split(/[^a-z-]+/)
  return words.some((w) => OWNER_WORDS.has(w)) && !words.some((w) => PAST_WORDS.has(w))
}

/** Who signs: the given name, else the slot's person, else the business's owner. */
function signerOf({ name, person, people }) {
  if (text(name)) return { name: text(name), factRefs: [] }
  if (text(person?.value?.name))
    return { name: text(person.value.name), factRefs: [person.id].filter(Boolean) }
  const owner = (Array.isArray(people) ? people : []).find((p) => text(p?.value?.name) && isOwner(p))
  return owner ? { name: text(owner.value.name), factRefs: [owner.id].filter(Boolean) } : null
}

/** The size a slot's substitute is drawn at: the demo file's, else its desktop box, else its first box. */
function sizeOf(fit) {
  // Measured boxes may hold fractional pixels: drawn at the nearest whole pixel.
  const drawn = (b) => Math.round(b?.width) >= 1 && Math.round(b?.height) >= 1
  const boxes = fit?.boxes && typeof fit.boxes === 'object' ? fit.boxes : {}
  const box = [fit?.source, boxes.desktop, ...Object.values(boxes)].find(drawn)
  return box ? { width: Math.round(box.width), height: Math.round(box.height) } : null
}

/** The largest font size at which `chars` script letters fit `width` x `height`, with a margin. */
function fontSizeFor(chars, { width, height }) {
  const byHeight = height * 0.7
  const byWidth = (width * 0.9) / (Math.max(chars, 1) * SCRIPT_LETTER_WIDTH)
  return Math.max(1, Math.floor(Math.min(byHeight, byWidth)))
}

/**
 * The script signature for one slot.
 * @param {object} input
 * @param {string} [input.name] - the signer's name, when the caller already knows it
 * @param {{id?: string, value?: {name?: string}}} [input.person] - the person the slot's group is locked to
 * @param {Array<{id?: string, value?: {name?: string, relationship?: string, role?: string}}>} [input.people] - the
 *   profile's accepted people, read for the owner when no name or person is given
 * @param {object} input.fit - the slot's Slot fit (`fit` of a content map slot)
 * @param {string} [input.ink] - the colour the name is written in (a CSS colour), else a dark neutral
 * @returns {{state: 'neutral', reason: 'no-brief-signature', text: string, factRefs: string[],
 *   font: {family: string, size: number}, width: number, height: number, svg?: string}
 *   | {state: 'empty', reason: 'no-signer-name' | 'no-slot-box' | 'name-too-long'}}
 *   `svg` only for a picture slot (a fit with `kind`); a text slot is styled with `font`.
 */
export function scriptSignature({ name, person, people, fit, ink = DEFAULT_INK } = {}) {
  const signer = signerOf({ name, person, people })
  if (!signer) return { state: 'empty', reason: 'no-signer-name' }
  const size = sizeOf(fit)
  if (!size) return { state: 'empty', reason: 'no-slot-box' }
  const { width, height } = size
  const base = { state: 'neutral', reason: 'no-brief-signature', factRefs: signer.factRefs }
  if (!fit.kind) {
    // A text slot: the name within its characters, else the first name, else nothing.
    const limit = Number.isInteger(fit.maxCharacters) && fit.maxCharacters > 0 ? fit.maxCharacters : Infinity
    const first = signer.name.split(/\s+/)[0]
    const written = signer.name.length <= limit ? signer.name : first.length <= limit ? first : ''
    if (!written) return { state: 'empty', reason: 'name-too-long' }
    const font = { family: SIGNATURE_FONT_FAMILY, size: fontSizeFor([...written].length, size) }
    return { ...base, text: written, font, width, height }
  }
  const font = { family: SIGNATURE_FONT_FAMILY, size: fontSizeFor([...signer.name].length, size) }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(font.family)}"` +
    ` font-size="${font.size}" fill="${escapeXml(String(ink))}">${escapeXml(signer.name)}</text></svg>`
  return { ...base, text: signer.name, font, width, height, svg }
}
