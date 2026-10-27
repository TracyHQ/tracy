/**
 * Mail bodies for the seat book's write doors — pure functions, no fetch, no env, no clock other
 * than what the caller passes in. Ported from `workers/mail/src/emails.js`, keeping only the
 * templates a door in this app actually calls (`seats/route.js`): `inviteMail`,
 * `addedToWorkspace`, `joinRequestMail`, `teamInviteMail`.
 *
 * NOT PORTED, WITH REASON — CLAUDE.md §0 rule 3 ("say what you don't do"):
 *   - `signupCode` / `magicLinkCode` — this app's sign-in (`identity/route.js`) mails its own
 *     six-digit-code email directly; it never went through Supabase's `email_action_type`
 *     hook these two exist to answer, so there is nothing here that would call them.
 *   - `tracyTeamInviteMail` — Task 8 (`workspaces/route.js`) invites a Tracy staff member with the
 *     same `inviteMail`/`addedToWorkspace` templates every other workspace invite uses (the
 *     `tracy_admin` workspace's own `display_name` stands in for a customer's), not a separate
 *     template: the Worker's version exists to carry a signed accept-token link, but acceptance
 *     here is only ever of the signed-in account's own pending grant — the token was convenience,
 *     not the security boundary (see `workspaces/route.js`'s own docstring). Since #794 the two
 *     templates take an optional `acceptUrl`, and the staff door passes the unsigned
 *     `/ops/invite/…` address (`lib/team-invite.js`'s `staffInviteUrl`), so the mail has something
 *     to press.
 *
 * `removalCodeMail` WAS added for Task 8's `/tracy-admin/members/:id/code` door — the one mail this
 * app sends to authorise a write rather than announce one already made.
 *
 * Seat/team templates retain their inline HTML. Access emails render the reviewed static
 * HTML handoff from the marketing team; the transport forwards HTML alongside the plain-text fallback.
 * Templates are loaded once with the module, with no cross-repository runtime dependency.
 *
 * EVERY WORD IN THE READER'S LANGUAGE (#753): Tracy's own copy below comes from
 * `../lib/i18n/strings.js` (English, the source) and `../lib/i18n/locales/<lang>.json`, in the language of
 * the request that triggers the mail — the visitor asking for a code, the person sending an invite
 * or a join request. Each template takes `lang` (default English). The two access-mail HTML
 * templates carry `{{t:key}}` slots instead of words, so their layout stays the reviewed one. Data
 * from outside (an inviter's name, a site key) keeps whatever a person typed — it is data, not
 * Tracy's copy.
 */

import { readFileSync } from 'node:fs'
import { escapeHtml } from '../lib/html.js'
import { translator } from '../lib/i18n/index.js'
import { CODE_TTL_MINUTES, TEAM_INVITE_TTL_DAYS } from '../lib/policy.js'
import { brandFooter, brandFooterText, notificationMail, safeUrl } from './notification-mail.js'

const signInTemplate = readFileSync(new URL('./templates/sign-in-code.html', import.meta.url), 'utf8')
const whitelistTemplate = readFileSync(new URL('./templates/join-whitelist.html', import.meta.url), 'utf8')

/**
 * Fill one of the reviewed HTML templates: `{{lang}}` → `<html lang>`, `{{t:key}}` → that key in
 * `t`'s language, escaped, its `{placeholders}` replaced by `htmlVars` (already HTML), and every
 * other `{{name}}` → `values[name]` (already HTML). The layout stays as reviewed; only the words move.
 */
function fillTemplate(template, t, { htmlVars = {}, values = {} } = {}) {
  return (
    template
      .replaceAll('{{lang}}', t.htmlLang)
      // A sign-in code or a waitlist link cannot be switched off: the footer has no Manage link.
      .replace('{{brandFooter}}', brandFooter(t))
      .replace(/\{\{t:([a-zA-Z.]+)\}\}/g, (_, key) => t.html(key, htmlVars))
      .replace(/\{\{([a-zA-Z]+)\}\}/g, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole))
  )
}

/** Check the SHAPE, not just squeeze characters — a value that does not look like what it claims
 * to be is dropped, and the sentence around it steps down to a plainer one rather than carry it. */
function shaped(value, pattern, limit) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length <= limit && pattern.test(trimmed) ? trimmed : ''
}

const asEmail = (value) => shaped(value, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 254)
const asSiteKey = (value) =>
  shaped(value, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, 253)
