// Gallery tiles (owner decision 04/11/2026, ADR 0043 section 4): an `any-real` photo frame that is one item of a kit
// list whose items each hold a picture side by side (a gallery, a row of cards). Hiding one tile leaves a hole in the
// grid whatever the kit's canHide says, so a gallery tile is never hidden alone: when no new owner photo fits and no
// whole row may drop, it reuses an owner photo already on its page, cut to a clearly different region, never in a
// neighbouring tile. Read from the kit's list structure, never from canHide. Pure.

/** The most a reused cut may share with any other cut of the same photo, as a share of the smaller cut's area. */
export const REUSE_MAX_OVERLAP = 0.3
/**
 * The most an any-photo cut may share with another cut of the same photo on its pages (owner decision 06/11/2026,
 * card AK: a cut sharing 97% read as the same picture twice). One owner photo is never shown twice in one block.
 */
export const ANY_PHOTO_MAX_OVERLAP = 0.5

const arr = (x) => (Array.isArray(x) ? x : [])
const hasImage = (row) => arr(row?.slots).some((s) => s?.type === 'image')

/**
 * Every frame of the kit that sits in a picture list: frame id -> { block, list, index, columns }, `index` the row the
 * frame is in and `columns` the list's column count when the kit gives one (else null). A list counts when at least two
 * of its rows hold an image slot.
 * @param {object} kit the template kit
 * @returns {Map<string, { block: string, list: string, index: number, columns: number | null }>}
 */
export function galleryIndex(kit) {
  const out = new Map()
  for (const b of arr(kit?.blocks))
    for (const l of arr(b?.lists)) {
      const rows = arr(l?.rows)
      if (rows.filter(hasImage).length < 2) continue
      const columns = Number.isInteger(l.columns) && l.columns > 0 ? l.columns : null
      rows.forEach((row, i) => {
        const index = Number.isInteger(row?.index) ? row.index : i
        for (const s of arr(row?.slots))
          if (s?.type === 'image' && typeof s.id === 'string' && !out.has(s.id))
            out.set(s.id, { block: b.id, list: l.id, index, columns })
      })
    }
  return out
}

/**
 * Whether two tiles are neighbours: the same list and next to each other (index one apart), or one directly above the
 * other when the kit gives the list's columns.
 */
export function neighbours(a, b) {
  if (!a || !b || a.block !== b.block || a.list !== b.list) return false
  const d = Math.abs(a.index - b.index)
  return d === 1 || (a.columns !== null && d === a.columns)
}

const areaOf = (r) => Math.max(0, r.width) * Math.max(0, r.height)

/** The area two rectangles `{ x, y, width, height }` share, as a share of the smaller one's area (0 when one is empty). */
export function cropOverlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  const smaller = Math.min(areaOf(a), areaOf(b))
  return w > 0 && h > 0 && smaller > 0 ? (w * h) / smaller : 0
}
