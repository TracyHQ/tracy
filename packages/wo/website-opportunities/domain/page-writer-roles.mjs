// Which text fields the page writer writes (ticket #594, ADR 0046). Every role of the Contract A catalogue (the role
// vocabulary `place-content-roles/3`) is classified here, once, by what a field of that declared kind holds:
//
//   data      the business's own value (a phone number, an address, a price, a person's or a service's name, a
//             review). Code copies it from the plan data (a fact's value, or an item's field value); the model never
//             writes it and only reads it as context.
//   copy      words written for the page (a heading, an intro, a description, a button label). The model writes it
//             from the data the page shows.
//   not-text  a picture, a video, a map, an icon, a design element or a link the site makes: never a text value.
//
// A role missing from this table is a defect of the table, not of a template: `test/domain-page-writer-roles.test.mjs`
// enumerates the whole catalogue and fails on any role that is not classified.

/** Roles whose text value is the business's own data, copied in code. */
export const DATA_ROLES = Object.freeze([
  'business.name',
  'business.category_label',
  'business.founded_year',
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.hours',
  'contact.social_url',
  'contact.cta_url',
  'offering.name',
  'offering.price',
  'offering.price_note',
  'offering.category',
  'offering.duration_or_unit',
  'offering.variant_meta',
  'offering.schedule',
  'offering.cta_url',
  'package.name',
  'package.price',
  'package.period',
  'package.features_list',
  'package.feature_item',
  'package.cta_url',
  'person.name',
  'person.role',
  'person.bio', // facts about a real person: never written by the model
  'person.initials',
  'person.social_url',
  'stat.value',
  'stat.label', // what a number counts belongs to the number
  'stat.unit',
  'stat.context',
  'step.index',
  'step.title',
  'quote.text',
  'quote.author_name',
  'quote.author_context',
  'quote.rating_or_source',
  'claim.award_or_cert',
  'claim.entity_name',
  'claim.entity_url',
  'claim.year_or_issuer',
  'claim.notice',
  'faq.question',
  'faq.answer',
  'event.date_or_year',
  'event.title',
  'post.author',
  'article.title',
  'article.lead',
  'article.date'
])

/** Roles whose text the model writes for the page. */
export const COPY_ROLES = Object.freeze([
  'business.tagline',
  'business.summary',
  'business.long_description',
  'business.copyright', // composed from the business name
  'contact.map_label',
  'contact.social_label',
  'contact.cta_label',
  'offering.description',
  'offering.cta_label',
  'package.summary',
  'package.badge',
  'package.cta_label',
  'step.description',
  'event.description',
  'claim.heading',
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.menu_label',
  'editorial.newsletter_label'
])

/** Roles that never hold a text value. */
export const NOT_TEXT_ROLES = Object.freeze([
  'business.logo',
  'business.hero_image',
  'business.gallery_image',
  'business.video',
  'contact.map',
  'offering.image',
  'person.image',
  'quote.author_image',
  'claim.entity_logo',
  'event.image',
  'stat.proof_image',
  'article.image',
  'editorial.illustration',
  'editorial.design_element',
  'editorial.item_icon',
  'editorial.navigation_url'
])

const ORIGIN = new Map([
  ...DATA_ROLES.map((role) => [role, 'data']),
  ...COPY_ROLES.map((role) => [role, 'copy']),
  ...NOT_TEXT_ROLES.map((role) => [role, 'not-text'])
])

/**
 * How a field of this declared kind is filled: `data`, `copy` or `not-text`; null for a kind this table does not know.
 * @param {unknown} kind a role of `place-content-roles/3`
 * @returns {'data' | 'copy' | 'not-text' | null}
 */
export const roleOrigin = (kind) => (typeof kind === 'string' ? (ORIGIN.get(kind) ?? null) : null)
