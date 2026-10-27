/**
 * `comment` — the number of the person's Browser-tab comment a `tracy_site` or `tracy_emdash` call
 * works on (comment → edit, contract H6).
 *
 * AN ECHO, AND THE APPLY DOOR'S PROOF. The person sends several numbered comments in one turn; the
 * page colours each pin by what the agent did for THAT number. The page learns it from the session
 * log: the call's own arguments carry `comment: n`, and the answer repeats it (`comment: n` as the
 * first text block, `meta.comment`) so a reader that only sees results can still tell which item a
 * write was for. The number means nothing to any site. Since 29/09/2026 (Brian: whoever may comment
 * gets the change they commented) Tracy's own Apply door reads it too, beside `action`
 * (`index.ts` `answeringComment`): when it names the caller's own sent comment on that site, the door
 * writes the words a comment points at in a template part, a module or the site's name for any seat
 * (`apps/tracy-web/src/sites/comment-answer.js`).
 *
 * 🔒 TAKEN OFF BEFORE ANYTHING READS THE CALL. `planCall` moves every unknown key beside `action` into
 * `params` (TS-3), and `normalizeEmdashShape` every unknown key beside `tool` into the EmDash tool's
 * `arguments` (F4 ED-3), so a `comment` left in place would reach the site's component, the replace
 * road's engines, a contract apply's changes check and EmDash's own tools as a parameter they never
 * had. It is removed in the wrapper around each tool's `execute` in `index.ts`, before any of them
 * run, and handed to the Apply door beside `action`, never inside `params`.
 *
 * 🔒 THE JSON ANSWER STAYS BYTE FOR BYTE WHAT IT WAS. The echo rides as its own text block in front of
 * it, never inside it: every reader of "did this call go through" parses that JSON (`resultWentThrough`
 * in `site-context.mjs`), and a prefix line would make it unparseable.
 */

/** Where the echoed number rides on the answer between `execute` and `render`; never in the model's JSON. */
export const COMMENT_KEY = '_comment'

/**
 * The numbers a call may carry. Since stage 6 they come from one sequence per site that comments and
 * "Send to Tracy" requests share and that only grows (`apps/tracy-web` `039-site-request.sql`), so
 * there is no cap at 99: the only bound is the `integer` column Tracy stores `n` in.
 */
export const COMMENT_MIN = 1
export const COMMENT_MAX = 2 ** 31 - 1

/** How many comments one write may answer — the tab's own cap on pins at once (`MAX_COMMENTS`). */
export const COMMENT_LIST_MAX = 12

const ONE = Object.freeze({ type: 'integer', minimum: COMMENT_MIN, maximum: COMMENT_MAX })

/**
 * The schema property, shared by the global tool and every per-surface copy: one number, or — V2-M1,
 * stand E2E round 2 (29/09): two pins on different elements that map to one field got one write under
 * `comment: 1`, and pin 2 stayed amber — a list of them for one write that answers several comments.
 */
export const COMMENT_PARAMETER = Object.freeze({
  anyOf: [
    ONE,
    Object.freeze({
      type: 'array',
      items: ONE,
      minItems: 1,
      maxItems: COMMENT_LIST_MAX,
      uniqueItems: true
    })
  ],
  description:
    "The number of the person's comment this call answers, or [1, 2] for several; the write is made for whoever commented."
})

/** @param {unknown} n @returns {n is number} */
const isNumber = (n) => typeof n === 'number' && Number.isInteger(n) && n >= COMMENT_MIN && n <= COMMENT_MAX

/**
 * One entry as the number it spells. A string of ASCII digits is that number (round 7: a chat run sent
 * `comment:"1"`, was refused BAD_COMMENT and sent the same write again — a step for a number that was
 * never in doubt); the range still decides, and anything else is left as it came.
 * The Browser tab does not read this number back (`tracy-chat-input` `comment-status.mjs` counts every
 * write of the turn, whatever number it names), so this rule has no copy to keep equal.
 * @param {unknown} v
 */
const spelled = (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v)

/**
 * Take `comment` off one call.
 * @param {unknown} args - the call's arguments as dsh parsed them.
 * @returns {{ ok: true, args: unknown, comment: number | number[] | null } | { ok: false, answer: Record<string, unknown> }}
 *   `args` without `comment` (a new object when it had one, else the same value); a one-entry list
 *   is that number; a digit string is read as its number, alone or in a list.
 */
export function takeComment(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !Object.hasOwn(args, 'comment'))
    return { ok: true, args, comment: null }
  const { comment, ...rest } = /** @type {Record<string, unknown>} */ (args)
  if (comment === undefined || comment === null) return { ok: true, args: rest, comment: null }
  const one = spelled(comment)
  if (isNumber(one)) return { ok: true, args: rest, comment: one }
  const list = Array.isArray(comment) ? comment.map(spelled) : null
  if (
    list !== null &&
    list.length >= 1 &&
    list.length <= COMMENT_LIST_MAX &&
    list.every(isNumber) &&
    new Set(list).size === list.length
  )
    return { ok: true, args: rest, comment: list.length === 1 ? list[0] : [...list] }
  return {
    ok: false,
    answer: {
      ok: false,
      code: 'BAD_COMMENT',
      error: `comment must be the number the person's message gave an item (a whole number of ${COMMENT_MIN} or more), or a list of up to ${COMMENT_LIST_MAX} different such numbers; got ${JSON.stringify(comment)?.slice(0, 60)}.`,
      next: `Call again with comment set to that item's number as the message wrote it, or to [1, 2] for one write that answers several, or leave comment out.`
    }
  }
}

/**
 * The answer with its comment number(s) attached for `render` and `presentationMeta` to find.
 * @param {unknown} answer
 * @param {number | number[] | null} comment
 * @returns {unknown}
 */
export function withComment(answer, comment) {
  if (comment === null || !answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  return { ...answer, [COMMENT_KEY]: comment }
}

/**
 * The comment number(s) an answer carries, or null.
 * @param {unknown} value
 * @returns {number | number[] | null}
 */
export function commentOf(value) {
  const n =
    value && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)[COMMENT_KEY]
      : undefined
  if (isNumber(n)) return n
  return Array.isArray(n) && n.length > 0 && n.every(isNumber) ? n : null
}

/**
 * The echo block in front of an answer's own content, when it carries a comment: `comment: 3`, or
 * `comment: 1, 2` for one write answering several.
 * @template T
 * @param {unknown} value
 * @param {T[]} content - the answer's content as `answerContent` renders it (with `COMMENT_KEY` hidden).
 * @returns {({ type: 'text', text: string } | T)[]}
 */
export function commentContent(value, content) {
  const n = commentOf(value)
  if (n === null) return content
  return [{ type: 'text', text: `comment: ${Array.isArray(n) ? n.join(', ') : n}` }, ...content]
}

/**
 * `tool/result.meta` with the comment beside whatever else the answer projects there.
 * @param {unknown} value
 * @param {Record<string, unknown> | null} meta - the rest of the meta, or null.
 * @returns {Record<string, unknown> | null}
 */
export function commentMeta(value, meta) {
  const n = commentOf(value)
  if (n === null) return meta
  return { ...meta, comment: n }
}
