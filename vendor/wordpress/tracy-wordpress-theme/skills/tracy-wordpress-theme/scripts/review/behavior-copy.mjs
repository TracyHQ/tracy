// Copy that promises behaviour (class 12 of the Impact audit): a page says what will happen — "your username will be
// emailed" — and the form under it does something else (it posts to WordPress's lostpassword, which resets a password
// and never sends a username). A reviewer's eye is the only thing that sees it, so the finish checklist holds a REVIEWED
// inventory of every such claim: where it is, what the page says, what the form really does, who looked and what they decided.
//
//   scanBehaviorCopy(html, {route})      the claims a page makes, each bound to the form (or link) it sits with
//   behaviorGate({claims, reviews})      claims × reviews → findings. A claim passes only with a review whose `claimHash`
//                                        is the claim's own hash NOW (copy or action changed → stale), whose evidence is
//                                        written down, and whose disposition is not open. A claim the tool can SEE is false
//                                        (copy promises a username, form resets a password) passes only as `owner-approved`
//                                        with a cited decision — never as `truthful`.
//   auditBehaviorCopy({routes, fetchPage, reviews, decisions})   all routes; a route that cannot be read is unmeasured.
//
// Pure over HTML text: the same code runs on a fixture, a seed report and a live site. Nothing here fetches by itself.
import { createHash } from 'node:crypto'
import { citationErrors } from '../lib/parity-acceptance.mjs'
import { parseHtml, regionOf } from './content-audit.mjs'

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * What `admin-post.php` does is not in the URL: it runs whichever `admin_post_<action>` handler the form's `action` field
 * names. The detector can prove a handler only by that name; a handler it does not recognise — or a form that names none —
 * is an UNKNOWN feature (a claim a person reviews), never a contact form. Reading every admin-post form as a contact form
 * reported a username-reminder form's "your username will be emailed" as an unkept promise.
 */
export function featureOfHandler(handler) {
  const h = String(handler ?? '').toLowerCase()
  if (!h) return null
  if (/remind|forgot[-_]?user|(?:lost|retrieve)[-_]?user|username/.test(h)) return 'username-reminder'
  if (/lostpassword|lost[-_]?pass|forgot[-_]?pass|reset[-_]?pass|password/.test(h)) return 'password-reset'
  if (/subscribe|newsletter|mailchimp/.test(h)) return 'subscribe'
  if (/contact|enquir|inquir|feedback|message|mail/.test(h)) return 'contact-form'
  return null
}

/**
 * What a form action does in WordPress, by the endpoint it posts to. `null` when the action says nothing the tool knows.
 * `handler` is the `action` field of an admin-post form (a hidden input; the query of the URL names it too).
 */
