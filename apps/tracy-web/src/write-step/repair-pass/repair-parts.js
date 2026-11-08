// The comment turns one page's items go in (#448). The popover's turn builder (lib/comment-turn.js) refuses a turn longer
// than its budget for that many comments (`TooLong`), and a refusal there stopped the whole of step 9b on a real site.
// So the items are packed, in order, into as few turns as fit: each turn is a numbered comment turn of its own, every
// item self-contained (its page, element and words), so the agent needs nothing from the turn before. Each turn is built
// here with numbers at least as long as any the requests door gives, so a turn that fits here fits once numbered. An item
// that does not fit even alone is left out and named. Pure but for the builder it is given.
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
 *   fit no turn even alone
 */
export function turnParts(buildCommentTurn, items) {
  const parts = []
  const tooLong = []
  let part = []
  for (let i = 0; i < items.length; i += 1) {
    const tried = [...part, i]
    if (
      fits(
        buildCommentTurn,
        tried.map((k) => items[k])
      )
    ) {
      part = tried
      continue
    }
    if (part.length) parts.push(part)
    part = []
    if (fits(buildCommentTurn, [items[i]])) part = [i]
    else tooLong.push(i)
  }
  if (part.length) parts.push(part)
  return { parts, tooLong }
}
