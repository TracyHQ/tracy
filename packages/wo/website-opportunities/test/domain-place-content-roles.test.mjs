import assert from 'node:assert/strict'
import test from 'node:test'
import * as domain from '../domain/index.mjs'
import * as rolesModule from '../domain/place-content-roles.mjs'
import {
  DEFAULT_NEUTRAL_BY_ROLE,
  PLACE_CONTENT_ROLES,
  isFactRole,
  isRole,
  validateSlotRoles
} from '../domain/place-content-roles.mjs'

const FORBIDDEN_NEUTRAL_TEXTS = [
  'Coming soon',
  "Chef's selection",
  'Seasonal special',
  'House favourite',
  'Market price'
]

function makeValidDoc(overrides = {}) {
  return {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    roleVocabularyVersion: 'place-content-roles/1',
    contract: 'tracy-base/j6/1.0.5',
    cms: 'joomla',
    baseHash: 'a'.repeat(64),
    baseFiles: {
      'manifest.json': 'b'.repeat(64),
      'content-map.json': 'c'.repeat(64),
      'presentation-lock.json': 'd'.repeat(64)
    },
    status: 'checked',
    groups: [
      {
        id: 'module-183.tier.0',
        groupId: 'module-183.tier.0',
        entityKind: 'package',
        allowedKinds: ['package', 'service', 'menu_item'],
        itemIndex: 0,
        requiredRoles: ['package.name', 'package.price'],
        neutral: {
          'package.name': { policy: 'empty' },
          'package.summary': { policy: 'empty' },
          'package.price': { policy: 'empty' },
          'package.cta_label': {
            policy: 'neutral_key',
            key: 'neutral.cta.contact',
            requires: 'contact-target'
          }
        }
      }
    ],
    bindings: [
      {
        slotKey: 'module-183.3',
        groupId: 'module-183.tier.0',
        role: 'package.name',
        mode: 'copy'
      },
      {
        slotKey: 'module-183.6',
        groupId: 'module-183.tier.0',
        role: 'package.summary',
        mode: 'copy'
      },
      {
        slotKey: 'module-183.9',
        groupId: 'module-183.tier.0',
        role: 'package.price',
        mode: 'format'
      }
    ],
    unplaced: [],
    ...overrides
  }
}

test('place-content-roles vocabulary is frozen, re-exported from domain/index.mjs, and recognizes roles across all families including step.*', () => {
  assert.equal(domain.isRole, isRole)
  assert.equal(domain.validateSlotRoles, validateSlotRoles)
  assert.equal(domain.DEFAULT_NEUTRAL_BY_ROLE, DEFAULT_NEUTRAL_BY_ROLE)
  assert.equal(Object.isFrozen(PLACE_CONTENT_ROLES), true)
  assert.ok(PLACE_CONTENT_ROLES.length >= 40)

  for (const known of [
    'business.name',
    'business.tagline',
    'contact.phone',
    'contact.email',
    'contact.address',
    'contact.hours',
    'contact.cta_label',
    'offering.name',
    'offering.description',
    'offering.price',
    'offering.image',
    'offering.cta_label',
    'package.name',
    'package.summary',
    'package.price',
    'package.period',
    'package.features_list',
    'package.feature_item',
    'package.cta_label',
    'person.name',
    'person.role',
    'person.bio',
    'person.image',
    'person.initials',
    'stat.value',
    'stat.label',
    'step.index',
    'step.title',
    'step.description',
    'quote.text',
    'quote.author_name',
    'claim.entity_name',
    'claim.entity_logo',
    'faq.question',
    'faq.answer',
    'event.date_or_year',
    'event.title'
  ]) {
    assert.equal(isRole(known), true, `expected known role: ${known}`)
    assert.equal(isFactRole(known), true, `expected fact role: ${known}`)
  }

  for (const unknown of ['', 'unknown.role', 'offering.nonexistent', null, undefined, 42]) {
    assert.equal(isRole(unknown), false)
    assert.equal(isFactRole(unknown), false)
  }
})

test('DEFAULT_NEUTRAL_BY_ROLE covers every vocabulary role with a valid §7 policy and contains no forbidden neutral text', () => {
  for (const role of PLACE_CONTENT_ROLES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DEFAULT_NEUTRAL_BY_ROLE, role),
      `DEFAULT_NEUTRAL_BY_ROLE missing role: ${role}`
    )
  }

  // Validate every default neutral rule through validateSlotRoles behaviour.
  const docWithAllDefaults = makeValidDoc({
    groups: [
      {
        id: 'all.roles.0',
        groupId: 'all.roles.0',
        entityKind: 'business',
        itemIndex: 0,
        requiredRoles: ['business.name'],
        neutral: { ...DEFAULT_NEUTRAL_BY_ROLE }
      }
    ],
    bindings: [
      {
        slotKey: 'module-183.3',
        groupId: 'all.roles.0',
        role: 'business.name',
        mode: 'verbatim'
      }
    ]
  })
  assert.deepEqual(validateSlotRoles(docWithAllDefaults), { ok: true, errors: [] })

  const serializedModule = JSON.stringify(rolesModule).toLowerCase()
  for (const forbidden of FORBIDDEN_NEUTRAL_TEXTS) {
    assert.equal(
      serializedModule.includes(forbidden.toLowerCase()),
      false,
      `vocabulary module must not contain forbidden neutral text "${forbidden}"`
    )
  }
})