/** Ported from `workers/mail/src/emails.js`'s own `asCode` — a code is data too, and the same shape
 * discipline as every other value here applies to it. */
const asCode = (value) => shaped(value, /^[A-Za-z0-9-]+$/, 16)

/** A display name — freer than an email, so no shape regex; instead: one line, no control
 * characters, at most 80 characters. Any rule broken drops the whole name. */
function asName(value) {
  if (typeof value !== 'string') return ''
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (collapsed === '' || collapsed.length > 80) return ''
  if ([...collapsed].some((ch) => ch.codePointAt(0) < 0x20 || ch.codePointAt(0) === 0x7f)) return ''
  return collapsed
}

/**
 * The opening line of the two site-invitation mails. Steps down through what is actually known —
 * the inviter's name, then their email, then a passive voice when both are absent — rather than
 * guess. Ported verbatim in shape from `addedLine`.
 */
function addedLine(t, { inviterName, inviterEmail, workspaceName }) {
  // "Name (email)", the one person rule (`personLine`); nothing known reads as a passive sentence.
  const inviter =
    displayName(inviterName) || asEmail(inviterEmail) ? personLine(t, inviterName, inviterEmail) : ''
  const workspace = asName(workspaceName)
  if (inviter && workspace) return t('mail.invitedByTo', { inviter, workspace })
  if (workspace) return t('mail.invitedTo', { workspace })
  if (inviter) return t('mail.invitedBy', { inviter })
  return t('mail.invited')
}

const SITES_IN_MAIL = 5

/**
 * The shared mail of `inviteMail`/`addedToWorkspace`, on the notification template (#809 step 2).
 * They differ only in the closing line: a person without an account yet has to sign in for the
 * first time, one who already has an account just opens the app. There is no link: acceptance goes
 * through the signed-in `/me/workspaces/:id/accept` door, except the Tracy staff invitation (#794),
 * which passes `acceptUrl` and gets an Accept button.
 */
function workspaceInviteMail(
  t,
  { inviterName, inviterEmail, workspaceName, siteKeys = [], closing, acceptUrl = undefined }
) {
  // `acceptUrl` is optional — only a caller that HAS a door passes one (#794: the Tracy staff
  // invitation, `/ops/invite/…`). Passed and not an http(s) URL is a programming error and throws,
  // same as `teamInviteMail`: a mail with a link that goes nowhere is a bug, not a degraded mail.
  const url = acceptUrl === undefined ? '' : safeUrl(acceptUrl)
  if (acceptUrl !== undefined && !url) throw new TypeError('invite mail: acceptUrl must be an http(s) URL')
  const listed = siteKeys.map(asSiteKey).filter(Boolean)
  const shown = listed.slice(0, SITES_IN_MAIL)
  const more = listed.length - shown.length
  const sitesLabel = t(shown.length === 1 ? 'mail.website' : 'mail.websites')
  const sites = more > 0 ? t('mail.andMore', { list: shown.join(', '), count: more }) : shown.join(', ')
  const paragraphs = [{ text: addedLine(t, { inviterName, inviterEmail, workspaceName }) }]
  if (shown.length > 0) paragraphs.push({ text: `${sitesLabel} ${sites}` })
  for (const line of closing) paragraphs.push({ text: line })
  return notificationMail({
    lang: t.lang,
    badge: 'mail.n.badge.invitation',
    subject: subjectFor(t, workspaceName),
    paragraphs,
    button: url ? { label: t('mail.n.invited.accept'), url } : null
  })
}

function subjectFor(t, workspaceName) {
  const workspace = asName(workspaceName)
  return workspace ? t('mail.subjectWorkspace', { workspace }) : t('mail.subjectPlain')
}

/**
 * The invitation mail — a person with NO Tracy account yet. Ported from `inviteMail`: no invite
 * code is printed (a code comes at sign-in), and the mail names only who invited them and which
 * workspace, if the site already has one on file. `lang`: the inviter's request language (#753).
 */
export function inviteMail({
  inviterName,
  inviterEmail,
  workspaceName,
  siteKeys,
  acceptUrl = undefined,
  lang = 'en'
}) {
  const t = translator(lang)
  return workspaceInviteMail(t, {
    inviterName,
    inviterEmail,
    workspaceName,
    siteKeys,
    acceptUrl,
    closing: [t('mail.inviteClosing')]
  })
}

