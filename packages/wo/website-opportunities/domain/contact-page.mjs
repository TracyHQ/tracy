// What a site's Contact page says, for every CMS (spec TracyHQ/tracy#189 item 19, round 9, class D).
//
// 🔒 THE CONTACT PAGE LISTS EVERY CHANNEL THE BRIEF HOLDS, EACH ONE A LINK (COO rule 29/10/2026: "every real channel shows and is
// clickable"). Measured on a brief build 30/10/2026: the page printed two phone numbers as plain text, unlabelled, and no
// WhatsApp, no direct message and no "By appointment" although the brief held all three. A summary block (a footer, a
// header) keeps one channel (`demo-leftovers-channels.mjs`); the Contact page is the one place that shows them all.
//
// 🔒 A BUSINESS THAT WORKS BY APPOINTMENT IS NEVER INVITED TO AS A WALK-IN. The same page said "Come say hello", "Come visit"
// and "Get directions" for a coach whose brief says "By appointment" and who teaches at locations across the city.
import { BY_APPOINTMENT } from './brief.mjs'
import { summaryContactBlocks } from './demo-leftovers-channels.mjs'

export { BY_APPOINTMENT }

/** Whether the brief concludes the business works by appointment (Tracy's inference from hours held as implausible). */
export function byAppointmentOf(brief) {
  for (const page of Array.isArray(brief?.sitemap) ? brief.sitemap : [])
    for (const section of Array.isArray(page?.sections) ? page.sections : [])
      for (const line of Array.isArray(section?.inferred) ? section.inferred : [])
        if (String(line?.text ?? '').trim() === BY_APPOINTMENT) return true
  return false
}

