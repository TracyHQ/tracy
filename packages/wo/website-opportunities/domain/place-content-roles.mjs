// Slot role vocabulary (`place-content-roles/2` and `place-content-roles/3`) and validator for quickstart
// `slot-roles.json` (`tracy-quickstart-slot-roles/v1`) sidecars. Every role string any side may write lives in this
// file: a role is added or changed here, in one reviewed place, never invented by a capture, a rule table or a brief.
//
// Version 2 (ADR 0038) adds the editorial roles (a slot that holds page copy, not a fact about the business) next to the
// fact roles of version 1, a default rule per role for a slot no fact fills, the binding mode each role is written in,
// and the group kinds a card may hold. Roles live on the slots of a content map from version 2 on
// (`content-map-roles.mjs` documents the slot fields); the three sidecars bound against version 1 stay readable.
//
// Version 3 (ADR 0040) adds the roles the readiness research found missing, splits `editorial.decorative_image` into a
// replaceable illustration and a kept design element, adds the sample article roles, and makes the role the only
// decider of whether a slot keeps the demo's content (`KEEP_DECISION_BY_ROLE`). Version 2 stays the version capture
// writes (`ROLE_VOCABULARY_VERSION`) until capture moves to version 3; both validate.

import { createHash } from 'node:crypto'

export const SLOT_ROLES_SCHEMA_VERSION = 'tracy-quickstart-slot-roles/v1'
export const ROLE_VOCABULARY_VERSION = 'place-content-roles/2'
/** The vocabulary in which the role alone decides keep or replace (ADR 0040). */
export const ROLE_VOCABULARY_V3 = 'place-content-roles/3'
/** Every vocabulary version a sidecar may name: version 1 sidecars stay valid until their template's next release. */
export const ROLE_VOCABULARY_VERSIONS = Object.freeze([
  'place-content-roles/1',
  ROLE_VOCABULARY_VERSION,
  ROLE_VOCABULARY_V3
])
/** Every vocabulary version a content map may name (maps carry roles from version 2 on). */
export const CONTENT_MAP_ROLE_VOCABULARY_VERSIONS = Object.freeze([
  ROLE_VOCABULARY_VERSION,
  ROLE_VOCABULARY_V3
])

export const BASE_FILES = Object.freeze(['manifest.json', 'content-map.json', 'presentation-lock.json'])

export const EMDASH_BASE_FILES = Object.freeze([
  'seed/seed.json',
  'seed/personalize.json',
  'seed/field-map.json'
])

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Recomputes a contract sidecar's `baseHash` over its ordered base file map.
export const baseHashOf = (baseFiles, names) => {
  const hasOwn = (name) =>
    Boolean(
      baseFiles && typeof baseFiles === 'object' && Object.prototype.hasOwnProperty.call(baseFiles, name)
    )
  const keys = Array.isArray(names) ? names : EMDASH_BASE_FILES.some(hasOwn) ? EMDASH_BASE_FILES : BASE_FILES
  return sha256(keys.map((name) => `${name}:${baseFiles?.[name]}\n`).join(''))
}

// Fact roles: the slot holds a fact about the business, filled from the place profile or left to its rule for no fact.
export const FACT_ROLES = Object.freeze([
  // business.* — identity & positioning
  'business.name',
  'business.tagline',
  'business.summary',
  'business.long_description',
  'business.category_label',
  'business.founded_year',
  'business.logo',
  'business.hero_image',

  // contact.* — direct contact & hours
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.hours',
  'contact.map_label',
  'contact.social_label',
  'contact.social_url',
  'contact.cta_label',
  'contact.cta_url',

  // offering.* — menu item, dish, service, room, course, product, process step
  'offering.name',
  'offering.description',
  'offering.summary',
  'offering.price',
  'offering.price_note',
  'offering.category',
  'offering.image',
  'offering.duration_or_unit',
  'offering.variant_meta',
  'offering.cta_label',
  'offering.cta_url',

  // package.* — pricing tier, plan, membership
  'package.name',
  'package.summary',
  'package.price',
  'package.period',
  'package.features_list',
  'package.feature_item',
  'package.badge',
  'package.cta_label',
  'package.cta_url',

  // person.* — team member, chef, instructor, doctor, founder
  'person.name',
  'person.role',
  'person.bio',
  'person.image',
  'person.initials',
  'person.social_url',

  // stat.* — verified numerical metric
  'stat.value',
  'stat.label',
  'stat.unit',
  'stat.context',

  // step.* — process or workflow step
  'step.index',
  'step.title',
  'step.description',

  // quote.* — customer review, press quote
  'quote.text',
  'quote.author_name',
  'quote.author_context',
  'quote.author_image',
  'quote.rating_or_source',

  // claim.* — certification, award, partner/client mark, notice
  'claim.award_or_cert',
  'claim.entity_name',
  'claim.entity_logo',
  'claim.entity_url',
  'claim.year_or_issuer',
  'claim.notice',

  // faq.* — customer Q&A
  'faq.question',
  'faq.answer',

  // event.* — history milestone, promo/happy hour
  'event.date_or_year',
  'event.title',
  'event.description',
  'event.image',

  // post.* — a sample article's own metadata; never one of the business's people
  'post.author'
])

