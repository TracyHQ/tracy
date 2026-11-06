// The rungs of the fallback ladder (#344, ADR 0043 section 4), in the order a frame climbs them, and the plan reading
// the "fewer rows" rung needs. Pure.
//
// A `specific` frame is drawn (one redraw with the looker's fault names), then takes the next owner photo, then its row
// is dropped, then it is hidden, then returned to the planner. An `any-real` frame is never drawn or extended: it starts
// at the next photo. A `person` frame is never drawn and never takes another photo: it is hidden or returned.
// A cut-out frame (#346) never takes an owner photo (no photo is cut out): a `specific` one is drawn on a plain ground,
// redrawn once, then hidden or returned; any other cut-out (a person, any real photo) is never drawn: hidden or returned.
// A gallery tile (an any-real frame of a picture list, gallery-tiles.js) is never hidden alone: after the next photo
// and fewer rows it reuses an owner photo already on its page, cut to another region, then takes any usable owner
// photo (any-photo, heads whole, not its neighbour's photo, not another tile's very cut); returned only after that.
//
// A frame the plan wants filled is never left without a picture while one can be had (owner decision 06/11/2026, card
// AJ): before `return`, a drawn frame is drawn again in other compositions (`redraw-alt`, the subject whole and centred
// with a margin, in the frame's shape, at most REDRAW_ALT_TRIES), and any frame that is not a person keeps the best
// picture the looker rejected for minor faults only (`best-rejected`, looker-call.js MINOR_FAULTS). Only a frame whose
// every picture had a hard fault, or that got no picture at all, is still returned, and the picture package names it
// as a problem (contract-mapping.js).

/** The rungs per plan match. */
export const RUNGS = Object.freeze({
  specific: Object.freeze([
    'draw',
    'redraw',
    'next-photo',
    'fewer-rows',
    'hide',
    'redraw-alt',
    'best-rejected',
    'return'
  ]),
  'any-real': Object.freeze(['next-photo', 'fewer-rows', 'hide', 'best-rejected', 'return']),
  person: Object.freeze(['hide', 'return']),
  cutout: Object.freeze(['draw', 'redraw', 'hide', 'redraw-alt', 'best-rejected', 'return']),
  gallery: Object.freeze(['next-photo', 'fewer-rows', 'reuse', 'any-photo', 'best-rejected', 'return'])
})

/** The drawing rungs: one picture from the drawer door each. */
export const DRAW_RUNGS = new Set(['draw', 'redraw', 'redraw-alt'])

/**
 * The rungs of a plan wish in its kit frame (an unknown match climbs only the rungs that place nothing new).
 * `galleryTile`: the frame is a gallery tile (the picture check index's galleryTile).
 */
export function rungsOf(wish, frame = null, galleryTile = false) {
  if (frame?.kind === 'cutout') return wish?.match === 'specific' ? RUNGS.cutout : RUNGS.person
  if (galleryTile && wish?.match === 'any-real') return RUNGS.gallery
  return RUNGS[wish?.match] ?? RUNGS.person
}

/** The rungs of one frame of the round's index. */
export const rungsFor = (idx, frameId) =>
  rungsOf(idx.wishes.get(frameId), idx.frames.get(frameId), Boolean(idx.galleryTile?.(frameId)))

/**
 * Whether a plan has a cut-out frame that is drawn (a `specific` one the kit lets be written, no twin): such a run
 * needs the drawer door.
 * @param {object} idx the picture check's index of plan and kit (picture-check/inputs-index.js)
 */
export function drawsCutouts(idx) {
  for (const [frameId, wish] of idx.wishes) {
    const frame = idx.frames.get(frameId)
    if (frame?.kind !== 'cutout' || frame.writable === false || frame.twinOf || wish.sameAs) continue
    if (wish.match === 'specific') return true
  }
  return false
}

const arr = (x) => (Array.isArray(x) ? x : [])

/**
 * The list row of the plan a frame sits in: `{ block, list, rows, frames }` with the frames of that row's item, or null
 * when the frame is not in a list row. Only kept blocks of kept pages and the shared blocks are read.
 */
export function rowOf(plan, frameId) {
  const blocks = [
    ...arr(plan?.sharedBlocks),
    ...arr(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .flatMap((p) => arr(p.blocks))
  ].filter((d) => d?.decision !== 'hide')
  for (const d of blocks)
    for (const l of arr(d.lists))
      for (const item of arr(l?.items)) {
        const frames = arr(item?.pictures)
          .map((p) => p?.frame)
          .filter((f) => typeof f === 'string')
        if (frames.includes(frameId))
          return { block: d.block, list: l.list, rows: Number(l.rows) || arr(l.items).length, frames }
      }
  return null
}

/**
 * Whether the kit lets a list show one row fewer than `now`: the kit lists it, its rows are not content items of their
 * own (those belong to the planner), and one fewer is still at least its `min` (1 when it names none). Returns the
 * reason it may not, or null when it may.
 */
export function fewerRowsRefusal(kit, row, now) {
  const block = arr(kit?.blocks).find((b) => b?.id === row.block)
  const list = arr(block?.lists).find((l) => l?.id === row.list)
  if (!list) return `the kit does not list ${row.list}`
  if (list.rowKind === 'items') return `each row of ${row.list} is a content item of its own`
  const min = typeof list.min === 'number' ? list.min : 1
  if (now - 1 < min) return `${row.list} shows at least ${min} rows`
  return null
}
