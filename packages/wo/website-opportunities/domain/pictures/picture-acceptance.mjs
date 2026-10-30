// The picture stage's acceptance check (spec TracyHQ/tracy#189, site build criteria 3.1, 3.4, 3.6 and 9.2): every
// picture a build places, an owner photo or a drawing, is checked before it is used, on every CMS.
//
//   drawing  the photo labeller the build already has reads the drawing once more, told what the frame shows, and names
//            the faults it sees (`DRAWING_DEFECTS`); a fault refuses the drawing, which is drawn once more with the fault
//            named in its prompt (`avoidLine`), then the frame tries the owner's photos, then a neutral fill.
//   weight   every uploaded picture is at most twice the widest box the template shows it in (`weightCapOf`) and at most
//            `pictureByteBudget` bytes, re-encoded at a lower quality until it is (`JPEG_QUALITIES`).
//
// Decision faces = B (COO 30/10/2026): a drawing MAY show people with clear faces. What is refused is a face or a body the
// model drew wrong, never a face as such. Pure and deterministic.

/** The faults a drawing is refused for, each a code a receipt names, with the words the labeller and the redraw read. */
export const DRAWING_DEFECTS = Object.freeze({
  'garbled-lettering': 'letters, words, numbers or signs, readable or not',
  'distorted-face': 'a face that is warped, melted, doubled or has wrong or missing features',
  'distorted-body':
    'a body drawn wrong: extra or missing fingers, hands or limbs, an impossible pose, people merged together',
  'visible-seam':
    'a visible join or patch: an edge where the light, sharpness, colour or perspective changes, or a repeated strip',
  'other-trade': "a scene, equipment or activity of another trade than the business's",
  'off-topic': 'something other than what the picture was drawn to show'
})

/**
 * The inspection the labeller is given with a drawing: what the frame must show and the faults to name.
 * @param {{trade?: string | null, shows?: string | null}} expect
 */
export function inspectionClause(expect) {
  const trade = typeof expect?.trade === 'string' && expect.trade.trim() ? expect.trade.trim() : null
  const shows = typeof expect?.shows === 'string' && expect.shows.trim() ? expect.shows.trim() : null
  const quote = (text) => `"${text.replace(/\s+/g, ' ').replace(/"/g, "'").slice(0, 200)}"`
  const lines = Object.entries(DRAWING_DEFECTS).map(([code, words]) => `  "${code}": ${words}`)
  return [
    `Each picture here was drawn by an image model for the website of a business${trade ? ` (trade: ${trade})` : ''}${shows ? `, to show ${quote(shows)}` : ''}.`,
    'Also answer "defects": the list of the faults you see in it, from these codes, [] when there is none:',
    ...lines,
    'People and clear faces are allowed; name a face only when it is drawn wrong. When the picture shows another sport, craft or service than the one it was drawn to show (a padel court for a tennis lesson, say), answer "off-topic".'
  ].join('\n')
}

/** The defect codes a labeller answer names, in the vocabulary's order; unknown words are dropped. */
export function defectsOf(value) {
  if (!Array.isArray(value)) return []
  const said = new Set(value.map((v) => String(v).trim()))
  return Object.keys(DRAWING_DEFECTS).filter((code) => said.has(code))
}

/**
 * The line a redraw's prompt carries after a drawing was refused, naming the fault; empty for no known fault.
 * @param {string | null | undefined} reason - a refusal reason (`drawnPictureVerdict`)
 */
export function avoidLine(reason) {
  const alias = { 'text-found': 'garbled-lettering', 'blurred-region': 'visible-seam' }
  const code = String(reason ?? '')
  const words = DRAWING_DEFECTS[alias[code] ?? code]
  return words
    ? `\nA first drawing for this frame was refused because it showed ${words}: this one must not.`
    : ''
}

/** JPEG qualities tried in turn until a picture is within its byte budget (9.2): the first is the stage's own. */
export const JPEG_QUALITIES = Object.freeze([80, 72, 64, 56])
/** Bytes a picture may weigh per pixel: about 230 KB for a 1920 x 1080 hero, 40 KB for a 600 x 400 card. */
export const BYTES_PER_PIXEL = 0.11
/** The least budget, so a small icon or thumbnail is never squeezed to mush. */
const MIN_BUDGET = 24_000
/** The widest picture written when the template declares no box it is shown in. */
export const WIDTH_CAP = 2560

/** The most bytes a picture of `width` x `height` may weigh once uploaded. */
export function pictureByteBudget(width, height) {
  const area = Math.max(0, Number(width) || 0) * Math.max(0, Number(height) || 0)
  return Math.max(MIN_BUDGET, Math.round(area * BYTES_PER_PIXEL))
}

/**
 * The widest a picture may be written for its slots: twice the widest box the template shows it in (a sharp picture on a
 * 2x screen), never under the width the site itself asks (`minWidth`), and `WIDTH_CAP` when no box is declared.
 * @param {{shown?: number | null, minWidth?: number | null}} input
 */
export function weightCapOf({ shown = null, minWidth = null } = {}) {
  const box = Number(shown) > 0 ? Number(shown) * 2 : WIDTH_CAP
  return Math.max(Math.round(box), Number(minWidth) > 0 ? Number(minWidth) : 0)
}
