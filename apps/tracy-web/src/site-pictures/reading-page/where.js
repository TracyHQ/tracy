// Where a frame sits on the template (the picture reading page, #341): the kit's measured box of a frame placed on a
// 1440 wide shot, the page shot when it shows the page the box was measured on, else the block shot offset by the
// block's measured box, else nothing. Pure: the kit and the shot sizes in, a plain object out. A box that cannot be
// placed on a shot that is known to show it is "not measured", never a guess.
//
// Measured on JA Boxing 1.0.10: a frame's box is in the coordinates of the FIRST kit page whose 1440 block list holds
// the frame's block. That page's shot matches the block shot at the measured block box only when the page has its own
// shot (images["1440"] is "<page id>-1440"); a page that borrows another page's shot does not match, so it is never used.
// A box with a measuredIn is in another element's coordinates and is never drawn.
const WIDTH = '1440'
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const num = (n) => typeof n === 'number' && Number.isFinite(n)

/** A measured box: numbers for left, top, width and height, with a size. */
const boxOf = (b) =>
  isObject(b) && num(b.left) && num(b.top) && num(b.width) && num(b.height) && b.width > 0 && b.height > 0
    ? { left: b.left, top: b.top, width: b.width, height: b.height }
    : null
const inside = (box, area) =>
  box.left >= area.left - 1 &&
  box.top >= area.top - 1 &&
  box.left + box.width <= area.left + area.width + 1 &&
  box.top + box.height <= area.top + area.height + 1
const sameSize = (a, b) => Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2

/**
 * @param {object} kit the template kit JSON (pages[], blocks[].frames[])
 * @param {(imageId: string) => { width: number, height: number } | null} shotSize the size of a kit image, or null
 * @returns {(frameId: string) => object | null} null for a frame the kit does not hold
 */
export function framePlaces(kit, shotSize) {
  const frames = new Map()
  for (const b of Array.isArray(kit?.blocks) ? kit.blocks : [])
    for (const f of Array.isArray(b?.frames) ? b.frames : [])
      if (isObject(f) && typeof f.id === 'string' && !frames.has(f.id))
        frames.set(f.id, { frame: f, block: b })
  const pages = Array.isArray(kit?.pages) ? kit.pages.filter(isObject) : []
  const pagesOf = (blockId) => pages.filter((p) => (p.blocks?.[WIDTH] ?? []).includes(blockId))

  // The box of one frame on a shot, or the reason it cannot be placed.
  function measure({ frame, block }, pageList) {
    const box = boxOf(frame.kindEvidence?.box)
    if (!box) return { reason: 'the kit holds no box for this frame' }
    // A box measured inside another element (kindEvidence.measuredIn, e.g. "main-body" or a module) is not in the
    // coordinates of any shot: drawn on JA Boxing every one of them lands beside the picture.
    if (frame.kindEvidence?.measuredIn)
      return { reason: `the box was measured inside ${frame.kindEvidence.measuredIn}, not on the page` }
    const first = pageList[0]
    const own = first && first.images?.[WIDTH] === `${first.id}-${WIDTH}` ? first.images[WIDTH] : null
    const ownSize = own ? shotSize(own) : null
    if (ownSize && inside(box, { left: 0, top: 0, ...ownSize }))
      return { how: 'page', shot: own, shotSize: ownSize, box }
    // The block shot is a crop of the block's measured box on the same page: the box of this frame's measure, else of
    // another frame of the block, as long as its size is the shot's size. A shot borrowed from another block is not used.
    const shot = block.images?.[WIDTH] === `${block.id}-${WIDTH}` ? block.images[WIDTH] : null
    const size = shot ? shotSize(shot) : null
    const before = size
      ? [frame, ...(Array.isArray(block.frames) ? block.frames : [])]
          .map((x) => boxOf(x?.hideEvidence?.measured?.[WIDTH]?.blockBefore))
          .find((b) => b && sameSize(size, b))
      : null
    if (before && inside(box, before))
      return {
        how: 'block',
        shot,
        shotSize: size,
        box: { left: box.left - before.left, top: box.top - before.top, width: box.width, height: box.height }
      }
    return {
      reason: first
        ? `the shot of ${first.path ?? first.id} shows another page and the block shot does not match the box`
        : 'the block is on no kit page'
    }
  }

  return (frameId) => {
    const found = frames.get(frameId)
    if (!found) return null
    const ownPages = pagesOf(found.block.id)
    let placed = measure(found, ownPages)
    let via = null
    let firstPage = ownPages[0] ?? null
    const twin = found.frame.twinOf ? frames.get(found.frame.twinOf) : null
    if (!placed.how && twin && !boxOf(found.frame.kindEvidence?.box)) {
      const twinPages = pagesOf(twin.block.id)
      const twinPlaced = measure(twin, twinPages)
      if (twinPlaced.how) {
        placed = twinPlaced
        via = twin.frame.id
        firstPage = twinPages[0] ?? firstPage
      }
    }
    const others = [...new Set(ownPages.map((p) => p.path ?? p.id))].filter(
      (p) => p !== (firstPage?.path ?? firstPage?.id)
    )
    return {
      frame: frameId,
      block: found.block.id,
      page: firstPage ? { id: firstPage.id, path: firstPage.path ?? firstPage.id } : null,
      others,
      via,
      ...(placed.how ? placed : { how: 'none', reason: placed.reason })
    }
  }
}