/** A link a visitor can follow from a contact page: a phone call, a mail, or a web address. */
const LINKABLE = /^(?:tel:\+?[\d]{5,}|mailto:[^\s@<>"]+@[^\s@<>"]+|https:\/\/[^\s<>"]+)$/i

/**
 * The lines of a Contact page's own channel list, in the order a visitor reads them: "By appointment" first when the brief says
 * so, then every channel of the site plan (each phone, WhatsApp, the mailbox, each direct message), then the areas served.
 * A channel without a followable link is left out (it would print as plain text); the same link is listed once.
 * @param {{ channels?: Array<{ kind: string, value?: string, href?: string, label?: string }> | null,
 *   contact?: Record<string, { value: string, href?: string }> | null }} plan - the site plan (`site-plan.mjs`)
 * @returns {Array<{ kind: string, text: string, href?: string }>}
 */
export function contactPageLines(plan) {
  const contact = plan?.contact ?? {}
  /** @type {Array<{ kind: string, text: string, href?: string }>} */
  const out = []
  if (String(contact.booking?.value ?? '').trim() !== '')
    out.push({ kind: 'booking', text: String(contact.booking.value).trim().replace(/\.$/, '') })
  const seen = new Set()
  const channels = [...(Array.isArray(plan?.channels) ? plan.channels : [])]
  // The mailbox is a contact fact, not a channel row: listed after the phones and chats when the brief gives one.
  if (contact.email?.value && !channels.some((c) => c?.kind === 'email'))
    channels.push({
      kind: 'email',
      value: contact.email.value,
      href: contact.email.href ?? `mailto:${contact.email.value}`,
      label: contact.email.value
    })
  for (const c of channels) {
    const href = String(c?.href ?? '').trim()
    if (!LINKABLE.test(href) || seen.has(href)) continue
    seen.add(href)
    const label = String(c?.label ?? c?.value ?? '').trim()
    if (label === '') continue
    out.push({ kind: String(c.kind), text: label, href })
  }
  const area = String(contact.serviceArea?.value ?? '').trim()
  if (area !== '') out.push({ kind: 'area', text: area })
  return out
}

const escapeHtml = (/** @type {string} */ text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The lines as HTML for a CMS field that takes markup (a contact record's extra information, a page block): a list whose
 * channels are links, a web link opening in a new tab.
 * @param {Array<{ kind: string, text: string, href?: string }>} lines
 */
export function contactPageHtml(lines) {
  if (!lines.length) return ''
  const items = lines.map((line) => {
    const words = escapeHtml(line.text)
    if (!line.href) return `<li class="contact-line contact-line--${line.kind}">${words}</li>`
    const outside = line.href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<li class="contact-line contact-line--${line.kind}"><a href="${escapeHtml(line.href)}"${outside}>${words}</a></li>`
  })
  return `<ul class="contact-channels">${items.join('')}</ul>`
}

/**
 * Words that invite a visitor to walk in, in English (the brief's language): what a business working by appointment never
 * says. "Get directions" counts only as a button or heading of its own, where it reads as an invitation to come by.
 */
export const WALK_IN_WORDS =
  /\b(?:come (?:and )?(?:visit|see us|say hello|say hi|by|in|over)|drop (?:by|in)|stop by|pop in|swing by|walk[- ]ins? (?:welcome|are welcome)|visit us|no appointment needed)\b/i
const DIRECTIONS = /^\s*get directions\s*$/i

/**
 * The findings of a built site's pages against the Contact page rules: a walk-in invitation on any page of a business working
 * by appointment, and on the Contact page a channel of the plan shown with no link to it, or "By appointment" missing.
 * CMS-neutral: it reads served HTML only.
 * @param {{ pages: Array<{ path: string, status?: number, html: string }>, plan: any, contactPath?: string | null }} input
 * @returns {Array<{ kind: string, path: string, severity: 'major' | 'minor', why: string, text?: string }>}
 */
export function contactPageFindings({ pages, plan, contactPath = null }) {
  /** @type {Array<{ kind: string, path: string, severity: 'major' | 'minor', why: string, text?: string }>} */
  const findings = []
  const appointment = String(plan?.contact?.booking?.value ?? '').trim() !== ''
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const texts = visibleTexts(page.html)
    if (appointment)
      for (const text of texts)
        if (WALK_IN_WORDS.test(text) || DIRECTIONS.test(text))
          findings.push({
            kind: 'walk-in-copy',
            path: page.path,
            severity: 'major',
            why: 'The business works by appointment, but this page invites visitors to walk in',
            text: text.slice(0, 160)
          })
    // A phone number or mailbox of the plan printed as words outside any link cannot be tapped (item 2): every page.
    const unlinked = visibleTexts(String(page.html ?? '').replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ')).join(' ')
    for (const c of Array.isArray(plan?.channels) ? plan.channels : [])
      if (
        c?.kind === 'phone' &&
        String(c.value ?? '').trim() !== '' &&
        unlinked.includes(String(c.value).trim())
      )
        findings.push({
          kind: 'contact-phone-unlinked',
          path: page.path,
          severity: 'major',
          why: `The phone number ${String(c.value).trim()} shows as plain text, not as a link to call it`
        })
    const mailbox = String(plan?.contact?.email?.value ?? '').trim()
    if (mailbox !== '' && unlinked.includes(mailbox))
      findings.push({
        kind: 'contact-email-unlinked',
        path: page.path,
        severity: 'major',
        why: `The email address ${mailbox} shows as plain text, not as a link to write to it`
      })
    if (contactPath === null || page.path !== contactPath) continue
    const html = String(page.html ?? '')
    // 🔒 THE CONTACT PAGE'S OWN BODY, NOT THE CHROME EVERY PAGE SHARES (round 11): a link or a word counts on the Contact
    // page only when it shows there more often than on any other page read. Measured 30/10/2026: the page's channel column
    // was empty while the footer on every page linked the phone and WhatsApp, and the check passed. CMS-neutral: counts on
    // served HTML, no landmark or template class (a T4 page's main element wraps its footer too).
    const others = (pages ?? []).filter((p) => p !== page && (p.status === undefined || p.status === 200))
    const ownMore = (/** @type {(html: string) => number} */ count) =>
      count(html) > Math.max(0, ...others.map((p) => count(String(p.html ?? ''))))
    const appointmentsIn = (/** @type {string} */ h) =>
      visibleTexts(h).filter((t) => /\bappointment\b/i.test(t)).length
    if (appointment && !ownMore(appointmentsIn))
      findings.push({
        kind: 'contact-booking-missing',
        path: page.path,
        severity: 'major',
        why: 'The business works by appointment, but its Contact page does not say so'
      })
    for (const line of contactPageLines(plan))
      if (line.href && !ownMore((h) => linksTo(h, line.href)))
        findings.push({
          kind: 'contact-channel-missing',
          path: page.path,
          severity: 'major',
          why: `The Contact page does not link the ${line.kind} channel of the brief (${line.href})`
        })
    // 🔒 THE CONTACT PAGE CARRIES EVERY CHANNEL THE FOOTER CARRIES (COO decision 30/10/2026, `footer-contact-shape.mjs`): a
    // channel a block shown on every page links is linked in the Contact page's own body too.
    const listed = new Set(contactPageLines(plan).map((line) => line.href))
    for (const block of summaryContactBlocks(pages ?? []).values())
      for (const link of block.run)
        if (!listed.has(link.href) && !ownMore((h) => linksTo(h, link.href))) {
          listed.add(link.href)
          findings.push({
            kind: 'contact-channel-missing',
            path: page.path,
            severity: 'major',
            why: `The Contact page does not link the ${link.kind} channel its footer shows (${link.href})`
          })
        }
  }
  return findings
}

/** How many links of a page lead to `href` (as written, or with its characters escaped). */
function linksTo(html, href) {
  const forms = [...new Set([`href="${escapeHtml(href)}"`, `href="${href}"`])]
  return forms.reduce((n, form) => n + String(html ?? '').split(form).length - 1, 0)
}

/** The text of every element a visitor reads, one entry per block, scripts and styles and hidden blocks left out. */
function visibleTexts(html) {
  const body = String(html ?? '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<([a-z0-9]+)\b[^>]*\shidden\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  return body
    .split(/<\/?(?:h[1-6]|p|li|a|button|div|span|dd|dt|td|label|legend|figcaption)\b[^>]*>/i)
    .map((part) =>
      part
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((t) => t !== '')
}