// Editorial roles: the slot holds page copy or a picture that states no fact (a section heading, a paragraph, a button
// or menu label, a decorative picture). No fact ever fills one, so a demo never takes a fact from it.
export const EDITORIAL_ROLES = Object.freeze([
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.menu_label',
  'editorial.decorative_image'
])

/** The whole vocabulary of version 2: every role a slot may carry in a `place-content-roles/2` map. */
export const PLACE_CONTENT_ROLES = Object.freeze([...FACT_ROLES, ...EDITORIAL_ROLES])

// Version 3 additions (ADR 0040). Each is a fact about the business: filled from the place profile, never kept as demo.
export const FACT_ROLES_ADDED_IN_V3 = Object.freeze([
  'business.gallery_image', // a picture of a gallery: the business's own photos
  'business.video', // a video of the business (its file or its link)
  'business.copyright', // the copyright line: it names the business and a year
  'contact.map', // a map of the business's address (an embed or its picture)
  'offering.schedule', // when an offering runs: a class timetable entry, a session time
  'stat.proof_image', // a face or picture that proves a number ("5k happy members" with a strip of faces)
  'claim.heading' // a heading that states a claim ("No1 boxing club since 2008"): rewritten from facts or without it
])

/** The fact roles of version 3: version 2's plus the additions. */
export const FACT_ROLES_V3 = Object.freeze([...FACT_ROLES, ...FACT_ROLES_ADDED_IN_V3])

// Sample article roles (version 3): a demo blog post's own content. Not a fact about the business, but never kept: the
// business's own posts replace the demo's, labelled once on the article template.
export const ARTICLE_ROLES = Object.freeze(['article.title', 'article.lead', 'article.image', 'article.date'])

// Editorial roles of version 3: version 2's, with `editorial.decorative_image` split in two, and three new ones.
export const EDITORIAL_ROLES_V3 = Object.freeze([
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.menu_label',
  'editorial.illustration', // a picture that illustrates the copy: a build may put the business's own photo there
  'editorial.design_element', // a shape, pattern, texture or ornament of the design: the template's stays
  'editorial.item_icon', // the icon of a card or list item: the template's stays
  'editorial.newsletter_label', // the words of a newsletter sign-up (heading, field hint, button)
  'editorial.navigation_url' // a link to a page of the site itself (a menu entry, a "read more")
])

/** The whole vocabulary of version 3: every role a slot may carry in a `place-content-roles/3` map. */
export const PLACE_CONTENT_ROLES_V3 = Object.freeze([
  ...FACT_ROLES_V3,
  ...ARTICLE_ROLES,
  ...EDITORIAL_ROLES_V3
])

const ROLES_BY_VERSION = Object.freeze({
  'place-content-roles/1': new Set(PLACE_CONTENT_ROLES),
  [ROLE_VOCABULARY_VERSION]: new Set(PLACE_CONTENT_ROLES),
  [ROLE_VOCABULARY_V3]: new Set(PLACE_CONTENT_ROLES_V3)
})
const FACT_ROLE_SET = new Set(FACT_ROLES_V3)
const EDITORIAL_ROLE_SET = new Set([...EDITORIAL_ROLES, ...EDITORIAL_ROLES_V3])

