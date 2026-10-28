// Where each kind of item a brief holds goes on a site (#49, spec #38): one table, from the item kind to the place content
// roles (version 3, `place-content-roles.mjs`) that carry it, or to the reason it is not shown. A brief item with neither is
// a collected fact that disappears without trace; `routesOfBrief` lists those, and a test fails when a new kind has no row.
// Withheld facts are not silent either: `ownerQuestionsOf` turns each into a question for the owner, when the owner can
// answer it. A missing line the owner cannot answer (a source that failed, a field with no owner wording) is routed as
// not shown with its own reason (`missing.<field>`), never asked with a raw id.
import { PLACE_CONTENT_ROLES_V3 } from './place-content-roles.mjs'

const roles = (...list) => Object.freeze({ roles: Object.freeze(list) })
const notShown = (reason) => Object.freeze({ notShown: reason })

/**
 * Item kind -> `{ roles }` or `{ notShown }`. Keys: `section.<kind>` (a sitemap section), `content.<kind>` (a post-derived
 * content item), `fact.<field>` (a field of `facts`), `integration.<kind>`, and the loose items below.
 */
export const BRIEF_ITEM_ROUTES = Object.freeze({
  // Sitemap sections.
  'section.hero': roles('business.tagline', 'business.hero_image'),
  'section.highlights': roles('business.gallery_image'),
  'section.location': roles('contact.address', 'contact.map'),
  'section.dishes': roles('offering.name', 'offering.description', 'offering.image'),
  'section.menu': roles('offering.name', 'offering.price', 'offering.category', 'offering.description'),
  'section.services': roles('offering.name', 'offering.description'),
  'section.story': roles('business.long_description', 'business.summary'),
  'section.audience': roles('business.summary'),
  'section.team': roles('person.name', 'person.role', 'person.bio', 'person.image'),
  'section.offers': roles('event.title', 'event.description'),
  'section.events': roles('event.title', 'event.date_or_year', 'event.description', 'event.image'),
  'section.posts': roles('article.title', 'article.lead', 'article.image', 'article.date'),
  'section.gallery': roles('business.gallery_image'),
  'section.videos': roles('business.video'),
  'section.contact': roles('contact.phone', 'contact.email', 'contact.address', 'contact.cta_label'),
  'section.hours': roles('contact.hours'),
  // Content items made of the business's posts.
  'content.dish': roles('offering.name', 'offering.description', 'offering.image'),
  'content.story': roles('business.long_description'),
  'content.product': roles('offering.name', 'offering.description', 'offering.price', 'offering.image'),
  'content.event': roles('event.title', 'event.date_or_year', 'event.description', 'event.image'),
  'content.offer': roles('event.title', 'event.description'),
  'content.service': roles('offering.name', 'offering.description', 'offering.image'),
  'content.news': roles('article.title', 'article.lead', 'article.date'),
  // Loose items.
  'menu-item': roles('offering.name', 'offering.price', 'offering.category'),
  service: roles('offering.name', 'offering.description'),
  'team-member': roles('person.name', 'person.role'),
  'key-message': roles('business.tagline'),
  review: roles('quote.text', 'quote.author_name', 'quote.rating_or_source'),
  'held-review': notShown(
    'It names a person the brief holds off the site; a review is never quoted around a held name.'
  ),
  rating: roles('quote.rating_or_source'),
  'social-figure': roles('stat.value', 'stat.label'),
  'service-area': roles('business.summary'),
  'inferred-line': notShown(
    'Tracy concluded it, no source states it: it is carried as an instruction, never as copy.'
  ),
  // Fields of `facts`.
  'fact.name': roles('business.name'),
  'fact.branch': roles('business.name'),
  'fact.address': roles('contact.address'),
  'fact.phone': roles('contact.phone'),
  'fact.email': roles('contact.email'),
  'fact.hours': roles('contact.hours'),
  'fact.serviceAreas': roles('business.summary'),
  'fact.services': roles('offering.name'),
  'fact.menu': roles('offering.name', 'offering.price'),
  'fact.team': roles('person.name', 'person.role'),
  'fact.audience': roles('business.summary'),
  'fact.story': roles('business.long_description'),
  'fact.googleRating': roles('quote.rating_or_source'),
  'fact.rating': roles('quote.rating_or_source'),
  'fact.socialFigures': roles('stat.value', 'stat.label'),
  'fact.whatsapp': roles('contact.phone'),
  'fact.website': roles('contact.cta_url'),
  'fact.booking': roles('contact.cta_url', 'contact.cta_label'),
  'fact.menuLink': roles('contact.cta_url'),
  'fact.socials': roles('contact.social_url'),
  'fact.contactChannels': roles('contact.cta_label', 'contact.cta_url'),
  'fact.otherPhones': roles('contact.phone'),
  // Integrations.
  'integration.booking': roles('contact.cta_url', 'contact.cta_label'),
  'integration.map': roles('contact.map'),
  'integration.social': roles('contact.social_url'),
  'integration.chat': roles('contact.cta_url')
})

