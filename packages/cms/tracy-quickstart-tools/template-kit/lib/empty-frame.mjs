// Empty one frame, or one row slot in every row at once, and judge the block from its DOM alone (no screenshot):
// the picture and whatever paints it (a mask, a pseudo-element, a background on a holder) leave, then the block's
// box, its repeated rows, its text and buttons are read again. The numbers are the evidence: how much the block's
// height changed, how far text moved, which text or buttons now overlap, an empty box of the frame's size left
// behind, a card that lost its picture among cards that keep theirs. Nothing emptied, or a frame lying under a solid
// block (emptying it changes nothing a visitor sees), is an invalid measurement (`ok: null`), never a pass. The
// frame is put back in `finally`.
import { judgeHidden } from './frame-checks.mjs'
import {
  coveredFrame,
  emptyBoxLeft,
  hideFrame,
  hidePainters,
  restoreFrame,
  restorePainters,
  unevenRow
} from './hide-frames.js'
import { layoutOf } from './read-frames.js'

export const INVALID = 'no visible change, measurement invalid'

const overlap = (a, b) =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))

/** Text and buttons before and after: how far the furthest one moved, and pairs that overlap only after. */
export function textShift(before, after) {
  const was = new Map((before?.marks ?? []).map((m) => [m.key, m]))
  const now = (after?.marks ?? []).filter((m) => was.has(m.key))
  let moved = 0
  for (const m of now) {
    const b = was.get(m.key)
    moved = Math.max(moved, Math.abs(m.left - b.left), Math.abs(m.top - b.top))
  }
  const overlaps = []
  for (let i = 0; i < now.length && overlaps.length < 5; i++)
    for (let j = i + 1; j < now.length && overlaps.length < 5; j++) {
      const a = now[i]
      const b = now[j]
      if (overlap(a, b) > 16 && overlap(was.get(a.key), was.get(b.key)) <= 16) overlaps.push([a.key, b.key])
    }
  return { moved, overlaps: overlaps.length, gone: was.size - now.length }
}

/**
 * @param {{page: object, block: string, ids: string[]}} o
 * @returns {Promise<{check: {ok: boolean|null, reason: string, heightChange: number}, evidence: object, emptied: string}|null>}
 */
export async function emptyAndJudge({ page, block, ids }) {
  const before = await page.evaluate(layoutOf, { block })
  if (!before) return null
  // A frame under a solid block shows nothing: emptying it changes nothing a visitor sees.
  let covered = true
  for (const id of ids) covered &&= await page.evaluate(coveredFrame, { id })
  let n = 0
  let p = 0
  try {
    for (const id of ids) n += await page.evaluate(hideFrame, { id })
    for (const id of ids) p += await page.evaluate(hidePainters, { id })
    await page.waitForTimeout(200)
    const after = await page.evaluate(layoutOf, { block })
    let empty = null
    for (const id of ids) empty ??= await page.evaluate(emptyBoxLeft, { id })
    const uneven = ids.length === 1 ? await page.evaluate(unevenRow, { id: ids[0] }) : null
    const shift = textShift(before, after)
    const evidence = {
      blockBefore: before.block,
      blockAfter: after?.block ?? null,
      rowSets: before.sets.length,
      textMoved: shift.moved,
      textOverlaps: shift.overlaps,
      textGone: shift.gone,
      emptyBox: empty,
      uneven,
      covered
    }
    let check
    if ((!n && !p) || covered) check = { ok: null, reason: INVALID, heightChange: 0 }
    else {
      check = judgeHidden({ before, after, empty, uneven, rowSlot: ids.length > 1 })
      if (check.ok && shift.overlaps)
        check = { ...check, ok: false, reason: `${shift.overlaps} pairs of text or buttons now overlap` }
    }
    return { check, evidence, emptied: n ? (p ? 'picture and painters' : 'picture') : 'painters' }
  } finally {
    for (const id of ids) {
      await page.evaluate(restorePainters, { id })
      await page.evaluate(restoreFrame, { id })
    }
    await page.waitForTimeout(100)
  }
}
