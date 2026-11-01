// Empty one frame, or one row slot in every row at once, shoot the block and judge it. The frame's own box is
// shot before and after: when emptying the picture changes (almost) no pixel there, the picture is painted by
// something else, so its painters (a mask, a pseudo-element, a background on a holder) are emptied too; when
// even that changes nothing the measurement is invalid (`ok: null`), never a pass.
import { join } from 'node:path'

import { judgeHidden } from './frame-checks.mjs'
import {
  emptyBoxLeft,
  hideFrame,
  hidePainters,
  restoreFrame,
  restorePainters,
  unevenRow
} from './hide-frames.js'
import { changedShare, MIN_CHANGED, regionPng } from './pixel-diff.mjs'
import { layoutOf } from './read-frames.js'

const MAX_H = 16000
export const INVALID = 'no visible change, measurement invalid'

/** One JPEG of a page region, clamped to the page. */
export async function shoot(page, box, file, width) {
  const x = Math.max(0, Math.floor(box.left))
  const y = Math.max(0, Math.floor(box.top))
  const w = Math.min(Math.ceil(box.width), width - x)
  const h = Math.min(Math.ceil(box.height), MAX_H)
  if (w < 4 || h < 4) return false
  await page.screenshot({
    path: file,
    type: 'jpeg',
    quality: 82,
    fullPage: true,
    clip: { x, y, width: w, height: h }
  })
  return true
}

/**
 * @param {{page: object, cmp: object, block: string, ids: string[], box: object, width: number, dir: string, name?: string}} o
 * @returns {Promise<{image: string, check: {ok: boolean|null, reason: string, heightChange: number}, change: number, emptied: string}|null>}
 */
export async function emptyAndJudge({ page, cmp, block, ids, box, width, dir, name = ids[0] }) {
  const before = await page.evaluate(layoutOf, { block })
  if (!before) return null
  const shotBefore = await regionPng(page, box, width)
  let n = 0
  for (const id of ids) n += await page.evaluate(hideFrame, { id })
  if (!n) return null
  let emptied = 'picture'
  try {
    await page.waitForTimeout(250)
    let change = await changedShare(cmp, shotBefore, await regionPng(page, box, width))
    if (change < MIN_CHANGED) {
      let p = 0
      for (const id of ids) p += await page.evaluate(hidePainters, { id })
      if (p) {
        emptied = 'painter'
        await page.waitForTimeout(250)
        change = await changedShare(cmp, shotBefore, await regionPng(page, box, width))
      }
    }
    const after = await page.evaluate(layoutOf, { block })
    let empty = null
    for (const id of ids) empty ??= await page.evaluate(emptyBoxLeft, { id })
    const uneven = ids.length === 1 ? await page.evaluate(unevenRow, { id: ids[0] }) : null
    const check =
      change < MIN_CHANGED
        ? { ok: null, reason: INVALID, heightChange: 0 }
        : judgeHidden({ before, after, empty, uneven, rowSlot: ids.length > 1 })
    const file = `${name}-hidden-${width}.jpg`
    if (!after || !(await shoot(page, after.block, join(dir, file), width))) return null
    return { image: `images/${file}`, check, change: Math.round(change * 1000) / 1000, emptied }
  } finally {
    for (const id of ids) {
      await page.evaluate(restorePainters, { id })
      await page.evaluate(restoreFrame, { id })
    }
    await page.waitForTimeout(150)
  }
}
