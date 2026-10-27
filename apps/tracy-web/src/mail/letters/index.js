/**
 * The notification letters (spec #809): one renderer per notification `kind`, turning the facts a
 * row holds into the approved email, in the recipient's language, on the shared template
 * (`../notification-mail.js`). `app.js` binds `letterFor` into the notifier
 * (`../../notifications/notify.js`); a kind without a renderer sends no email.
 *
 * A renderer receives `{lang, rows, recipient, links}`:
 *   - `rows`: one or more rows of the same kind for this recipient, oldest first (several only when
 *     the notifier grouped held rows of one thread, case C2);
 *   - `links`: URL builders for the deployment (`team(siteKey, member?)`, `site(siteKey)`,
 *     `comment(siteKey, commentId)`, `manage()`), so a letter never assembles an origin itself.
 * It returns `{subject, html, text}` (from `notificationMail`) or null to send nothing.
 *
 * Renderers live per area, so the team and comment letters can change without touching each other:
 * `./team.js` (T1–T11, T2b) and `./comments.js` (C1–C3).
 */
import { COMMENT_LETTERS } from './comments.js'
import { TEAM_LETTERS } from './team.js'

const LETTERS = Object.freeze({ ...TEAM_LETTERS, ...COMMENT_LETTERS })

/** The kinds that have a letter (tests compare this with the kinds the doors emit). */
export const LETTER_KINDS = Object.freeze(Object.keys(LETTERS))

/**
 * @param {{kind: string, lang: string, rows: object[], recipient: object, links: object}} input
 * @returns {{subject: string, html: string, text: string} | null}
 */
export function letterFor({ kind, ...input }) {
  const render = LETTERS[kind]
  return render ? render(input) : null
}
