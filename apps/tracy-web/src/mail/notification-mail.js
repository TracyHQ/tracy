/**
 * The shared notification email (spec #809, step 2, approved on 03/10/2026): the sign-in
 * mail's header and card, a per-case label above the title, the body, one button, and a footer of
 * one line, "Manage notifications · Terms · Privacy · tracy.ai" ("tracy.ai" plain text since C3-B,
 * 05/10/2026; Terms and Privacy since 06/10/2026). No sign-off, no tagline, no trademark line, no
 * "You received this because…" line. The sign-in mail keeps its own body (`sign-in-code.html`) but
 * shares this footer (`brandFooter`).
 *
 * Pure: the caller passes the reader's language, the words come from `../lib/i18n/strings.js` and
 * its translations, data (names, addresses, site keys, quoted comments) only ever arrives through a
 * placeholder and is escaped here.
 */
import { readFileSync } from 'node:fs'
import { escapeHtml } from '../lib/html.js'
import { translator } from '../lib/i18n/index.js'

const template = readFileSync(new URL('./templates/notification.html', import.meta.url), 'utf8')
const footerPartial = readFileSync(new URL('./templates/footer.html', import.meta.url), 'utf8')

const FONT = 'font-family:Inter,Arial,Helvetica,sans-serif;'
const PARAGRAPH = `margin:0 0 16px;${FONT}font-size:16px;line-height:1.6;color:#2b2522;`
const QUOTE = `margin:0 0 18px;padding:12px 16px;background:#faf7f4;border:1px solid #e9e1dc;border-radius:12px;${FONT}font-size:15px;line-height:1.55;color:#2b2522;`
const BUTTON = `display:inline-block;background:#a3462a;color:#ffffff;text-decoration:none;${FONT}font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;`
const FOOTER_LINK = 'color:#8a817c;'
const INBOX_NOTE = `margin:14px 0 0;${FONT}font-size:14px;line-height:1.55;color:#6f6762;`
const BADGE_P = `margin:0 0 14px;${FONT}font-size:13px;line-height:1;font-weight:600;color:#a3462a;`
const BADGE_SPAN = 'display:inline-block;background:#f8eae5;border-radius:999px;padding:7px 12px;'
// The sign-in mail's "Did not request this?" box (`sign-in-code.html`), so every mail draws it alike.
const NOTE = `margin:0 0 16px;padding:14px 16px;background:#f8f0ec;border-radius:10px;${FONT}font-size:14px;line-height:1.55;color:#5c534e;`
const NOTE_STRONG = 'color:#1a1715;'

/** The two pages the footer names, on the marketing site that is also the sending domain: the same
 * address on every deployment, as the logo in the templates is (06/10/2026: both answer 200). */
const MARKETING_HOME = 'https://tracy.ai'
const TERMS_URL = `${MARKETING_HOME}/terms`
const PRIVACY_URL = `${MARKETING_HOME}/privacy`

/**
 * Escaped text in which no address or domain can be turned into a link by the mail client. Gmail,
 * Apple Mail and Outlook draw any "name@host.tld" or "site.tld" as a blue underlined link (measured
 * 04/10 on a real invite: the inviter's address and the site key both came out as links). An
 * invisible zero-width non-joiner after every "@" and every "." that sits between two letters or
 * digits breaks what the detectors match, and the reader sees the same characters. Only for HTML:
 * the plain-text part keeps the plain address.
 * @param {string} text plain text
 * @returns {string} escaped HTML
 */
export function unlinkedHtml(text) {
  return escapeHtml(text).replace(/(?<=[\p{L}\p{N}])([@.])(?=[\p{L}\p{N}])/gu, '$1&zwnj;')
}

/**
 * The one-line footer every Tracy mail ends with (approved F1/F2, 03/10; the sign-in and
 * whitelist mails joined it 04/10): "Manage notifications · Terms · Privacy · tracy.ai", or without
 * the first link for a mail the reader cannot switch off. One partial (`templates/footer.html`) for
 * every template, so the footers cannot drift apart again. Terms and Privacy are the only links
 * besides Manage, both on tracy.ai (06/10/2026: a footer naming its terms reads as a real
 * service); "tracy.ai" itself stays text (C3-B).
 * @param {(key: string) => string & {html: Function}} t the reader's translator
 * @param {string} [manageHtml] the already-escaped "Manage notifications · " link, or ''
 * @returns {string} the footer table row
 */
export function brandFooter(t, manageHtml = '') {
  return footerPartial
    .trimEnd()
    .replace('{{manage}}', manageHtml)
    .replace('{{termsUrl}}', TERMS_URL)
    .replace('{{privacyUrl}}', PRIVACY_URL)
    .replace('{{terms}}', t.html('mail.footerTerms'))
    .replace('{{privacy}}', t.html('mail.footerPrivacy'))
}

/** The footer's line in a text part: the same two pages, addresses written out. */
export function brandFooterText(t) {
  return `${t('mail.footerTerms')}: ${TERMS_URL} · ${t('mail.footerPrivacy')}: ${PRIVACY_URL}`
}