test('validateSlotRoles accepts valid v1 documents including neutral_by_kind, index_padded, and CTA requires', () => {
  const slotKeys = ['module-183.3', 'module-183.6', 'module-183.9', 'module-183.12']
  const okRes = validateSlotRoles(makeValidDoc(), { slotKeys })
  assert.deepEqual(okRes, { ok: true, errors: [] })

  const richDoc = makeValidDoc({
    groups: [
      {
        id: 'menu.item.0',
        groupId: 'menu.item.0',
        entityKind: 'menu_item',
        itemIndex: 0,
        requiredRoles: ['offering.name'],
        neutral: {
          'offering.name': {
            policy: 'neutral_by_kind',
            keysByKind: {
              dish: 'neutral.offering.menu_item',
              drink: 'neutral.offering.menu_item',
              menu_item: 'neutral.offering.menu_item',
              service: 'neutral.offering.service',
              product: 'neutral.offering.product'
            }
          },
          'contact.cta_label': {
            policy: 'neutral_key',
            key: 'neutral.cta.call',
            requires: 'phone'
          },
          'step.index': { policy: 'index_padded' },
          'step.title': { policy: 'neutral_key', key: 'neutral.step.title' },
          'step.description': { policy: 'empty' }
        }
      }
    ],
    bindings: [
      {
        slotKey: 'module-183.3',
        groupId: 'menu.item.0',
        role: 'offering.name',
        mode: 'copy'
      }
    ]
  })
  assert.deepEqual(validateSlotRoles(richDoc, { slotKeys }), { ok: true, errors: [] })

  const missingSlotRes = validateSlotRoles(makeValidDoc(), {
    slotKeys: ['module-183.3', 'module-183.6']
  })
  assert.equal(missingSlotRes.ok, false)
  assert.ok(missingSlotRes.errors.some((e) => e.includes('module-183.9')))
})

test('validateSlotRoles rejects wrong schemaVersion, unknown roles, missing groupId, duplicate bindings, and bad neutral/requires policies', () => {
  const slotKeys = ['module-183.3', 'module-183.6', 'module-183.9']

  const badSchema = validateSlotRoles(makeValidDoc({ schemaVersion: 'tracy-quickstart-slot-roles/v0' }), {
    slotKeys
  })
  assert.equal(badSchema.ok, false)
  assert.ok(badSchema.errors.some((e) => e.includes('schemaVersion')))

  const badRole = validateSlotRoles(
    makeValidDoc({
      bindings: [
        {
          slotKey: 'module-183.3',
          groupId: 'module-183.tier.0',
          role: 'not_a_real.role',
          mode: 'copy'
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(badRole.ok, false)
  assert.ok(badRole.errors.some((e) => e.includes('not_a_real.role')))

  const missingGroup = validateSlotRoles(
    makeValidDoc({
      bindings: [
        {
          slotKey: 'module-183.3',
          groupId: 'nonexistent.group.0',
          role: 'package.name',
          mode: 'copy'
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(missingGroup.ok, false)
  assert.ok(missingGroup.errors.some((e) => e.includes('nonexistent.group.0')))

  const duplicateSlot = validateSlotRoles(
    makeValidDoc({
      bindings: [
        {
          slotKey: 'module-183.3',
          groupId: 'module-183.tier.0',
          role: 'package.name',
          mode: 'copy'
        },
        {
          slotKey: 'module-183.3',
          groupId: 'module-183.tier.0',
          role: 'package.summary',
          mode: 'copy'
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(duplicateSlot.ok, false)
  assert.ok(duplicateSlot.errors.some((e) => e.includes('module-183.3')))

  const badNeutralKey = validateSlotRoles(
    makeValidDoc({
      groups: [
        {
          groupId: 'module-183.tier.0',
          entityKind: 'package',
          requiredRoles: ['package.name'],
          neutral: {
            'package.name': { policy: 'neutral_key', key: '' }
          }
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(badNeutralKey.ok, false)
  assert.ok(badNeutralKey.errors.some((e) => e.includes('neutral')))

  const badNeutralByKind = validateSlotRoles(
    makeValidDoc({
      groups: [
        {
          groupId: 'module-183.tier.0',
          entityKind: 'package',
          requiredRoles: ['package.name'],
          neutral: {
            'offering.name': { policy: 'neutral_by_kind', keysByKind: {} }
          }
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(badNeutralByKind.ok, false)
  assert.ok(badNeutralByKind.errors.some((e) => e.includes('keysByKind')))

  const badRequires = validateSlotRoles(
    makeValidDoc({
      groups: [
        {
          groupId: 'module-183.tier.0',
          entityKind: 'package',
          requiredRoles: ['package.name'],
          neutral: {
            'contact.cta_label': {
              policy: 'neutral_key',
              key: 'neutral.cta.contact',
              requires: 'booking'
            }
          }
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(badRequires.ok, false)
  assert.ok(badRequires.errors.some((e) => e.includes('requires')))

  const badNeutralPolicy = validateSlotRoles(
    makeValidDoc({
      groups: [
        {
          groupId: 'module-183.tier.0',
          entityKind: 'package',
          requiredRoles: ['package.name'],
          neutral: {
            'package.name': { policy: 'invent_text' }
          }
        }
      ]
    }),
    { slotKeys }
  )
  assert.equal(badNeutralPolicy.ok, false)
  assert.ok(badNeutralPolicy.errors.some((e) => e.includes('neutral')))
})

test('a post author is its own role, left empty on a demo', () => {
  assert.equal(isRole('post.author'), true)
  for (const role of PLACE_CONTENT_ROLES) assert.ok(Object.hasOwn(DEFAULT_NEUTRAL_BY_ROLE, role), role)
  assert.equal(domain.neutralFor({ role: 'post.author', locale: 'en' }).state, 'empty')
})
