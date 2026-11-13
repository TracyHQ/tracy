// How far a photo may be enlarged to fill a frame, in one place for every picture module (ticket #595 review). Pure.
//
// 🔒 AN OWN PHOTO IS NEVER ENLARGED (the locked planner rule "never enlarged"): the limit is 1. A crop of the frame's shape
// is whole pixels, so a photo exactly as large as the frame can come out a pixel short of it; `ENLARGE_TOLERANCE_PX`
// absorbs that rounding and nothing more.

/** The most an own photo is enlarged to fill a frame of the AI quickstart build: not at all. */
export const MAX_OWN_ENLARGE = 1
/** Pixels of rounding a crop may fall short of the width it must reach without counting as enlarged. */
export const ENLARGE_TOLERANCE_PX = 2

/**
 * Whether reaching `need` pixels from `have` enlarges past `limit`, the rounding tolerance aside.
 * @param {number} need the width the picture must be written at
 * @param {number} have the width of the crop it is cut from
 * @param {number} [limit] the most it may be enlarged (`MAX_OWN_ENLARGE` by default)
 */
export const enlargedPast = (need, have, limit = MAX_OWN_ENLARGE) =>
  need > have * limit + ENLARGE_TOLERANCE_PX