export function featureOfAction(action, { handler = null } = {}) {
  const a = String(action ?? '').toLowerCase()
  if (/action=lostpassword|wp-login\.php\?action=lostpassword|lostpassword/.test(a)) return 'password-reset'
  if (/action=register|wp-login\.php\?action=register/.test(a)) return 'registration'
  if (/wp-login\.php$|wp-login\.php\?(?!action)|\/wp-login/.test(a)) return 'login'
  if (/admin-post/.test(a)) return featureOfHandler(handler ?? /[?&]action=([^&#]+)/.exec(a)?.[1])
  if (/wpcf7|contact/.test(a)) return 'contact-form'
  if (/wp-comments-post/.test(a)) return 'comment'
  if (/subscribe|newsletter|mailchimp/.test(a)) return 'subscribe'
  return null
}

/**
 * The promises the tool knows how to read. `needs` is the feature the promise requires; a form whose KNOWN feature is
 * another one contradicts the copy. An unknown feature is not a contradiction — it is a claim a person must review.
 */
export const BEHAVIOR_CLAIMS = Object.freeze([
  { id: 'username-emailed', copy: /\b(user\s?name|login name)s?\b[^.!?]{0,60}\b(e-?mailed|mailed|sent|reminded)\b|\b(e-?mail|send|mail)\b(?!\s+(address|field))[^.!?]{0,40}\b(your|the)\s+(user\s?name|login name)/i, needs: 'username-reminder', note: 'WordPress has no username reminder: wp-login.php?action=lostpassword resets a password' },
  { id: 'password-emailed', copy: /\b(password|reset link)\b[^.!?]{0,60}\b(e-?mailed|mailed|sent)\b|\b(?:e-?mail|send|mail)s?\s+(?:you|me|us)\b[^.!?]{0,40}\b(password|reset link)|\b(?:e-?mailed|mailed|sent)\b[^.!?]{0,30}\b(password|reset link)/i, needs: 'password-reset', note: 'the password-reset form must post to lostpassword' },
  { id: 'message-confirmed', copy: /\b(confirmation|receipt|copy)\b[^.!?]{0,40}\b(e-?mail(?:ed)?|sent|send|mailed)\b/i, needs: 'contact-form', note: 'a confirmation or copy is only sent when the form is set up to send one' },
  { id: 'subscription-confirmed', copy: /\b(subscribe|subscription|newsletter)\b[^.!?]{0,60}\b(confirm\w*|welcome e-?mail)\b/i, needs: 'subscribe', note: 'a subscription confirmation needs the subscription plugin' }
])

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
export const claimHash = (c) => sha(JSON.stringify([c.claim, collapse(c.copy).toLowerCase(), c.action ?? '', c.feature ?? '']))

function hintOf(el) {
  const parts = []
  for (let n = el; n && n.tagName && n.tagName !== 'BODY' && parts.length < 4; n = n.parentElement) {
    const cls = collapse(n.getAttribute('class')).split(' ')[0]
    parts.unshift(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : cls ? `.${cls}` : ''}`)
  }
  return parts.join(' > ')
}

const TEXT_TAGS = 'p, li, label, legend, small, span, div, h1, h2, h3, h4, h5, h6, td, dd, figcaption, blockquote, a'
function formFor(el) {
  const own = el.closest('form')
  if (own) return own
  for (let n = el.parentElement, up = 0; n && up < 4; n = n.parentElement, up++) {
    const f = n.querySelector('form')
    if (f) return f
  }
  return null
}

/**
 * @returns {{route: string, examined: number, claims: object[]}}  `examined` is the text blocks read; each claim carries
 *   {claim, copy, selector, region, action, feature, contradicts, note, claimHash}.
 */
export function scanBehaviorCopy(html, { route }) {
  const document = parseHtml(html)
  const claims = []
  let examined = 0
  for (const el of document.querySelectorAll(TEXT_TAGS)) {
    if (el.closest('script, style, noscript, template')) continue
    const text = collapse(el.textContent)
    if (!text || text.length > 400) continue
    examined++
    // the deepest element that holds the sentence: a parent holding the same words is left alone
    if ([...el.children].some((c) => BEHAVIOR_CLAIMS.some((k) => k.copy.test(collapse(c.textContent))))) continue
    for (const k of BEHAVIOR_CLAIMS) {
      if (!k.copy.test(text)) continue
      const form = formFor(el)
      const action = form ? collapse(form.getAttribute('action')) : ''
      const feature = form ? featureOfAction(action, { handler: form.querySelector('input[name="action"]')?.getAttribute('value') }) : null
      const c = { route, claim: k.id, copy: text.slice(0, 200), selector: hintOf(el), region: regionOf(el), action, feature, hasForm: Boolean(form), contradicts: Boolean(form && feature && feature !== k.needs && !(k.id === 'message-confirmed' && feature === 'contact-form')), note: k.note }
      // password and username talk on a password-reset form is the same promise made twice: the username one is the false one
      if (!claims.some((x) => x.selector === c.selector && x.claim === c.claim)) claims.push({ ...c, claimHash: claimHash(c) })
    }
  }
  return { route, examined, claims }
}

export const DISPOSITIONS = Object.freeze(['truthful', 'copy-fixed', 'feature-built', 'owner-approved', 'open'])

/** Refusals of the review file's shape: a list of rows each naming route, claim, claimHash, observed, evidence, reviewer, disposition. */
export function reviewErrors(reviews) {
  if (reviews == null) return []
  if (!Array.isArray(reviews)) return ['behavior-copy reviews are not a list']
  const errors = []
  reviews.forEach((r, n) => {
    const at = `reviews[${n}]`
    if (!r || typeof r !== 'object' || Array.isArray(r)) return errors.push(`${at}: not an object`)
    if (typeof r.route !== 'string' || !r.route.startsWith('/') || /[*?[\]{}()|^$\\+]/.test(r.route)) errors.push(`${at}: needs one exact route`)
    if (!BEHAVIOR_CLAIMS.some((k) => k.id === r.claim)) errors.push(`${at}: claim must be one of ${BEHAVIOR_CLAIMS.map((k) => k.id).join(', ')}`)
    if (typeof r.claimHash !== 'string' || !/^[0-9a-f]{16}$/.test(r.claimHash)) errors.push(`${at}: claimHash is the hash behavior-copy printed for the claim`)
    for (const f of ['observed', 'evidence', 'reviewer']) if (typeof r[f] !== 'string' || !r[f].trim()) errors.push(`${at}: needs ${f}`)
    if (!DISPOSITIONS.includes(r.disposition)) errors.push(`${at}: disposition must be one of ${DISPOSITIONS.join(', ')}`)
  })
  return errors
}

/** claims × reviews → { ok, findings, reviewed }. Nothing is accepted by default. */
export function behaviorGate({ claims, reviews = [], decisions }) {
  const findings = []
  const bad = reviewErrors(reviews)
  for (const message of bad) findings.push({ kind: 'behavior-copy-review-invalid', detail: message })
  const rows = Array.isArray(reviews) ? reviews.filter((r) => r && typeof r === 'object') : []
  let reviewed = 0
  for (const c of claims) {
    const at = { route: c.route, claim: c.claim, selector: c.selector, copy: c.copy, action: c.action, feature: c.feature }
    const mine = rows.filter((r) => r.route === c.route && r.claim === c.claim)
    const current = mine.find((r) => r.claimHash === c.claimHash)
    if (!mine.length) { findings.push({ kind: 'behavior-copy-unreviewed', ...at, claimHash: c.claimHash, detail: 'no reviewer has looked at this promise' }); continue }
    if (!current) { findings.push({ kind: 'behavior-copy-stale', ...at, claimHash: c.claimHash, detail: 'the copy or the form action changed since the review' }); continue }
    if (current.disposition === 'open') { findings.push({ kind: 'behavior-copy-unresolved', ...at, detail: 'the review is still open' }); continue }
    if (c.contradicts) {
      if (current.disposition !== 'owner-approved') { findings.push({ kind: 'behavior-copy-false', ...at, disposition: current.disposition, detail: `${c.note}; the page promises "${c.claim}" and its form is ${c.feature}` }); continue }
      // an owner-approved false promise cites ONE existing decision that names the page AND quotes the promise; with no decisions to read, nothing is approved
      if (!decisions) { findings.push({ kind: 'behavior-copy-false', ...at, detail: 'an owner-approved false promise cites a decision, and the decisions could not be read (--decisions DECISIONS.md)' }); continue }
      const refusals = citationErrors(current.decision, [c.route, collapse(c.copy).slice(0, 30)], decisions)
      if (refusals.length) { findings.push({ kind: 'behavior-copy-false', ...at, detail: `an owner-approved false promise cites a decision about it: ${refusals[0]}` }); continue }
    } else if (current.disposition === 'owner-approved' && !current.decision) {
      findings.push({ kind: 'behavior-copy-unresolved', ...at, detail: 'owner-approved needs the cited decision' })
      continue
    }
    reviewed++
  }
  return { ok: !findings.length, findings, reviewed, claims: claims.length }
}

/** All routes: scan, then gate. A route that cannot be read, or that held nothing to read, is `unmeasured`: the audit is not clean. */
export async function auditBehaviorCopy({ routes, fetchPage, reviews = [], decisions }) {
  if (!Array.isArray(routes) || !routes.length) throw new Error('no routes to scan: a scan of nothing is not clean')
  const errors = reviewErrors(reviews)
  if (errors.length) throw new Error(errors.join('; '))
  const claims = []
  const unmeasured = []
  let examined = 0
  for (const route of routes) {
    try {
      const page = await fetchPage(route)
      if (!page || page.status !== 200 || !page.html) { unmeasured.push({ route, reason: `the route answered ${page?.status ?? 'nothing'}` }); continue }
      const r = scanBehaviorCopy(page.html, { route })
      if (r.examined === 0) { unmeasured.push({ route, reason: 'the page held nothing to examine' }); continue }
      examined += r.examined
      claims.push(...r.claims)
    } catch (e) {
      unmeasured.push({ route, reason: String(e.message).split('\n')[0].slice(0, 160) })
    }
  }
  const gate = behaviorGate({ claims, reviews, decisions })
  return { check: 'behavior-copy', ok: gate.ok && !unmeasured.length, examined, routes: routes.length, claims: claims.length, reviewed: gate.reviewed, findings: gate.findings, unmeasured, inventory: claims }
}
