// Slot role vocabulary (`place-content-roles/2`) and validator for quickstart `slot-roles.json`
// (`tracy-quickstart-slot-roles/v1`) sidecars.
//
// Version 2 (ADR 0038) adds the editorial roles (a slot that holds page copy, not a fact about the business) next to the
// fact roles of version 1, a default rule per role for a slot no fact fills, the binding mode each role is written in,
// and the group kinds a card may hold. Roles live on the slots of a content map from version 2 on
// (`content-map-roles.mjs` documents the slot fields); the three sidecars bound against version 1 stay readable.

import { createHash } from 'node:crypto'

export const SLOT_ROLES_SCHEMA_VERSION = 'tracy-quickstart-slot-roles/v1'
export const ROLE_VOCABULARY_VERSION = 'place-content-roles/2'
/** Every vocabulary version a sidecar may name: version 1 sidecars stay valid until their template's next release. */
export const ROLE_VOCABULARY_VERSIONS = Object.freeze(['place-content-roles/1', ROLE_VOCABULARY_VERSION])

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

/** The whole vocabulary: every role a slot may carry. */
export const PLACE_CONTENT_ROLES = Object.freeze([...FACT_ROLES, ...EDITORIAL_ROLES])

const ROLE_SET = new Set(PLACE_CONTENT_ROLES)
const FACT_ROLE_SET = new Set(FACT_ROLES)
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
  // `keep`: no fact fills the slot; the template's own words or picture stay unless page copy is written over them.
  'editorial.heading': freezeRule({ policy: 'keep' }),
  'editorial.paragraph': freezeRule({ policy: 'keep' }),
  'editorial.button_label': freezeRule({ policy: 'keep' }),
  'editorial.menu_label': freezeRule({ policy: 'keep' }),
  'editorial.decorative_image': freezeRule({ policy: 'keep' })
})

/**
 * How a fact role's value is written into its slot: `format` (a price, a step number), `asset` (a picture), `verbatim`
 * (a name, an email, a number), otherwise `copy`.
 * @param {string} role
 */
export function modeOfRole(role) {
  if (role.endsWith('.price') || role === 'step.index') return 'format'
  if (role.endsWith('.image') || role.endsWith('.logo') || role.endsWith('_image') || role.endsWith('_logo'))
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

export function isRole(value) {
  return typeof value === 'string' && ROLE_SET.has(value)
}

export function isFactRole(value) {
  return typeof value === 'string' && FACT_ROLE_SET.has(value)
}

export function isEditorialRole(value) {
  return isRole(value) && !FACT_ROLE_SET.has(value)
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
            if (!isRole(role)) {
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
            if (!isRole(role)) {
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

      if (!isRole(role)) {
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
