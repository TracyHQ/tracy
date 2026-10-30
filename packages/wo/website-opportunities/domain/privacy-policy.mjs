// The Privacy Policy page of a brief build (spec TracyHQ/tracy#189, COO criterion 10.1): every site has one, in the business's
// name, written from the brief's facts only, and no demo terms or privacy page is left behind. Pure: no network, no clock.
//
// 🔒 NOTHING IS INVENTED: no law, no registration, no date, no retention period, no processor. The page says who the business
// is, what the site really collects (a contact form only when the brief gives an email to send it to; analytics and cookies
// only when the build says the site uses them), the channels the brief holds, and one line to contact the business about
// the data. A template with a terms or privacy page of its own keeps that page (rewritten); the others go.

/** The title of the page, and the id and address of one a build creates. */
export const PRIVACY_TITLE = 'Privacy Policy'
export const PRIVACY_PAGE_ID = 'privacy-policy'
export const PRIVACY_PAGE_PATH = '/privacy-policy'

/** A page of a template that is a legal page (terms, privacy, cookies, disclaimer), by the words of its id and label. */
export const LEGAL_PAGE_WORDS = /\b(privacy|terms|legal|cookies?[- ]policy|disclaimer|imprint|conditions)\b/i

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The channels a visitor can reach the business on, from the brief's reading (`contactChannelsOf`) and the contact facts.
 * @param {{ email?: string, phone?: string, address?: string, channels?: Array<{kind: string, value?: string}> }} contact
 * @returns {{ email: string, phones: string[], messages: boolean, address: string }}
 */
export function privacyChannelsOf(contact = {}) {
  const channels = Array.isArray(contact.channels) ? contact.channels : []
  const phones = channels.filter((c) => c.kind === 'phone' && text(c.value)).map((c) => text(c.value))
  const phone = text(contact.phone)
  if (phone && !phones.includes(phone)) phones.unshift(phone)
  return {
    email: text(contact.email),
    phones,
    messages: channels.some((c) => c.kind === 'message' || c.kind === 'whatsapp' || c.kind === 'chat'),
    address: text(contact.address)
  }
}

/** The one channel the "Contact us" line names: the email, else the first phone, else the address; null when none. */
export function privacyContactChannel(channels) {
  if (channels.email) return { kind: 'email', value: channels.email }
  if (channels.phones[0]) return { kind: 'phone', value: channels.phones[0] }
  if (channels.address) return { kind: 'address', value: channels.address }
  return null
}

/**
 * The Privacy Policy of one business, as sections of plain paragraphs.
 * @param {{ name: string, contact?: object, collects?: { form?: boolean, analytics?: boolean, cookies?: boolean } }} input
 *   `collects`: what the site really uses; the contact form follows the brief's email
 * @returns {{ title: string, sections: Array<{ heading: string, paragraphs: string[] }>, channel: {kind: string, value: string} | null }}
 */
export function privacyPolicyOf({ name, contact = {}, collects = {} }) {
  const business = text(name)
  const channels = privacyChannelsOf(contact)
  const channel = privacyContactChannel(channels)
  const ways = [channels.email && 'email', channels.phones.length && 'phone', channels.messages && 'message']
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' or $1')
  const collected = []
  if (collects.form)
    collected.push(
      'When you use the contact form on this website, we receive the details you type into it, such as your name, your email address and your message.'
    )
  if (ways)
    collected.push(
      `When you contact us by ${ways}, we receive the details you share with us, such as your name and your message.`
    )
  if (collects.analytics) collected.push('This website uses analytics to count visits to its pages.')
  if (collects.cookies) collected.push('This website uses cookies.')
  if (!collected.length)
    collected.push('We only receive the details that you choose to share with us when you contact us.')
  const ask = channel
    ? `Contact us at ${channel.value} about your data.`
    : 'Contact us through this website about your data.'
  return {
    title: PRIVACY_TITLE,
    channel,
    sections: [
      {
        heading: 'About this policy',
        paragraphs: [
          `This page explains how ${business} uses the personal details that visitors give us through this website.`
        ]
      },
      { heading: 'What we collect', paragraphs: collected },
      {
        heading: 'How we use it',
        paragraphs: ['We use these details to reply to you and to provide the services you ask us about.']
      },
      { heading: 'Your data', paragraphs: [ask] }
    ]
  }
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The article body of the policy: plain headings and paragraphs, the template's own article layout styles them. */
export function privacyPolicyHtml(policy) {
  return policy.sections
    .map(
      (s) =>
        `<h2>${escapeHtml(s.heading)}</h2>\n${s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}`
    )
    .join('\n')
}