/** The routing table's own faults: a row with neither a role nor a reason, or with a role outside vocabulary 3. */
export function routeTableErrors(table = BRIEF_ITEM_ROUTES) {
  const known = new Set(PLACE_CONTENT_ROLES_V3)
  const errors = []
  for (const [kind, route] of Object.entries(table)) {
    const hasRoles = Array.isArray(route?.roles) && route.roles.length > 0
    const hasReason = typeof route?.notShown === 'string' && route.notShown.trim() !== ''
    if (hasRoles === hasReason) errors.push(`${kind}: needs roles or a notShown reason, not both or neither`)
    for (const r of route?.roles ?? []) if (!known.has(r)) errors.push(`${kind}: ${r} is not a v3 role`)
  }
  return errors
}

const list = (v) => (Array.isArray(v) ? v : [])

/** Every item kind a brief holds, each with how many items. */
export function itemKindsOfBrief(brief) {
  const counts = new Map()
  const add = (kind, n = 1) => n > 0 && counts.set(kind, (counts.get(kind) ?? 0) + n)
  for (const page of list(brief?.sitemap)) {
    for (const s of list(page.sections)) {
      add(`section.${s.kind}`)
      add('menu-item', list(s.menuItems).length)
      add('service', list(s.services).length)
      add('inferred-line', list(s.inferred).length)
    }
  }
  for (const item of list(brief?.content?.items)) for (const k of list(item.kinds)) add(`content.${k}`)
  for (const f of list(brief?.facts))
    add(`fact.${f.field === 'menu' && f.value?.kind === 'menu' ? 'menuLink' : f.field}`)
  for (const i of list(brief?.integrations)) add(`integration.${i.kind}`)
  add('team-member', list(brief?.reading?.team).length)
  add('key-message', list(brief?.keyMessages).length)
  add('service-area', list(brief?.business?.serviceAreas).length)
  add('review', list(brief?.googlePlace?.reviews).length)
  add('held-review', list(brief?.googlePlace?.heldReviews).length)
  if (Number.isFinite(brief?.googlePlace?.rating)) add('rating')
  return counts
}

/**
 * The brief's items by route: `routed` (kind, count, roles) and `shownNever` (kind, count, reason) are accounted for;
 * `unrouted` is every kind with no row, which must stay empty.
 */
export function routesOfBrief(brief, table = BRIEF_ITEM_ROUTES) {
  const out = { routed: [], notShown: [], unrouted: [] }
  for (const [kind, count] of itemKindsOfBrief(brief)) {
    const route = table[kind]
    if (route?.roles?.length) out.routed.push({ kind, count, roles: route.roles })
    else if (route?.notShown) out.notShown.push({ kind, count, reason: route.notShown })
    else out.unrouted.push({ kind, count })
  }
  for (const m of unaskedMissingOf(brief))
    out.notShown.push({ kind: `missing.${m.field}`, count: 1, reason: m.why })
  return out
}

// What to ask the owner for each field a brief lists as missing or withholds. A field not listed here is not asked.
const ASK = {
  prices:
    'What do your items or services cost? Prices were not published, so none will show until you tell us.',
  menu: 'Can you send your menu or a link to it? None was found.',
  'menu-link': 'Is there a full menu we can link to? Only the dishes you posted were found.',
  offerings: 'Which services or offerings do you want on the site? None were found.',
  hours: 'What are your opening hours? They are missing, withheld or disagree between sources.',
  phone: 'What phone number should customers call? None was found.',
  address: 'What is your street address? None was found.',
  booking: 'How should customers book with you? No verified booking link was found.',
  'about.story': 'How would you describe your business in a few sentences? No description was found.',
  images: 'Can you send photos of your business? None were collected.',
  name: 'Which business name should the site use? The sources disagree or it was held back.',
  team: 'Which team members should the site show? People named only in reviews are held back until you confirm them.',
  googleRating: 'Do you want your Google rating shown on the site? It was left off.'
}

/**
 * Missing lines the owner is not asked about: a failed or blocked source (`source:<id>`, a research problem to retry or
 * skip) and any field with no owner wording in `ASK`. Each: `{ field, why }`, one per field.
 */
export function unaskedMissingOf(brief) {
  const seen = new Set()
  const out = []
  for (const m of list(brief?.missing)) {
    if (Object.hasOwn(ASK, m.field) || seen.has(m.field)) continue
    seen.add(m.field)
    out.push({ field: m.field, why: m.why })
  }
  return out
}

/** Menu entries printed without a price (priced offerings the owner did not publish). */
const unpricedNames = (brief) =>
  list(brief?.sitemap)
    .flatMap((p) => list(p.sections))
    .flatMap((s) => list(s.menuItems))
    .filter((i) => i?.price == null || String(i.price).trim() === '')
    .map((i) => i.name)

/**
 * The owner questions a brief's withheld and missing facts make, so none ends as a silent gap. One per missing field,
 * plus one for the menu entries that carry no price. Each: `{ id, field, question, items? }`.
 */
export function ownerQuestionsOf(brief) {
  const questions = []
  const seen = new Set()
  for (const m of list(brief?.missing)) {
    if (seen.has(m.field) || !Object.hasOwn(ASK, m.field)) continue
    seen.add(m.field)
    questions.push({ id: `owner.${m.field}`, field: m.field, question: ASK[m.field] })
  }
  const unpriced = unpricedNames(brief)
  if (unpriced.length && !seen.has('prices')) {
    questions.push({
      id: 'owner.prices',
      field: 'prices',
      question: ASK.prices,
      items: unpriced
    })
  }
  return questions
}