/**
 * The "you have a new invitation" mail — a person who ALREADY has a Tracy account. Same body as
 * `inviteMail`, only the closing line differs: opening the app is enough, there is no first sign-in
 * to walk through. Ported from `addedToWorkspace`.
 */
export function addedToWorkspace({
  inviterName,
  inviterEmail,
  workspaceName,
  siteKeys,
  acceptUrl = undefined,
  lang = 'en'
}) {
  const t = translator(lang)
  return workspaceInviteMail(t, {
    inviterName,
    inviterEmail,
    workspaceName,
    siteKeys,
    acceptUrl,
    closing: [t('mail.addedClosing')]
  })
}

/**
 * "Name (email)" for a person named in a notification; the name is the local part of the address
 * when none is on file (approved copy, #809: a person is named with their address the first time).
 */
export function personLine(t, name, email) {
  const address = asEmail(email)
  // The approved shape is always "Name (email)"; with no display name the name is the local part
  // of the address, the same rule as `shortName` and the Inbox (04/10).
  const shapedName = displayName(name) || address.split('@')[0]
  if (shapedName && address) return t('mail.n.person', { name: shapedName, email: address })
  return shapedName || t('mail.someone')
}

/**
 * A person as a subject or a title names them ("Akemi invited you…"): the display name, else the
 * local part of the address, the same rule the Inbox uses for its rows (`actorName` in
 * `@tracy/dsh-inbox`). A raw address in a title reads as a link, and Gmail draws it as one.
 */
export function shortName(t, name, email) {
  return displayName(name) || asEmail(email).split('@')[0] || t('mail.someone')
}

/**
 * A display name, or '' when there is none. A value shaped like an address is not a name: rows
 * written before 04/10/2026 stored `display_name ?? email` as `requesterName` (T2b).
 */
function displayName(value) {
  const name = asName(value)
  return name && !asEmail(name) ? name : ''
}

/** A site key as it may appear in a notification, or "your site" when it does not look like one. */
export function siteName(t, siteKey) {
  return asSiteKey(siteKey) || t('mail.yourSite')
}

/**
 * The mail to a site's Owners: somebody asked to join (#809 case T2, approved copy).
 * `reviewUrl` is required and must be an `http(s)` URL: a mail with a button that goes nowhere is
 * a bug, not a degraded mail. `lang`: the RECIPIENT's language (each Owner gets their own letter).
 */
export function joinRequestMail({
  requesterEmail,
  requesterName,
  siteKey,
  reviewUrl,
  manageUrl = null,
  lang = 'en'
}) {
  const t = translator(lang)
  const who = shortName(t, requesterName, requesterEmail)
  const site = asSiteKey(siteKey) || t('mail.yourSite')
  const url = safeUrl(reviewUrl)
  if (!url) throw new TypeError('join request mail: reviewUrl must be an http(s) URL')
  return notificationMail({
    lang,
    badge: 'mail.n.badge.joinRequest',
    subject: t('mail.n.joinRequest.subject', { who, site }),
    paragraphs: [
      { text: t('mail.n.joinRequest.opening', { who: personLine(t, requesterName, requesterEmail), site }) },
      { text: t('mail.n.joinRequest.how') },
      { text: t('mail.n.joinRequest.everyone') }
    ],
    button: { label: t('mail.n.joinRequest.review'), url },
    manageUrl,
    inboxNote: true
  })
}

// The roles an invitation may carry: `seats/roles.js`'s INVITABLE_ROLES (ADR 0028), restated
// because `mail/` may not import that domain. Owners are never invited.
const TEAM_ROLES = new Set(['editor', 'viewer'])

/**
 * The team door's invitation mail (#809 case T1, approved copy): one person, one role, N sites,
 * ONE link that accepts every site of the batch. `acceptUrl` is built by the caller from a signed
 * token, never from user input; a malformed one is a programming error and throws. `declineUrl`
 * (the same token's decline page) adds the "Not for you? Decline" line. `lang`: the invitee's own
 * language when their account has one, else the inviter's request language.
 */