/**
 * What happens to the demo's content in a slot of each role (ADR 0040), the only decider of keep or replace:
 *   replace  the demo never stays: the business's fact (or its own post) fills it, else the role's neutral rule
 *   rewrite  page copy or an illustration: a build may write the business's own words or photo over it
 *   keep     the template's own stays: Customize never plans or writes it
 * Slot fit (`fit.replace`) and `customize` follow from it in a version 3 map (`content-map-keep-decision.mjs`).
 */
export const KEEP_DECISIONS = Object.freeze(['replace', 'rewrite', 'keep'])
export const KEEP_DECISION_BY_ROLE = Object.freeze({
  ...Object.fromEntries(FACT_ROLES_V3.map((role) => [role, 'replace'])),
  ...Object.fromEntries(ARTICLE_ROLES.map((role) => [role, 'replace'])),
  'editorial.heading': 'rewrite',
  'editorial.paragraph': 'rewrite',
  'editorial.button_label': 'rewrite',
  'editorial.menu_label': 'rewrite',
  'editorial.newsletter_label': 'rewrite',
  'editorial.illustration': 'rewrite',
  'editorial.design_element': 'keep',
  'editorial.item_icon': 'keep',
  'editorial.navigation_url': 'keep',
  // Version 2 only: read as its version 3 successor would be judged when kept (`design_element`).
  'editorial.decorative_image': 'keep'
})

/** Roles whose picture only the business's own logo replaces (Slot fit `replace: "logo"`). */
export const LOGO_ROLES = Object.freeze(['business.logo', 'claim.entity_logo'])
const BINDING_MODES = new Set(['copy', 'format', 'asset', 'verbatim', 'compose'])
const NEUTRAL_POLICIES_WITHOUT_KEY = new Set(['empty', 'index_padded', 'keep'])
const ALLOWED_REQUIRES = new Set(['contact-target', 'phone'])

const freezeRule = (rule) => {
  if (rule.keysByKind) {
    Object.freeze(rule.keysByKind)
  }
  return Object.freeze(rule)
}

