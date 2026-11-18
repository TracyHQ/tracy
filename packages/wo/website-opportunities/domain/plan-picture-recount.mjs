// The pictures of a changed plan counted again the way the composer's gate counts them (#575 build chat): a plan edit
// or a plan card operation (`plan-edit-gate.mjs`) changes the pages, so the pictures summary, the photos the left out
// list names and the videos line follow the new pages, with the same rules as at compose time
// (`plan-gate.mjs`): a photo the owner keeps off the site or the left out list keeps off (an `owner_removed` part, a
// photo asked off) fills no frame; a `no_gallery_room` photo a frame takes is placed, not left out; an unused photo is
// counted under the code of the left out entry naming it (`plan-picture-count.mjs`); the videos with no place are said
// once with their count (`plan-videos.mjs`). Counting again with the edit gate's old call (no left out codes) gave a
// plan whose summary said 0 photos `owner_removed` while its list said 6. Pure.
import { picturesOf } from './plan-look-pictures.mjs'
import { leftOutCodesOf, leftOutKeptOff, withoutPlacedPhotos } from './plan-picture-count.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The left out entry of the owner's videos the plan has no place for (`plan-videos.mjs`). */
export const isVideosLine = (e) =>
  e?.kind === 'feature' && e?.code === 'no_place_in_design' && e?.params?.known !== undefined

/** `leftOut` with its videos line replaced by `line` in place, added at the end, or taken out when `line` is null. */
function withVideosLine(leftOut, line) {
  const at = leftOut.findIndex(isVideosLine)
  if (at < 0) return line ? [...leftOut, line] : leftOut
  return line ? leftOut.map((e, i) => (i === at ? line : e)) : leftOut.filter((_, i) => i !== at)
}

/**
 * The pictures summary and the left out list of a plan's pages, counted again.
 * @param {{pages: object[], leftOut?: object[]}} plan
 * @param {Map<string, object>} blocks block id -> its description
 * @param {ReturnType<import('./plan-data.mjs').planDataOf>} data
 * @returns {{pictures: object, leftOut: object[]}}
 */
export function recountedPictures(plan, blocks, data) {
  const leftOut = list(plan.leftOut)
  const keepOff = new Set([...list(data?.withheld), ...leftOutKeptOff(leftOut)])
  const counted = picturesOf(plan.pages, blocks, data, { keepOff })
  const framed = withoutPlacedPhotos(leftOut, counted.placedItems)
  const next = withVideosLine(list(framed.leftOut), counted.leftOut.find(isVideosLine) ?? null)
  return { pictures: counted.recount(leftOutCodesOf(next)), leftOut: next }
}
