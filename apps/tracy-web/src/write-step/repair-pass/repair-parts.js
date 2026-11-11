// The comment turns one page's items go in (#448). The popover's turn builder (lib/comment-turn.js) refuses a turn longer
// than its budget for that many comments (`TooLong`), and a refusal there stopped the whole of step 9b on a real site.
// So the items are packed, in order, into as few turns as fit: each turn is a numbered comment turn of its own, every
// item self-contained (its page, element and words), so the agent needs nothing from the turn before. Each turn is built
// here with numbers at least as long as any the requests door gives, so a turn that fits here fits once numbered. An item
// that no usable partition can retain is left out and named. Pure but for the builder it is given.
import { pageTurn } from './repair-items.js'

/** Wider than any number the requests door gives, so a turn measured with these is never shorter than the real one. */
const WIDEST = 999_999

const fits = (buildCommentTurn, items) => {
  try {
    pageTurn(
      buildCommentTurn,
      items,
      items.map((_, i) => WIDEST - i)
    )
    return true
  } catch (error) {
    if (error?.code === 'too-long') return false
    throw error
  }
}

/**
 * @param {(comment: object) => string} buildCommentTurn
 * @param {object[]} items one page's comment items (repair-items.js `commentItem`)
 * @returns {{ parts: number[][], tooLong: number[] }} the indexes of `items` in each turn, in order, and of the items that
 *   cannot be retained in the chosen partition
 */
export function turnParts(buildCommentTurn, items) {
  // The budget grows with the number of comments: a refused prefix can fit after another item is
  // added. Check every contiguous candidate, then choose the suffix with the fewest omissions and
  // turns. Longer first parts win ties. At most n * (n + 1) / 2 builder calls, with n + 1 states.
  const best = new Array(items.length + 1)
  best[items.length] = { dropped: 0, turns: 0 }
  for (let start = items.length - 1; start >= 0; start -= 1) {
    best[start] = {
      dropped: best[start + 1].dropped + 1,
      turns: best[start + 1].turns,
      end: start + 1,
      skip: true
    }
    for (let end = items.length; end > start; end -= 1) {
      if (!fits(buildCommentTurn, items.slice(start, end))) continue
      const candidate = { dropped: best[end].dropped, turns: best[end].turns + 1, end }
      if (
        candidate.dropped < best[start].dropped ||
        (candidate.dropped === best[start].dropped && candidate.turns < best[start].turns)
      )
        best[start] = candidate
      if (best[start].dropped === 0 && best[start].turns === 1) break
    }
  }
  const parts = []
  const tooLong = []
  for (let start = 0; start < items.length; ) {
    const chosen = best[start]
    if (chosen.skip) tooLong.push(start)
    else parts.push(Array.from({ length: chosen.end - start }, (_, i) => start + i))
    start = chosen.end
  }
  return { parts, tooLong }
}
