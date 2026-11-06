// Does a block still look whole with one frame emptied? The automatic half of the canHide judgement: the
// layout of the block before and after (its repeated row sets and its box), and any empty box left behind.
// A person looks at the before/after images too and may overrule it (frame-review.json).
import { linesOf } from './rows.mjs'

const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0)

/**
 * A row slot (the picture of every row emptied at once) may make the block shorter: cards without pictures
 * that still match are whole, so its height is not judged.
 * @param {{before: {block: object, sets: {shape: string, rows: object[]}[]}, after: object, empty?: {width: number, height: number}|null, uneven?: string|null, rowSlot?: boolean}} o
 * @returns {{ok: boolean, reason: string, heightChange: number}}
 */
export function judgeHidden({ before, after, empty, uneven, rowSlot = false }) {
  const heightChange = before?.block?.height
    ? Math.round(((after?.block?.height ?? 0) / before.block.height - 1) * 100) / 100
    : 0
  const no = (reason) => ({ ok: false, reason, heightChange })
  if (!after) return no('the block is gone once the picture is emptied')
  if (empty) return no(`an empty ${empty.width}x${empty.height} box stays where the picture was`)
  if (uneven) return no(uneven)
  const left = [...after.sets]
  for (const set of before.sets) {
    const i = left.findIndex((s) => s.shape === set.shape)
    const twin = i >= 0 ? left.splice(i, 1)[0] : null
    if (!twin || twin.rows.length !== set.rows.length) return no(`a row of ${set.shape} collapsed`)
    const was = linesOf(set.rows)
    const now = linesOf(twin.rows)
    if (was.map((l) => l.rows.length).join() !== now.map((l) => l.rows.length).join())
      return no(`the rows of ${set.shape} wrap differently`)
    for (const [n, line] of now.entries()) {
      const prior = was[n].rows
      if (spread(prior.map((r) => r.height)) <= 8 && spread(line.rows.map((r) => r.height)) > 8)
        return no(`a card of ${set.shape} shrank: cards on one line no longer match`)
      if (spread(prior.map((r) => r.top)) <= 4 && spread(line.rows.map((r) => r.top)) > 4)
        return no(`cards of ${set.shape} on one line no longer align`)
    }
  }
  if (!rowSlot && heightChange <= -0.5)
    return no(`the block lost ${Math.round(-heightChange * 100)}% of its height`)
  return { ok: true, reason: 'the layout holds', heightChange }
}
