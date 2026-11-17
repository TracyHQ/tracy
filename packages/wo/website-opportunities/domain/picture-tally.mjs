// The picture counts of a placement (#575 pictures gap audit): what a plan card and a build report can say truthfully.
// A spot (a frame) and a photo are two counts: one photo may fill several spots (a person's photo on two pages, an
// item's photo reused at a near shape), so "14 of your 19 photos" counted spots against photos. Pure.
//
//   photos     the owner's own photos the plan holds (stock ones included: they are the owner's to see refused)
//   placed     the photos that fill at least one spot
//   unused     every other photo, grouped by a coded reason: photos = placed + every unused count
//   spots      the spots the owner's photos fill (a light and dark pair counts once, `assignPictures` counts.own)
//   empty      the spots left without a picture, grouped by their reason (the brand step's logo spot left out)
//   drawn      the spots Tracy will draw (counts.generated)
import { unfitReason } from './picture-fit.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Entries `{code, count}` of a list of codes, in the order each code first appears. */
function grouped(codes) {
  const counts = new Map()
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1)
  return [...counts].map(([code, count]) => ({ code, count }))
}

/**
 * Why an own picture fills no frame: `stock`, `item_dropped` (its gallery item left the plan), the reason it does not
 * fit its own item's frame (`picture-fit.mjs`), `frame_taken`, or `no_fitting_frame`.
 * @param {object} assignment `assignPictures` output
 */
export function unusedReasonOf(picture, assignment) {
  if (picture.stock) return 'stock'
  if (list(assignment.reduced).some((r) => r.item === picture.item)) return 'item_dropped'
  const frame = list(assignment.frames).find((f) => f.item && f.item === picture.item && f.place !== 'video')
  return frame ? (unfitReason(picture, frame) ?? 'frame_taken') : 'no_fitting_frame'
}

/** The empty spots the customer is told about: every empty frame but the brand step's logo and a pair's variant. */
export const emptySpotsOf = (frames) =>
  list(frames).filter((f) => f.source === 'none' && !f.sameAs && f.reason !== 'logo_from_brand_step')

/**
 * @param {{frames: object[], reduced?: object[], counts: {own: number, generated: number}}} assignment
 * @param {object[]} pictures every own picture record the placement was given
 * @returns {{photos: number, placed: number, unused: Array<{code: string, count: number}>, spots: number,
 *   empty: Array<{code: string, count: number}>, emptySpots: number, drawn: number}}
 */
export function pictureTallyOf(assignment, pictures) {
  const photos = list(pictures).filter((p) => p?.media === 'photo')
  const used = new Set(
    list(assignment.frames)
      .filter((f) => f.source === 'own')
      .map((f) => f.picture)
  )
  const placed = photos.filter((p) => used.has(p.id))
  const unused = photos.filter((p) => !used.has(p.id)).map((p) => unusedReasonOf(p, assignment))
  const empty = emptySpotsOf(assignment.frames).map((f) => f.reason)
  return {
    photos: photos.length,
    placed: placed.length,
    unused: grouped(unused),
    spots: assignment.counts.own,
    empty: grouped(empty),
    emptySpots: empty.length,
    drawn: assignment.counts.generated
  }
}
