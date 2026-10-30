/**
 * The site-wide parts of the site plan that code fills from the brief (spec TracyHQ/tracy#231, ticket #240): the forms of
 * the template, the contact details, the identity and the legal pages. The author is not asked for them (`CONTRACT` of
 * `site-plan-author.js`); what it writes anyway is kept over these defaults. The later stages read them from the plan
 * (`site-plan-fill.js`) instead of deciding them on their own.
 *
 *   forms     one decision per form of the template (`form:<entity>`, `template-inventory-pages.js`): kept with where it
 *             sends (`sendsTo`) when the brief gives it a real destination, else hidden with the reason:
 *               contact     the owner's email of the brief
 *               newsletter  a verified email-marketing list of the brief (`formDestinationsOf`, WO domain `form-blocks.mjs`)
 *               booking     a verified booking link of the brief
 *               login       never: a Tracy site has no member area
 *   contact   phone, email, address, hours, map and socials: kept with the brief's value, else hidden with the reason;
 *   identity  the business name (kept when the brief gives one), the logo and the favicon (made by the brand stage);
 *   legal     the privacy page: added when the brief names the business, else dropped with the reason.
 * CMS-neutral.
 */

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')

/** Where a form of each kind sends, given the brief, or null with the reason it has nowhere to send. */
function destinationOf(/** @type {string} */ kind, /** @type {any} */ site) {
  const reach = site?.formDestinations ?? {}
  switch (kind) {
    case 'contact':
      return text(site?.email)
        ? { sendsTo: { kind: 'email', target: text(site.email) } }
        : { reason: 'the brief gives no email for the contact form to send to' }
    case 'newsletter':
      return reach.newsletter
        ? { sendsTo: { kind: 'newsletter', target: 'the email-marketing list of the brief' } }
        : { reason: 'the brief names no email-marketing list for the sign-up form to send to' }
    case 'booking':
      return reach.booking
        ? { sendsTo: { kind: 'booking', target: 'the booking link of the brief' } }
        : { reason: 'the brief gives no booking link for the booking form to send to' }
    default:
      return { reason: 'a site of this business has no member area for a login form to send to' }
  }
}

/**
 * The form decisions code fills: every form on a page of the template that the plan does not take off or decide already.
 * @param {{elements: any[], decided: Map<string, any>, onPage: (e: any) => boolean, off: (e: any) => boolean, site: any}} input
 */
export function formDecisions({ elements, decided, onPage, off, site }) {
  const out = []
  for (const e of elements) {
    if (e.kind !== 'form' || decided.has(e.id) || !onPage(e) || off(e)) continue
    const to = destinationOf(e.formKind, site)
    out.push(
      to.sendsTo
        ? { element: e.id, decision: 'keep', sendsTo: to.sendsTo }
        : { element: e.id, decision: 'hide', reason: to.reason }
    )
  }
  return out
}

/** A part kept with the brief's value, or hidden with the reason. */
const part = (/** @type {unknown} */ value, /** @type {string} */ missing) =>
  value && (typeof value !== 'object' || Object.keys(value).length > 0)
    ? { decision: 'keep', value }
    : { decision: 'hide', reason: missing }

/**
 * The contact details, identity and legal pages of the plan: the author's own where it wrote them, else the brief's.
 * @param {any} answer - the author's plan
 * @param {any} site - the brief as the writers get it
 */
export function siteParts(answer, site) {
  const socials = Object.entries(site?.social && typeof site.social === 'object' ? site.social : {})
    .filter(([, url]) => text(url))
    .map(([network, url]) => ({ network, url: text(url) }))
  const contact = {
    phone: part(text(site?.phone), 'the brief gives no phone'),
    email: part(text(site?.email), 'the brief gives no email'),
    address: part(text(site?.address), 'the brief gives no street address'),
    hours: part(site?.hours ?? null, 'the brief gives no opening hours'),
    map: part(text(site?.address), 'the brief gives no street address to show on a map'),
    socials: socials.length
      ? { decision: 'keep', value: socials }
      : { decision: 'hide', reason: 'the brief gives no social profile' }
  }
  const name = text(site?.name)
  const identity = {
    name: part(name, 'the brief gives no business name'),
    logo: {
      decision: 'keep',
      from: 'the brand stage: the brief logo, else the business name set as a word mark'
    },
    favicon: { decision: 'keep', from: 'the brand stage: made from the logo' }
  }
  const legal = {
    privacy: name
      ? { decision: 'add', reason: 'every site states how it handles visitor data' }
      : { decision: 'drop', reason: 'the brief gives no business name for the privacy page to name' }
  }
  const own = (/** @type {string} */ k) =>
    answer?.[k] && typeof answer[k] === 'object' && !Array.isArray(answer[k]) ? answer[k] : {}
  return {
    contact: { ...contact, ...own('contact') },
    identity: { ...identity, ...own('identity') },
    legal: { ...legal, ...own('legal') }
  }
}