export const DEFAULT_NEUTRAL_BY_ROLE = Object.freeze({
  'business.name': freezeRule({ policy: 'empty' }),
  'business.tagline': freezeRule({ policy: 'empty' }),
  'business.summary': freezeRule({ policy: 'empty' }),
  'business.long_description': freezeRule({ policy: 'empty' }),
  'business.category_label': freezeRule({ policy: 'empty' }),
  'business.founded_year': freezeRule({ policy: 'empty' }),
  'business.logo': freezeRule({ policy: 'empty' }),
  'business.hero_image': freezeRule({ policy: 'empty' }),
  'contact.phone': freezeRule({ policy: 'empty' }),
  'contact.email': freezeRule({ policy: 'empty' }),
  'contact.address': freezeRule({ policy: 'empty' }),
  'contact.hours': freezeRule({ policy: 'empty' }),
  'contact.map_label': freezeRule({ policy: 'empty' }),
  'contact.social_label': freezeRule({ policy: 'empty' }),
  'contact.social_url': freezeRule({ policy: 'empty' }),
  'contact.cta_label': freezeRule({
    policy: 'neutral_key',
    key: 'neutral.cta.contact',
    requires: 'contact-target'
  }),
  'contact.cta_url': freezeRule({ policy: 'empty' }),
  'offering.name': freezeRule({
    policy: 'neutral_by_kind',
    keysByKind: {
      dish: 'neutral.offering.menu_item',
      drink: 'neutral.offering.menu_item',
      menu_item: 'neutral.offering.menu_item',
      service: 'neutral.offering.service',
      product: 'neutral.offering.product'
    }
  }),
  'offering.description': freezeRule({ policy: 'empty' }),
  'offering.summary': freezeRule({ policy: 'empty' }),
  'offering.price': freezeRule({ policy: 'empty' }),
  'offering.price_note': freezeRule({ policy: 'empty' }),
  'offering.category': freezeRule({ policy: 'empty' }),
  'offering.image': freezeRule({ policy: 'empty' }),
  'offering.duration_or_unit': freezeRule({ policy: 'empty' }),
  'offering.variant_meta': freezeRule({ policy: 'empty' }),
  'offering.cta_label': freezeRule({
    policy: 'neutral_key',
    key: 'neutral.cta.contact',
    requires: 'contact-target'
  }),
  'offering.cta_url': freezeRule({ policy: 'empty' }),
  'package.name': freezeRule({ policy: 'empty' }),
  'package.summary': freezeRule({ policy: 'empty' }),
  'package.price': freezeRule({ policy: 'empty' }),
  'package.period': freezeRule({ policy: 'empty' }),
  'package.features_list': freezeRule({ policy: 'empty' }),
  'package.feature_item': freezeRule({ policy: 'empty' }),
  'package.badge': freezeRule({ policy: 'empty' }),
  'package.cta_label': freezeRule({
    policy: 'neutral_key',
    key: 'neutral.cta.contact',
    requires: 'contact-target'
  }),
  'package.cta_url': freezeRule({ policy: 'empty' }),
  'person.name': freezeRule({ policy: 'empty' }),
  'person.role': freezeRule({ policy: 'empty' }),
  'person.bio': freezeRule({ policy: 'empty' }),
  'person.image': freezeRule({ policy: 'empty' }),
  'person.initials': freezeRule({ policy: 'empty' }),
  'person.social_url': freezeRule({ policy: 'empty' }),
  'stat.value': freezeRule({ policy: 'neutral_key', key: 'neutral.stat.dash' }),
  'stat.label': freezeRule({ policy: 'empty' }),
  'stat.unit': freezeRule({ policy: 'empty' }),
  'stat.context': freezeRule({ policy: 'empty' }),
  'step.index': freezeRule({ policy: 'index_padded' }),
  'step.title': freezeRule({ policy: 'neutral_key', key: 'neutral.step.title' }),
  'step.description': freezeRule({ policy: 'empty' }),
  'quote.text': freezeRule({ policy: 'empty' }),
  'quote.author_name': freezeRule({ policy: 'empty' }),
  'quote.author_context': freezeRule({ policy: 'empty' }),
  'quote.author_image': freezeRule({ policy: 'empty' }),
  'quote.rating_or_source': freezeRule({ policy: 'empty' }),
  'claim.award_or_cert': freezeRule({ policy: 'empty' }),
  'claim.entity_name': freezeRule({ policy: 'empty' }),
  'claim.entity_logo': freezeRule({ policy: 'empty' }),
  'claim.entity_url': freezeRule({ policy: 'empty' }),
  'claim.year_or_issuer': freezeRule({ policy: 'empty' }),
  'claim.notice': freezeRule({ policy: 'empty' }),
  'faq.question': freezeRule({ policy: 'empty' }),
  'faq.answer': freezeRule({ policy: 'empty' }),
  'event.date_or_year': freezeRule({ policy: 'empty' }),
  'event.title': freezeRule({ policy: 'empty' }),
  'event.description': freezeRule({ policy: 'empty' }),
  'event.image': freezeRule({ policy: 'empty' }),
  'post.author': freezeRule({ policy: 'empty' }),
  // Version 3 fact and article roles: nothing is invented, the slot empties (a build's neutral substitute keeps the
  // layout, ADR 0037).
  'business.gallery_image': freezeRule({ policy: 'empty' }),
  'business.video': freezeRule({ policy: 'empty' }),
  'business.copyright': freezeRule({ policy: 'empty' }),
  'contact.map': freezeRule({ policy: 'empty' }),
  'offering.schedule': freezeRule({ policy: 'empty' }),
  'stat.proof_image': freezeRule({ policy: 'empty' }),
  'claim.heading': freezeRule({ policy: 'empty' }),
  'article.title': freezeRule({ policy: 'empty' }),
  'article.lead': freezeRule({ policy: 'empty' }),
  'article.image': freezeRule({ policy: 'empty' }),
  'article.date': freezeRule({ policy: 'empty' }),
  // `keep`: no fact fills the slot; the template's own words or picture stay unless page copy is written over them.
  'editorial.heading': freezeRule({ policy: 'keep' }),
  'editorial.paragraph': freezeRule({ policy: 'keep' }),
  'editorial.button_label': freezeRule({ policy: 'keep' }),
  'editorial.menu_label': freezeRule({ policy: 'keep' }),
  'editorial.decorative_image': freezeRule({ policy: 'keep' }),
  'editorial.illustration': freezeRule({ policy: 'keep' }),
  'editorial.design_element': freezeRule({ policy: 'keep' }),
  'editorial.item_icon': freezeRule({ policy: 'keep' }),
  'editorial.newsletter_label': freezeRule({ policy: 'keep' }),
  'editorial.navigation_url': freezeRule({ policy: 'keep' })
})

