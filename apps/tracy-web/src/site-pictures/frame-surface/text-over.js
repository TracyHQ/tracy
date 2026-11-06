// Whether a block's text sits over a picture frame (ADR 0043 section 3e), from the kit's own data only. The kit says so
// for some frames (`kindEvidence.overPicture`, a frame shown as a background, or `textOver`); that is kept when true.
// Where it says no, code derives it: the frame's box covers most of its block's measured box (TEXT_OVER_SHARE of the
// block's area, and the frame fits inside the block), and the block has text (a text slot, demo text, a text row slot or
// a link). A full width band whose heading sits on its picture is the case the kit's measure misses (JA Boxing
// block-161.2: the demo heading, notice and button sit over the band picture, the kit says overPicture false).
// Pure: a kit block and frame in, a plain object out.
const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const num = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0

/** The share of its block's area a frame must cover for the block's text to sit over it. */
export const TEXT_OVER_SHARE = 0.85
const WIDTH = '1440'
const SLACK = 2

/** What the kit itself says: text over the picture. */
export const kitSaysTextOver = (frame) =>
  frame?.kindEvidence?.overPicture === true || frame?.shownAs === 'background' || frame?.textOver === true

/** Whether a kit block holds text the site shows: a text slot, demo text, a text row slot of a list, or a link. */
export function blockHasText(block) {
  const text = (s) => isObject(s) && (s.type === 'text' || s.type === 'html')
  return (
    arr(block?.slots).some(text) ||
    arr(block?.demoOwned).some(text) ||
    arr(block?.lists).some((l) => arr(l?.rowSlots).some(text)) ||
    arr(block?.links).length > 0
  )
}

/** The block's measured box at 1440: the box any of its frames was measured in (hideEvidence), or null. */
export function blockBoxOf(block) {
  for (const f of arr(block?.frames)) {
    const b = f?.hideEvidence?.measured?.[WIDTH]?.blockBefore
    if (isObject(b) && num(b.width) && num(b.height)) return { width: b.width, height: b.height }
  }
  return null
}

/**
 * @param {object} block a kit block
 * @param {object} frame one of its frames
 * @returns {{ textOver: boolean, textOverFrom: 'kit' | 'derived', share: number | null }}
 */
export function textOverOf(block, frame) {
  if (kitSaysTextOver(frame)) return { textOver: true, textOverFrom: 'kit', share: null }
  const box = frame?.kindEvidence?.box
  const area = blockBoxOf(block)
  // A box measured inside another element is in other coordinates (where.js): never compared.
  if (!isObject(box) || !num(box.width) || !num(box.height) || !area || frame?.kindEvidence?.measuredIn)
    return { textOver: false, textOverFrom: 'kit', share: null }
  const fits = box.width <= area.width + SLACK && box.height <= area.height + SLACK
  const share = Math.round(((box.width * box.height) / (area.width * area.height)) * 1000) / 1000
  if (fits && share >= TEXT_OVER_SHARE && blockHasText(block))
    return { textOver: true, textOverFrom: 'derived', share }
  return { textOver: false, textOverFrom: 'kit', share }
}