export function teamInviteMail({
  inviterName,
  inviterEmail,
  role,
  siteKeys = [],
  acceptUrl,
  declineUrl = null,
  manageUrl = null,
  lang = 'en'
}) {
  const url = safeUrl(acceptUrl)
  if (!url) throw new TypeError('team invite mail: acceptUrl must be an http(s) URL')
  const decline = declineUrl === null ? '' : safeUrl(declineUrl)
  if (declineUrl !== null && !decline)
    throw new TypeError('team invite mail: declineUrl must be an http(s) URL')
  if (!TEAM_ROLES.has(role)) throw new TypeError(`team invite mail: unknown role "${role}"`)
  const t = translator(lang)
  const inviter = shortName(t, inviterName, inviterEmail)
  const named = personLine(t, inviterName, inviterEmail)
  const listed = siteKeys.map(asSiteKey).filter(Boolean)
  const one = listed.length <= 1
  const site = listed[0] ?? t('mail.yourSite')
  const paragraphs = one
    ? [{ text: t('mail.n.invited.opening', { inviter: named, site }) }]
    : [{ text: t('mail.n.invited.openingMany', { inviter: named }) }, ...listed.map((key) => ({ text: key }))]
  paragraphs.push({ text: t(`mail.n.invited.role.${role}`) })
  // The lifetime `GET /invite/:token` enforces (#804), printed from the same policy value.
  paragraphs.push({ text: t('mail.teamLinkLifetime', { days: TEAM_INVITE_TTL_DAYS }) })
  // "Not for you? Decline" (approved U9 B): a small link, not a second button, so a phone thumb
  // does not decline by mistake. It opens a confirmation page; nothing is declined by the GET.
  if (decline) {
    const link = `<a href="${escapeHtml(decline)}" style="color:#a3462a;">${t.html('mail.n.invited.declineLink')}</a>`
    paragraphs.push({
      html: t.html('mail.n.invited.decline', { decline: link }),
      text: t('mail.n.invited.decline', { decline: `${t('mail.n.invited.declineLink')} (${decline})` })
    })
  }
  return notificationMail({
    lang,
    badge: 'mail.n.badge.invitation',
    subject: one
      ? t('mail.n.invited.subject', { inviter, site })
      : t('mail.n.invited.subjectMany', { inviter, count: listed.length }),
    paragraphs,
    button: { label: t('mail.n.invited.accept'), url },
    manageUrl,
    inboxNote: true
  })
}

/**
 * The code that authorises removing a Tracy staff member — ported verbatim (in content) from
 * `workers/mail/src/emails.js`'s own `removalCodeMail`. Sent to the CALLER's own mailbox, never to
 * the target's — see `workspaces/route.js`'s `handleTracyAdminRemovalCode`-equivalent for why that
 * is the whole point of this mail existing.
 */
export function removalCodeMail({ code, targetEmail, lang = 'en' }) {
  const t = translator(lang)
  const safeCode = asCode(code)
  // A seat without an email still gets a readable name, in the reader's language.
  const target = targetEmail ? String(targetEmail) : t('mail.removalUnknownMember')
  // The shared layout since 04/10/2026 (mail audit): its header, autolink-safe text, and the
  // one-line footer without a Manage link. The text part is built from the same paragraphs.
  const codeHtml = `<strong style="font-size:20px;letter-spacing:2px">${escapeHtml(safeCode)}</strong>`
  return notificationMail({
    lang,
    subject: t('mail.removalSubject', { code: safeCode, email: target }),
    title: t('mail.removalSubject', { code: safeCode, email: target }),
    paragraphs: [
      { text: t('mail.removalIntro') },
      { text: t('mail.removalMember', { email: target }) },
      { html: t.html('mail.removalCode', { code: codeHtml }) },
      { text: t('mail.removalValidity') },
      { text: t('mail.removalWarning') }
    ]
  })
}

/**
 * The install code of a downloaded site package (`sites/backup-export.js`, 19/10/2026), sent once,
 * after the first download link. The package's `installer.php` asks for it only when the new host's
 * database is on a different server; the mail says so, and where in Tracy to find it again.
 *
 * The code is NOT in the subject, unlike a sign-in code: it lives as long as the package, and a
 * subject shows up in notifications and inbox lists. The installer page (English only) does not
 * quote the subject, which is in the reader's language: it names "the email from Tracy with your
 * install code" and the Tracy path, with the site's label as Tracy knows it.
 */