/** Every sentence a visitor can read on the policy page (for a report and for the checks). */
export const privacySentences = (policy) => policy.sections.flatMap((s) => [s.heading, ...s.paragraphs])

/** What the policy is written from: the plan's brand, contact facts and channels. A form is on only where the brief has an email. */
export function privacyInputsOf(sitePlan) {
  const fact = (kind) => String(sitePlan?.contact?.[kind]?.value ?? '').trim()
  const contact = {
    email: fact('email'),
    phone: fact('phone'),
    address: fact('address'),
    channels: Array.isArray(sitePlan?.channels) ? sitePlan.channels : []
  }
  return {
    name: String(sitePlan?.brand?.name?.value ?? '').trim(),
    contact,
    collects: { form: contact.email !== '' }
  }
}

const flat = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The final check of the Privacy Policy rule on the served pages: the page is there, it is linked from the footer of every
 * page, it names the business, carries no demo legal text, and mentions only channels the brief holds.
 * @param {object} input
 * @param {Array<{path: string, html: string, status?: number}>} input.pages
 * @param {{ path?: string }|null} input.privacy - the plan's privacy page row
 * @param {string} input.name - the business name
 * @param {object} [input.contact] - the brief's contact facts (`privacyChannelsOf` input)
 * @param {(html: string) => string[]} [input.footerLinks] - the hrefs inside the footer region of a page
 * @returns {Array<{kind: string, severity: string, path: string, why: string}>}
 */
export function privacyPolicyFindings({ pages, privacy, name, contact = {}, footerLinks = () => [] }) {
  const out = []
  const finding = (path, why) => out.push({ kind: 'privacy-policy', severity: 'major', path, why })
  const path = privacy?.path ?? PRIVACY_PAGE_PATH
  const norm = (p) => String(p ?? '').replace(/\/+$/, '') || '/'
  const served = (pages ?? []).filter((p) => !p.status || p.status === 200)
  const page = served.find((p) => norm(p.servedPath ?? p.path) === norm(path) || norm(p.path) === norm(path))
  if (!page) {
    finding(path, 'the site has no Privacy Policy page')
    return out
  }
  const body = flat(page.html)
  if (!/privacy/i.test(body.slice(0, 20000))) finding(path, 'the Privacy Policy page does not say it is one')
  if (text(name) && !body.toLowerCase().includes(text(name).toLowerCase()))
    finding(path, `the Privacy Policy page does not name the business "${name}"`)
  const demo = body.match(
    /\b(lorem ipsum|dolor sit amet|joomla!?|joomlart|your company name|company name)\b/i
  )
  if (demo) finding(path, `the Privacy Policy page keeps demo text: "${demo[0]}"`)
  const channels = privacyChannelsOf(contact)
  const emails = [...body.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase())
  for (const e of emails)
    if (e !== channels.email.toLowerCase())
      finding(path, `the Privacy Policy page names an email the brief does not hold: ${e}`)
  if (/\b(by|via) (?:[a-z, ]* )?(?:phone|telephone)\b/i.test(body) && !channels.phones.length)
    finding(path, 'the Privacy Policy page mentions a phone the brief does not hold')
  const home = served.find((p) => norm(p.path) === '/') ?? served[0]
  const links = home ? footerLinks(home.html).map(norm) : []
  if (home && !links.includes(norm(path)))
    finding(home.path, 'the Privacy Policy page is not linked from the footer')
  return out
}
