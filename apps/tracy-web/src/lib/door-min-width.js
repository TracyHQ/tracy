// The narrowest file the write door takes for an image slot, as the plugin's SlotFit checkPicture judges it: a file
// narrower than `fit.minWidth` is refused (SLOT_IMAGE_TOO_SMALL) unless it is at least as wide as the demo file the slot
// holds, "because a contract cannot ask for more than its own sample has". A released content map measured before
// TracyHQ/tracy#646 asks one and a half times the box whatever the template ships (JA Diner 1.0.8: a 1440 px band asks
// 2160 px and ships 1600 px), so the picture step held owner photos to a width the door never asks. The demo file's
// size is the slot's `fit.source`, else the size its sample's address states (`?width=&height=`), the same order the
// door reads when the file on disk is the demo's. Null when the slot sets no minimum.

const isSize = (x) => Number.isInteger(x) && x > 0

/** The demo file size of a content map slot: fit.source, else the width and height its sample's image URL carries. */
export function demoFileSize(slot) {
  const src = slot?.fit?.source
  if (isSize(src?.width) && isSize(src?.height)) return { width: src.width, height: src.height }
  const q = /[?&]width=(\d+)&height=(\d+)/.exec(String(slot?.sample ?? ''))
  return q ? { width: Number(q[1]), height: Number(q[2]) } : null
}

/** @param {any} slot a content map slot @returns {number | null} */
export function doorMinWidthOf(slot) {
  const min = slot?.fit?.minWidth
  if (!isSize(min)) return null
  const demo = demoFileSize(slot)?.width
  return isSize(demo) && demo < min ? demo : min
}