export function installCodeMail({ code, site, version, lang = 'en' }) {
  const t = translator(lang)
  const safeCode = shaped(code, /^[0-9]{6}$/, 6)
  if (!safeCode) throw new TypeError('install code mail: the code must be six digits')
  const label = asName(site) || t('mail.installCodeYourSite')
  const codeHtml = `<strong style="font-size:20px;letter-spacing:2px">${escapeHtml(safeCode)}</strong>`
  return notificationMail({
    lang,
    subject: t('mail.installCodeSubject', { site: label }),
    title: t('mail.installCodeSubject', { site: label }),
    paragraphs: [
      { text: t('mail.installCodeIntro', { site: label, version: String(version) }) },
      { html: t.html('mail.installCodeCode', { code: codeHtml }) },
      { text: t('mail.installCodeKeep') },
      { text: t('mail.installCodeWhere') },
      { text: t('mail.installCodeWarning') }
    ]
  })
}

/**
 * The sign-in code mail — one template for BOTH doors that send it (`identity/route.js` for
 * cowork, `bar/route.js` for a customer site's own gate). It was two inline literals in two files
 * until 11/09, and they had already started to be two things a person would have to keep in step
 * by hand.
 *
 * 🔒 THE CODE GOES IN THE SUBJECT, AND THAT IS NOT DECORATION. `workers/mail/src/emails.js`'s
 * `magicLinkCode` sends `{{code}} is your Tracy sign-in code` — measured against real sends from
 * production, 08–10/09 — so the code is readable from a phone's notification without opening
 * anything. The first port of this app wrote `Your Tracy sign-in code` with the code only in the
 * body: same information, one more step for every person signing in, on the one screen where a
 * person is least willing to take one. `signin_subject_plain` is the Worker's own fallback for a
 * code that failed its shape check, and it is kept for the same case. Every translation keeps the
 * code first in the subject for the same reason.
 *
 * `lang` (#753): the language of the request that asked for the code — `?lang=`, the
 * `tracy_lang` cookie the dsh page keeps, or the browser's own language (`../lib/i18n/index.js`).
 */
export function signInCodeMail(code, lang = 'en') {
  const t = translator(lang)
  const safeCode = asCode(code)
  return {
    subject: safeCode ? t('mail.signInSubject', { code: safeCode }) : t('mail.signInSubjectPlain'),
    ...(safeCode
      ? {
          html: fillTemplate(signInTemplate, t, {
            htmlVars: { code: escapeHtml(safeCode), minutes: String(CODE_TTL_MINUTES) },
            values: { code: escapeHtml(safeCode) }
          })
        }
      : {}),
    // The text part says what the HTML says, sentence for sentence (mail audit 04/10).
    text: safeCode
      ? [
          t('mail.signInHeading'),
          '',
          t('mail.signInBody'),
          '',
          safeCode,
          '',
          t('mail.signInValid', { minutes: CODE_TTL_MINUTES }),
          '',
          `${t('mail.signInNotRequested')} ${t('mail.signInNotRequestedRest')}`,
          '',
          brandFooterText(t)
        ].join('\n')
      : t('mail.signInFailed')
  }
}

/** Admission mail links to the whitelist, never claiming a submission or granting access. */
export function betaMail({ url, unavailable = false, lang = 'en' }) {
  const link = safeUrl(url)
  if (!link) throw new TypeError('beta mail: invalid waitlist URL')
  const t = translator(lang)
  const openingKey = unavailable ? 'mail.whitelistUnavailable' : 'mail.whitelistOpening'
  return {
    subject: t(unavailable ? 'mail.whitelistSubjectUnavailable' : 'mail.whitelistSubject'),
    // Anyone can type someone else's address on the sign-in page: the box says so, as the sign-in
    // mail's does, so a stranger who never asked ignores the mail instead of reporting it as spam
    // (06/10/2026).
    text: [
      t(openingKey),
      '',
      t('mail.whitelistClosing'),
      link,
      '',
      `${t('mail.signInNotRequested')} ${t('mail.signInNotRequestedRest')}`,
      '',
      brandFooterText(t)
    ].join('\n'),
    html: fillTemplate(whitelistTemplate, t, {
      // Plain text, not a link, and kept from autolinking (#809's zero-width joiner): a letter from
      // tracy.ai that links to another brand and says "sign in with the email you use there" is
      // the shape filters score as phishing (spam audit 05/10/2026).
      htmlVars: { link: '<span style="color:#5c534e;">joomlart.com</span>' },
      values: { url: escapeHtml(link), opening: t.html(openingKey) }
    }).replaceAll('joomlart.com', 'joomlart.&zwnj;com')
  }
}