/**
 * How a fact role's value is written into its slot: `format` (a price, a step number), `asset` (a picture), `verbatim`
 * (a name, an email, a number), otherwise `copy`.
 * @param {string} role
 */
export function modeOfRole(role) {
  if (role.endsWith('.price') || role === 'step.index') return 'format'
  if (
    role.endsWith('.image') ||
    role.endsWith('.logo') ||
    role.endsWith('_image') ||
    role.endsWith('_logo') ||
    role === 'business.video'
  )
    return 'asset'
  if (
    role === 'business.name' ||
    role === 'contact.phone' ||
    role === 'contact.email' ||
    role === 'contact.address' ||
    role === 'contact.hours' ||
    role === 'stat.value' ||
    role === 'event.date_or_year'
  ) {
    return 'verbatim'
  }
  return 'copy'
}

/**
 * The kinds of entity a card (a group of slots) may hold, each with the kinds it may borrow an entity from when the
 * place has none of its own (`allowedKinds`, first = its own) and the roles a card of that kind cannot go without.
 */
export const GROUP_KINDS = Object.freeze({
  business: Object.freeze({ allowedKinds: ['business'], requiredRoles: [] }),
  contact: Object.freeze({ allowedKinds: ['contact'], requiredRoles: [] }),
  menu_item: Object.freeze({
    allowedKinds: ['menu_item', 'service', 'package'],
    requiredRoles: ['offering.name']
  }),
  service: Object.freeze({
    allowedKinds: ['service', 'menu_item', 'package'],
    requiredRoles: ['offering.name']
  }),
  package: Object.freeze({
    allowedKinds: ['package', 'service', 'menu_item'],
    requiredRoles: ['package.name']
  }),
  person: Object.freeze({ allowedKinds: ['person'], requiredRoles: ['person.name'] }),
  stat_item: Object.freeze({ allowedKinds: ['stat_item'], requiredRoles: ['stat.value'] }),
  step: Object.freeze({ allowedKinds: ['step'], requiredRoles: ['step.title'] }),
  quote: Object.freeze({ allowedKinds: ['quote'], requiredRoles: ['quote.text'] }),
  claim: Object.freeze({ allowedKinds: ['claim'], requiredRoles: [] }),
  faq: Object.freeze({ allowedKinds: ['faq'], requiredRoles: ['faq.question', 'faq.answer'] }),
  event: Object.freeze({ allowedKinds: ['event'], requiredRoles: ['event.title'] }),
  post: Object.freeze({ allowedKinds: ['post'], requiredRoles: [] })
})

/** The group kinds of version 3: version 2's plus `gallery`, one picture of a gallery (usually a repeatable list). */
export const GROUP_KINDS_V3 = Object.freeze({
  ...GROUP_KINDS,
  gallery: Object.freeze({ allowedKinds: ['gallery'], requiredRoles: ['business.gallery_image'] })
})

/** Whether `kind` is a group kind of the vocabulary `version` (default: the version capture writes). */
export function isGroupKind(kind, version = ROLE_VOCABULARY_VERSION) {
  const kinds = version === ROLE_VOCABULARY_V3 ? GROUP_KINDS_V3 : GROUP_KINDS
  return typeof kind === 'string' && Object.hasOwn(kinds, kind)
}

/**
 * Whether `value` is a role of the vocabulary `version` (default: the version capture writes, version 2). A string no
 * version lists is never a role: no side invents one.
 * @param {unknown} value
 * @param {string} [version]
 */
export function isRole(value, version = ROLE_VOCABULARY_VERSION) {
  const roles = Object.hasOwn(ROLES_BY_VERSION, version) ? ROLES_BY_VERSION[version] : null
  return typeof value === 'string' && Boolean(roles?.has(value))
}