/** A URL for an `href`. Escaping alone is not enough here — `javascript:alert(1)` has no character
 * that needs escaping and is still a hole. Only `http(s)` may reach an attribute, and only an
 * address a mail client can open: the string must also PARSE, with a host and no credentials
 * (`https://%/x` and `https:///x` pass a pattern and go nowhere). The caller's own spelling is
 * what is returned, so an encoded address or a signed token in it is not rewritten. */
export function safeUrl(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!/^https?:\/\/[^\s<>"'\\]+$/i.test(trimmed)) return ''
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (parsed.hostname === '' || parsed.username !== '' || parsed.password !== '') return ''
  // `https:///x` parses (the parser takes `x` as the host): the authority must be written out.
  if (!/^https?:\/\/[^/?#]/i.test(trimmed)) return ''
  return trimmed
}

/**
 * One notification email.
 * @param {{
 *   lang?: string,
 *   badge?: string | null,              key of the label above the title (`mail.n.badge.*`); none, no pill
 *   subject: string,                    plain text, already in the reader's language
 *   title?: string,                     plain text; defaults to the subject
 *   paragraphs: Array<{text: string, quote?: boolean} | {html: string} | {note: {strong: string, rest: string}}>,
 *     `text` is plain (escaped here); `html` is already-escaped markup a caller built with
 *     `t.html()` (a link inside a sentence); `quote` frames a person's words; `note` is the
 *     sign-in mail's tinted box, its first words bold (plain text, escaped here)
 *   button?: {label: string, url: string} | null,   label is plain text in the reader's language
 *   manageUrl?: string | null,
 *   inboxNote?: boolean   D3-A: "You can also find this in your Inbox in Tracy." under the button,
 *     plain text with no link (a letter whose event is also an Inbox row)
 * }} mail
 * @returns {{subject: string, html: string, text: string}}
 */
export function notificationMail({
  lang = 'en',
  badge = null,
  subject,
  title,
  paragraphs,
  button = null,
  manageUrl = null,
  inboxNote = false
}) {
  const t = translator(lang)
  const heading = title ?? subject
  const body = paragraphs
    .map((p) =>
      'note' in p
        ? `<p style="${NOTE}"><strong style="${NOTE_STRONG}">${unlinkedHtml(p.note.strong)}</strong> ${unlinkedHtml(p.note.rest)}</p>`
        : 'html' in p
          ? `<p style="${PARAGRAPH}">${p.html}</p>`
          : `<p style="${p.quote ? QUOTE : PARAGRAPH}">${unlinkedHtml(p.quote ? quoted(p.text) : p.text)}</p>`
    )
    .join('')
  const buttonUrl = button ? safeUrl(button.url) : ''
  if (button && !buttonUrl) throw new TypeError('notification mail: button url must be an http(s) URL')
  const buttonHtml = button
    ? `<p style="margin:6px 0 0;"><a href="${escapeHtml(buttonUrl)}" style="${BUTTON}">${escapeHtml(button.label)}</a></p>`
    : ''
  // The brand name after it lives in the footer partial, as plain text since C3-B (05/10/2026); a
  // letter with no settings page to point at (a workspace invitation) shows the brand name alone.
  const manage = safeUrl(manageUrl)
  const footer = manage
    ? `<a href="${escapeHtml(manage)}" style="${FOOTER_LINK}">${t.html('mail.n.manage')}</a> &middot; `
    : ''
  const firstText = paragraphs.find((p) => 'text' in p)?.text ?? heading

  const html = template
    .replaceAll('{{lang}}', t.htmlLang)
    .replaceAll('{{title}}', escapeHtml(heading))
    .replace('{{heading}}', unlinkedHtml(heading))
    .replace('{{preheader}}', unlinkedHtml(firstText))
    .replace(
      '{{badge}}',
      badge
        ? `<p style="${BADGE_P}"><span style="${BADGE_SPAN}">&#9679;&nbsp; ${t.html(badge)}</span></p>`
        : ''
    )
    .replace('{{body}}', body)
    .replace(
      '{{button}}',
      buttonHtml + (inboxNote ? `<p style="${INBOX_NOTE}">${t.html('mail.n.inboxNote')}</p>` : '')
    )
    .replace('{{brandFooter}}', brandFooter(t, footer))

  const text = [
    heading,
    '',
    ...paragraphs.flatMap((p) => [paragraphText(p), '']),
    ...(button ? [`${button.label}: ${buttonUrl}`, ''] : []),
    ...(inboxNote ? [t('mail.n.inboxNote'), ''] : []),
    ...(manage ? [`${t('mail.n.manage')}: ${manage}`] : []),
    brandFooterText(t)
  ].join('\n')

  return { subject, html, text }
}

/** One paragraph as the text part writes it. */
function paragraphText(p) {
  if ('note' in p) return `${p.note.strong} ${p.note.rest}`
  if ('text' in p) return p.quote ? quoted(p.text) : p.text
  return stripTags(p.html)
}

/** A person's words between curly quotes, as the approved copy shows them. */
function quoted(words) {
  return `“${words}”`
}

/** The plain-text fallback of a paragraph a caller built as HTML. */
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
