/**
 * Comment letters (spec #809 cases C1–C3, copy approved on 03/10/2026, option A of each):
 *
 *   comment.mention   [Mention]  "Lee mentioned you in a comment on kinetic.vn"
 *                                “<quote>” / Home page                         → View comment
 *   comment.reply     [Reply]    "David replied on kinetic.vn"
 *                                “<quote>” / Home page                         → View thread
 *                     grouped:   "3 new replies on kinetic.vn"
 *                                David: “…” / Lee: “…” / David: “…”            → View thread
 *   comment.resolved  [Resolved] "Lee resolved your comment on kinetic.vn"  “<quote>” → View comment
 *   comment.reopened  [Reopened] "Lee reopened your comment on kinetic.vn"  “<quote>” → View comment
 *
 * Each value is a renderer as described in `./index.js`. Rows hold facts (`data.quote`, `page`, `n`,
 * `commentId`, written by `sites/comment-notify.js`); a row about a comment deleted since
 * (`data.deleted`, rule R3) is never mailed.
 */
import { translator } from '../../lib/i18n/index.js'
import { shortName } from '../emails.js'
import { notificationMail } from '../notification-mail.js'

/**
 * Who acted, as a letter names them: the one rule every letter uses (`shortName`), the display
 * name, else the local part of the address (04/10: a raw address was the C1 title on dev).
 */
function actorName(t, row) {
  return shortName(t, row.actor?.name, row.actor?.email)
}

/**
 * Where the comment sits: `/` reads "Home page", any other page keeps its path, as the Inbox shows
 * it. No "comment #N": the number is internal and the button opens that comment (04/10/2026).
 */
function whereLine(t, data) {
  return typeof data.page === 'string' && data.page !== '/' ? data.page : t('mail.n.comment.homePage')
}

/** The site as a sentence names it: its current address (`siteName`), else its key. */
const siteOf = (row) => row.siteName ?? row.siteKey

const quoteOf = (data) => (typeof data.quote === 'string' ? data.quote : '')

/** The rows still worth a letter (R3: a comment deleted since is never mailed). */
const live = (rows) => rows.filter((r) => !r.data?.deleted && r.data?.commentId)

function mention({ lang, rows, links }) {
  const shown = live(rows)
  if (shown.length === 0) return null
  const t = translator(lang)
  const row = shown[shown.length - 1]
  return notificationMail({
    lang,
    badge: 'mail.n.badge.mention',
    subject: t('mail.n.mention.subject', { actor: actorName(t, row), site: siteOf(row) }),
    paragraphs: [{ text: quoteOf(row.data), quote: true }, { text: whereLine(t, row.data) }],
    button: {
      label: t('mail.n.comment.view'),
      url: links.comment(row.siteKey, row.data.commentId, row.data.page)
    },
    manageUrl: links.manage(),
    inboxNote: true
  })
}

function reply({ lang, rows, links }) {
  const shown = live(rows)
  if (shown.length === 0) return null
  const t = translator(lang)
  const last = shown[shown.length - 1]
  const button = {
    label: t('mail.n.reply.view'),
    url: links.comment(last.siteKey, last.data.commentId, last.data.page)
  }
  if (shown.length === 1)
    return notificationMail({
      lang,
      badge: 'mail.n.badge.reply',
      subject: t('mail.n.reply.subject', { actor: actorName(t, last), site: siteOf(last) }),
      paragraphs: [{ text: quoteOf(last.data), quote: true }, { text: whereLine(t, last.data) }],
      button,
      manageUrl: links.manage(),
      inboxNote: true
    })
  // Several replies of one thread held inside the window (C2): one letter, one line per reply.
  return notificationMail({
    lang,
    badge: 'mail.n.badge.reply',
    subject: t('mail.n.reply.subjectMany', { count: String(shown.length), site: siteOf(last) }),
    paragraphs: shown.map((r) => ({
      text: t('mail.n.reply.line', { name: actorName(t, r), quote: quoteOf(r.data) })
    })),
    button,
    manageUrl: links.manage(),
    inboxNote: true
  })
}

/** C3: resolved or reopened, the same letter with its own label and subject. */
const statusLetter =
  (badge, subjectKey) =>
  ({ lang, rows, links }) => {
    const shown = live(rows)
    if (shown.length === 0) return null
    const t = translator(lang)
    const row = shown[shown.length - 1]
    return notificationMail({
      lang,
      badge,
      subject: t(subjectKey, { actor: actorName(t, row), site: siteOf(row) }),
      paragraphs: [{ text: quoteOf(row.data), quote: true }],
      button: {
        label: t('mail.n.comment.view'),
        url: links.comment(row.siteKey, row.data.commentId, row.data.page)
      },
      manageUrl: links.manage(),
      inboxNote: true
    })
  }

export const COMMENT_LETTERS = Object.freeze({
  'comment.mention': mention,
  'comment.reply': reply,
  'comment.resolved': statusLetter('mail.n.badge.resolved', 'mail.n.resolved.subject'),
  'comment.reopened': statusLetter('mail.n.badge.reopened', 'mail.n.reopened.subject')
})
