/**
 * THE COMMENT NUMBERS AN APPLY CALL CITES, and how long a cited request may still be answered.
 *
 * An Apply call may carry `comment` beside `action`: the number(s) of the "Send to Tracy" requests
 * (or stage-5 comments) the agent is answering (`tracy-site-tools` `comment-echo.mjs`). A write that
 * goes through stamps those of the caller's own recent requests "Done by Tracy" (`comments.js`
 * `markRequestsAnswered`), and the audit row says whether the call came from a comment. That is all
 * the number does now: it never widens what the seat may write.
 *
 * 🔒 THE COMMENT-ANSWER EXCEPTION IS GONE (ADR 0028, 08/10/2026). From 29/09 (
 * `tasks/todo-comment-thread.md`) a seat holding only `content` could write the words its own comment
 * pointed at in a template part, a module or the site's name — kinds that are otherwise `code` or
 * `site`. Under the three fixed roles no seat holds `content` alone: an editor and an owner hold
 * `content`, `code` and `site`, so they write those kinds by role, and a viewer holds nothing, so its
 * comment opens nothing. The exception, its `COMMENT_NOT_IN_FLIGHT` refusal and the locate map's
 * matching rule were removed with no change for editors or owners.
 */

/** How long after a request was sent its answer may still stamp it "Done by Tracy" (a question card answered later). */
export const COMMENT_ANSWER_WINDOW_MS = 2 * 60 * 60 * 1000

/**
 * Numbers a call may carry. No cap at 99 (stage 6): comments and requests share one sequence per
 * site that only grows, so the only bound is the `integer` column `n` is stored in.
 */
const COMMENT_MIN = 1
const COMMENT_MAX = 2 ** 31 - 1
const COMMENT_LIST_MAX = 12

/**
 * The comment numbers an Apply body names, or null when it names none; `false` when `comment` is
 * there but not one number or a list of distinct numbers.
 * @param {unknown} value
 * @returns {number[] | null | false}
 */
export function commentNumbers(value) {
  if (value === undefined || value === null) return null
  const one = (n) => Number.isInteger(n) && n >= COMMENT_MIN && n <= COMMENT_MAX
  if (one(value)) return [/** @type {number} */ (value)]
  if (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= COMMENT_LIST_MAX &&
    value.every(one) &&
    new Set(value).size === value.length
  )
    return [...value]
  return false
}
