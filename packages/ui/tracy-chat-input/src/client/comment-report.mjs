/**
 * The report under a chat turn sent from comments (ADR 0025, Brian 03–04/10/2026): one short block at
 * the end of the turn — "Done: 3 comments (reply to a comment if you want more changes) · Couldn't
 * confirm: 1 comment", each comment a link to its thread — kept free of React so node tests hold it.
 *
 * 🔒 DRAWN FROM THE SERVER'S DATA, NEVER FROM THE MODEL'S WORDS. The rule asks the report to be
 * deterministic: `CommentReportCard.tsx` asks `GET /api/sites/:key/comments/report?turn=<session>:<n>`
 * (`apps/tracy-web` `comments.js` `turnReport`) once the turn has ended. A comment is DONE when a site
 * write through the Apply door cited its request in that turn — the proof that also resolves it as
 * Tracy; every other comment of the turn is "couldn't confirm", never "not done": a write that does
 * not pass the Apply door (an EmDash site's own tools, a look change by file) carries no proof.
 * Nothing is written into a comment thread.
 */

/**
 * The report door of one turn, root-absolute (a tracy-web door, never through `dshUrl`).
 * @param {string} siteKey
 * @param {string} sessionId
 * @param {number} turn - dsh's turn number, the one the host records the turn under.
 * @returns {string}
 */
export function reportDoor(siteKey, sessionId, turn) {
  const query = new URLSearchParams({ turn: `${sessionId}:${turn}` })
  return `/api/sites/${encodeURIComponent(siteKey)}/comments/report?${query}`
}

/**
 * @typedef {{ id: string, text: string }} ReportLine
 * @typedef {{ done: ReportLine[], unconfirmed: ReportLine[] }} Report
 */

/**
 * The door's answer sorted into the two groups, in send order; null when the turn carried no saved
 * comment (a turn typed in the chat, one the server does not know) — then nothing is drawn.
 * @param {unknown} body - `{turn, comments: [{id, text, done}]}`.
 * @returns {Report | null}
 */
export function reportOf(body) {
  const comments = /** @type {{ comments?: unknown } | null} */ (body)?.comments
  if (!Array.isArray(comments)) return null
  /** @type {Report} */
  const report = { done: [], unconfirmed: [] }
  for (const item of comments) {
    if (item === null || typeof item !== 'object') continue
    const { id, text, done } = /** @type {{ id?: unknown, text?: unknown, done?: unknown }} */ (item)
    if (typeof id !== 'string' || id === '') continue
    const line = { id, text: typeof text === 'string' ? text : '' }
    if (done === true) report.done.push(line)
    else report.unconfirmed.push(line)
  }
  return report.done.length + report.unconfirmed.length > 0 ? report : null
}

/** How long a report line's words may be before "…" — one line of the chat column. */
export const LINE_CHARS = 80

/**
 * A comment's words as its report line shows them: on one line, cut at {@link LINE_CHARS}.
 * @param {string} text
 * @returns {string}
 */
export function lineWords(text) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > LINE_CHARS ? `${flat.slice(0, LINE_CHARS - 1)}…` : flat
}
