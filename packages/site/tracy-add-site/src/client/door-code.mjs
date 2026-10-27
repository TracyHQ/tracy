/**
 * The codes a door sends, by the status it sends each of them with.
 * @typedef {Readonly<Record<number, ReadonlySet<string>>>} DoorAnswers
 */

/**
 * The door's own name for an answer that was not a success, or the bare status (`HTTP_<status>`).
 *
 * A code is believed ONLY on the status its door sends it with. Any other pairing — `404
 * NOT_SIGNED_IN`, `401 TAKEN`, a 5xx naming anything it does not itself send — was written by a
 * layer in front of the door or is not its body at all, and letting it choose the sentence tells
 * the person to do the wrong thing next (#796). Every reader of a refusal in this plugin goes
 * through here, so the rule is kept in one place instead of once per code.
 *
 * A `.mjs` like its neighbours: `create.ts` is also loaded by plain `node --test`, which resolves
 * a sibling only by its full file name.
 *
 * @param {DoorAnswers} answers The door's codes by status.
 * @param {number} status HTTP status of the answer.
 * @param {unknown} code The `code` its body carries, if any.
 * @returns {string} The believed code, or `HTTP_<status>`.
 */
export function doorCode(answers, status, code) {
  return typeof code === 'string' && Object.hasOwn(answers, status) && answers[status].has(code)
    ? code
    : `HTTP_${String(status)}`
}