/** Whether `value` is a fact role of any version (a role is a fact in every version that lists it). */
export function isFactRole(value) {
  return typeof value === 'string' && FACT_ROLE_SET.has(value)
}

/** Whether `value` is an editorial role of the vocabulary `version` (default: version 2). */
export function isEditorialRole(value, version = ROLE_VOCABULARY_VERSION) {
  return isRole(value, version) && EDITORIAL_ROLE_SET.has(value)
}

/**
 * The keep decision of a role (`KEEP_DECISIONS`), or null for a string that is not a role of any version.
 * @param {unknown} role
 * @returns {'replace' | 'rewrite' | 'keep' | null}
 */
export function keepDecisionOfRole(role) {
  return typeof role === 'string' && Object.hasOwn(KEEP_DECISION_BY_ROLE, role)
    ? /** @type {any} */ (KEEP_DECISION_BY_ROLE[role])
    : null
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validateSlotRoles(doc, { slotKeys } = {}) {
  const errors = []
  if (!isPlainObject(doc)) {
    return { ok: false, errors: ['document must be a plain object'] }
  }

  if (doc.schemaVersion !== SLOT_ROLES_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be "${SLOT_ROLES_SCHEMA_VERSION}", got ${JSON.stringify(doc.schemaVersion)}`
    )
  }

  if (
    doc.roleVocabularyVersion !== undefined &&
    !ROLE_VOCABULARY_VERSIONS.includes(doc.roleVocabularyVersion)
  ) {
    errors.push(
      `roleVocabularyVersion must be one of ${ROLE_VOCABULARY_VERSIONS.map((v) => `"${v}"`).join(', ')}, got ${JSON.stringify(doc.roleVocabularyVersion)}`
    )
  }

  if (doc.status !== undefined && doc.status !== 'draft' && doc.status !== 'checked') {
    errors.push(`status must be "draft" or "checked", got ${JSON.stringify(doc.status)}`)
  }

  // Roles are judged against the version the sidecar names (version 2 when it names none or an unknown one).
  const sidecarVersion = ROLE_VOCABULARY_VERSIONS.includes(doc.roleVocabularyVersion)
    ? doc.roleVocabularyVersion
    : ROLE_VOCABULARY_VERSION
  const groupIds = new Set()
  if (!Array.isArray(doc.groups)) {
    errors.push('groups must be an array')
  } else {
    doc.groups.forEach((group, idx) => {
      if (!isPlainObject(group)) {
        errors.push(`groups[${idx}] must be an object`)
        return
      }
      const groupId =
        typeof group.groupId === 'string' && group.groupId.trim()
          ? group.groupId.trim()
          : typeof group.id === 'string' && group.id.trim()
            ? group.id.trim()
            : ''
      if (!groupId) {
        errors.push(`groups[${idx}] is missing a non-empty groupId`)
        return
      }
      if (typeof group.id === 'string' && typeof group.groupId === 'string' && group.id !== group.groupId) {
        errors.push(`groups[${idx}] has mismatched id "${group.id}" and groupId "${group.groupId}"`)
      }
      if (groupIds.has(groupId)) {
        errors.push(`duplicate groupId "${groupId}" in groups`)
      }
      groupIds.add(groupId)

      if (group.requiredRoles !== undefined) {
        if (!Array.isArray(group.requiredRoles)) {
          errors.push(`groups[${idx}] (${groupId}) requiredRoles must be an array`)
        } else {
          for (const role of group.requiredRoles) {
            if (!isRole(role, sidecarVersion)) {
              errors.push(`groups[${idx}] (${groupId}) has unknown requiredRole "${String(role)}"`)
            }
          }
        }
      }

      if (group.neutral !== undefined) {
        if (!isPlainObject(group.neutral)) {
          errors.push(`groups[${idx}] (${groupId}) neutral must be an object`)
        } else {
          for (const [role, rule] of Object.entries(group.neutral)) {
            if (!isRole(role, sidecarVersion)) {
              errors.push(`groups[${idx}] (${groupId}) neutral has unknown role "${role}"`)
            }
            if (!isPlainObject(rule)) {
              errors.push(`groups[${idx}] (${groupId}) neutral["${role}"] must be an object with policy`)
              continue
            }
            if (rule.requires !== undefined && !ALLOWED_REQUIRES.has(rule.requires)) {
              errors.push(
                `groups[${idx}] (${groupId}) neutral["${role}"] has invalid requires ${JSON.stringify(rule.requires)}`
              )
            }
            if (NEUTRAL_POLICIES_WITHOUT_KEY.has(rule.policy)) {
              continue
            }
            if (rule.policy === 'neutral_key') {
              if (typeof rule.key !== 'string' || !rule.key.trim()) {
                errors.push(
                  `groups[${idx}] (${groupId}) neutral["${role}"] with policy "neutral_key" requires a non-empty key`
                )
              }
              continue
            }
            if (rule.policy === 'neutral_by_kind') {
              if (!isPlainObject(rule.keysByKind) || Object.keys(rule.keysByKind).length === 0) {
                errors.push(
                  `groups[${idx}] (${groupId}) neutral["${role}"] with policy "neutral_by_kind" requires a non-empty keysByKind map`
                )
              } else {
                for (const [kind, key] of Object.entries(rule.keysByKind)) {
                  if (typeof kind !== 'string' || !kind.trim()) {
                    errors.push(
                      `groups[${idx}] (${groupId}) neutral["${role}"].keysByKind has an empty kind key`
                    )
                  }
                  if (typeof key !== 'string' || !key.trim()) {
                    errors.push(
                      `groups[${idx}] (${groupId}) neutral["${role}"].keysByKind["${kind}"] requires a non-empty key`
                    )
                  }
                }
              }
              continue
            }
            errors.push(
              `groups[${idx}] (${groupId}) neutral["${role}"] has invalid policy ${JSON.stringify(rule.policy)}`
            )
          }
        }
      }
    })
  }

  const slotKeySet =
    slotKeys !== undefined && slotKeys !== null ? new Set(Array.from(slotKeys, String)) : null
  const boundSlots = new Set()

  if (!Array.isArray(doc.bindings)) {
    errors.push('bindings must be an array')
  } else {
    doc.bindings.forEach((binding, idx) => {
      if (!isPlainObject(binding)) {
        errors.push(`bindings[${idx}] must be an object`)
        return
      }
      const { slotKey, groupId, role, mode } = binding
      if (typeof slotKey !== 'string' || !slotKey.trim()) {
        errors.push(`bindings[${idx}] is missing a non-empty slotKey`)
      } else {
        if (boundSlots.has(slotKey)) {
          errors.push(`slotKey "${slotKey}" is bound more than once`)
        }
        boundSlots.add(slotKey)
        if (slotKeySet && !slotKeySet.has(slotKey)) {
          errors.push(`slotKey "${slotKey}" does not exist in contract slotKeys`)
        }
      }

      if (typeof groupId !== 'string' || !groupId.trim()) {
        errors.push(`bindings[${idx}] (${String(slotKey)}) is missing a non-empty groupId`)
      } else if (!groupIds.has(groupId)) {
        errors.push(`bindings[${idx}] (${String(slotKey)}) references unknown groupId "${groupId}"`)
      }

      if (!isRole(role, sidecarVersion)) {
        errors.push(`bindings[${idx}] (${String(slotKey)}) has unknown role "${String(role)}"`)
      }

      if (mode !== undefined && !BINDING_MODES.has(mode)) {
        errors.push(`bindings[${idx}] (${String(slotKey)}) has unknown mode ${JSON.stringify(mode)}`)
      }
    })
  }

  if (doc.unplaced !== undefined) {
    if (!Array.isArray(doc.unplaced)) {
      errors.push('unplaced must be an array when present')
    } else {
      doc.unplaced.forEach((entry, idx) => {
        const slotKey = typeof entry === 'string' ? entry : entry?.slotKey
        if (typeof slotKey !== 'string' || !slotKey.trim()) {
          errors.push(`unplaced[${idx}] is missing a non-empty slotKey`)
          return
        }
        if (boundSlots.has(slotKey)) {
          errors.push(`slotKey "${slotKey}" appears in both bindings and unplaced`)
        }
        if (slotKeySet && !slotKeySet.has(slotKey)) {
          errors.push(`unplaced slotKey "${slotKey}" does not exist in contract slotKeys`)
        }
      })
    }
  }

  return { ok: errors.length === 0, errors }
}
