// v2 additive extensions (26 September): relay-attached writability, slot constraints and the
// next apply call on the v1 envelope, plus the separate `tracy-content-describe/v1` document.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  validateContent,
  validateContentGraph,
  validateDescribe,
  schema,
  SCHEMA_VERSION,
  DESCRIBE_SCHEMA_VERSION,
  RELAY_EXTENSIONS
} from '../validate.mjs'
import {
  joomlaSlotField,
  wordpressSlotField,
  slotBlockKinds,
  emdashBlockKinds,
  EMDASH_FIELD_TYPES
} from '../describe-map.mjs'

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
const fixture = (name) => read(`./fixtures/${name}.json`)
const repo = (file) => JSON.parse(readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8'))
const JOOMLA = 'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json'
const WORDPRESS =
  'packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/content-map.json'
const EMDASH = 'packages/cms/tracy-emdash-theme-business/seed/site-model.json'
const rejects = (value, code, validator = validateContent) => {
  const errors = validator(value)
  assert.ok(
    errors.some((e) => e.code === code),
    JSON.stringify(errors)
  )
}
const EXTENSION_KEYS = new Set(['protocol', 'writable', 'constraints', 'next'])
const strip = (value) => {
  if (Array.isArray(value)) return value.map(strip)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !EXTENSION_KEYS.has(k))
      .map(([k, v]) => [k, strip(v)])
  )
}
const allFields = (content) => [
  ...(content.fields ?? []),
  ...(content.blocks ?? []).flatMap((b) => [...b.fields, ...b.items.flatMap((i) => i.fields)])
]

test('one exported source for versions and relay extension names', () => {
  assert.equal(SCHEMA_VERSION, 'tracy-content/v1')
  assert.equal(DESCRIBE_SCHEMA_VERSION, 'tracy-content-describe/v1')
  assert.deepEqual(RELAY_EXTENSIONS, ['writable', 'constraints', 'next', 'protocol'])
  assert.deepEqual(
    schema.anyOf.map((r) => r.$ref),
    [
      '#/$defs/envelope',
      '#/$defs/describe',
      '#/$defs/pages',
      '#/$defs/notModified',
      '#/$defs/changes',
      '#/$defs/error'
    ]
  )
})

test('describe field types are exactly the v1 field value types', () => {
  const v1 = schema.$defs.field.allOf[0].anyOf.flatMap((branch) => branch.properties.type.enum)
  assert.deepEqual(schema.$defs.fieldType.enum, v1)
  for (const type of Object.values(EMDASH_FIELD_TYPES)) assert.ok(v1.includes(type), type)
})

for (const cms of ['joomla', 'wordpress', 'emdash']) {
  test(`${cms}: relay-extended envelope conforms and only adds extension keys to v1`, () => {
    const value = fixture(`${cms}.v2`)
    assert.deepEqual(validateContent(value), [])
    assert.deepEqual(validateContentGraph(value.contents), [])
    assert.deepEqual(strip(value), fixture(cms))
    assert.deepEqual(value.protocol.relayExtensions, RELAY_EXTENSIONS)
    assert.equal(value.protocol.cowork.kind, cms)
    for (const content of value.contents)
      for (const field of allFields(content)) {
        if (cms === 'emdash' || field.slotKey === null) {
          assert.equal(field.writable, null)
          assert.equal(field.constraints, null)
          assert.equal(field.next, null)
        } else {
          assert.equal(field.writable, true)
          assert.notEqual(field.constraints, null)
          assert.deepEqual(field.next, {
            tool: 'tracy_site',
            action: 'content.contract',
            operation: 'apply',
            changes: { [field.slotKey]: null }
          })
        }
      }
  })
}

test('joomla/wordpress v2 constraints come from the slot of the release content map', () => {
  for (const [cms, file] of [
    ['joomla', JOOMLA],
    ['wordpress', WORDPRESS]
  ]) {
    const slots = new Map(repo(file).slots.map((s) => [s.key, s]))
    for (const content of fixture(`${cms}.v2`).contents)
      for (const field of allFields(content).filter((f) => f.slotKey)) {
        const slot = slots.get(field.slotKey)
        assert.ok(slot, field.slotKey)
        assert.deepEqual(field.constraints, {
          maxCharacters: slot.maxCharacters ?? null,
          requiresEvidence: slot.requiresEvidence ?? null,
          emptyAllowed: slot.siteIdentity === true ? true : null
        })
      }
  }
})

const envelopeMutations = [
  [
    'writable must be boolean or null',
    (v) => {
      v.contents[0].fields[0].writable = 'yes'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'constraints carry all three keys',
    (v) => {
      delete v.contents[0].fields[0].constraints.emptyAllowed
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'negative maxCharacters',
    (v) => {
      v.contents[0].fields[0].constraints.maxCharacters = -1
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'next names the contract apply call only',
    (v) => {
      v.contents[0].fields[0].next.action = 'content.read'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'next change value is a placeholder, not a value',
    (v) => {
      v.contents[0].fields[0].next.changes[v.contents[0].fields[0].slotKey] = 'new text'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'protocol selects v1 only',
    (v) => {
      v.protocol.selected = 'tracy-content/v2'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown Claude Cowork plugin kind',
    (v) => {
      v.protocol.cowork.kind = 'drupal'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown Claude Cowork plugin capability',
    (v) => {
      v.protocol.cowork.capability = 'v2'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'constraints without a slot',
    (v) => {
      v.contents[0].blocks[1].items[0].fields[0].constraints = {
        maxCharacters: 10,
        requiresEvidence: null,
        emptyAllowed: null
      }
    },
    'CONSTRAINTS_WITHOUT_SLOT'
  ],
  [
    'next on an unknown writability',
    (v) => {
      v.contents[0].fields[0].writable = null
    },
    'NEXT_WITHOUT_WRITABLE'
  ],
  [
    'next on a readonly field',
    (v) => {
      v.contents[0].fields[0].writable = false
    },
    'NEXT_WITHOUT_WRITABLE'
  ],
  [
    'next names another slot',
    (v) => {
      v.contents[0].fields[0].next.changes = { 'module-999.0': null }
    },
    'NEXT_SLOT_MISMATCH'
  ],
  [
    'next names two slots',
    (v) => {
      v.contents[0].fields[0].next.changes['module-999.0'] = null
    },
    'NEXT_SLOT_MISMATCH'
  ],
  [
    'readonly content with a writable field',
    (v) => {
      v.contents[0].writable = false
    },
    'WRITABLE_INHERITANCE'
  ],
  [
    'readonly block with a writable item field',
    (v) => {
      v.contents[0].blocks[1].writable = false
      v.contents[0].blocks[1].items[0].fields[0].writable = true
    },
    'WRITABLE_INHERITANCE'
  ]
]
for (const [name, mutate, code] of envelopeMutations)
  test(`v2 envelope: ${name}`, () => {
    const value = fixture('joomla.v2')
    mutate(value)
    rejects(value, code)
    if (!code.startsWith('CONTENT_')) rejects(value.contents, code, validateContentGraph)
  })

test('writable inheritance: false flows down, true and null do not force children', () => {
  const value = fixture('joomla.v2')
  const c = value.contents[0]
  c.writable = true
  c.blocks[1].writable = true
  c.blocks[1].items[0].fields[0].writable = false
  assert.deepEqual(validateContent(value), [])
  c.writable = null
  c.blocks[1].writable = false
  c.blocks[1].items[0].fields[0].writable = false
  assert.deepEqual(validateContent(value), [])
  assert.deepEqual(validateContentGraph(value.contents), [])
  c.blocks[1].items[0].fields[0].writable = null
  rejects(value, 'WRITABLE_INHERITANCE')
  c.blocks[1].items[0].fields[0].writable = false
  c.fields[0].next = null
  c.fields[0].writable = false
  c.writable = false
  c.blocks[0].writable = false
  assert.deepEqual(validateContent(value), [])
})

test('a slotted field may stay writable null; no slot implies no writability claim', () => {
  const value = fixture('joomla.v2')
  const field = value.contents[0].fields[0]
  field.writable = null
  field.next = null
  assert.deepEqual(validateContent(value), [])
  delete field.writable
  delete field.constraints
  delete field.next
  assert.deepEqual(validateContent(value), [])
})

const describes = ['joomla', 'wordpress', 'emdash']
for (const cms of describes)
  test(`${cms}: describe read calls are optional, executable type listings only`, () => {
    const doc = fixture(`${cms}.describe`)
    const entry = doc.types[0]
    entry.next = { tool: 'tracy_site', action: 'content.read', params: { type: entry.type } }
    assert.deepEqual(validateDescribe(doc), [])
    for (const params of [
      { type: 'option' },
      { type: entry.type, id: 'not-a-listing' },
      { type: entry.type, locale: 'und' }
    ]) {
      const invalid = structuredClone(doc)
      invalid.types[0].next.params = params
      assert.ok(validateDescribe(invalid).some((e) => e.code === 'READ_NEXT_TYPE_MISMATCH'))
    }
    const write = structuredClone(doc)
    write.types[0].next.action = 'content.update'
    assert.ok(validateDescribe(write).some((e) => e.code === 'CONTENT_SCHEMA_INVALID'))
    doc.protocol.cowork.capability = 'unsupported'
    assert.ok(validateDescribe(doc).some((e) => e.code === 'READ_NEXT_UNSUPPORTED'))
    entry.next = null
    assert.deepEqual(validateDescribe(doc), [])
    delete entry.next
    assert.deepEqual(validateDescribe(doc), [], 'older describe documents remain valid')
  })

for (const cms of describes)
  test(`${cms}: describe fixture conforms through both entry points`, () => {
    const doc = fixture(`${cms}.describe`)
    assert.deepEqual(validateDescribe(doc), [])
    assert.deepEqual(validateContent(doc), [])
    assert.equal(doc.protocol.cowork.kind, cms)
  })

test('joomla describe blockKinds are derived from the release content map', () => {
  const map = repo(JOOMLA)
  assert.deepEqual(fixture('joomla.describe').blockKinds, slotBlockKinds(map, joomlaSlotField))
})

test('wordpress describe blockKinds are derived from the release content map', () => {
  const map = repo(WORDPRESS)
  assert.deepEqual(fixture('wordpress.describe').blockKinds, slotBlockKinds(map, wordpressSlotField))
})

test('emdash describe blockKinds are derived from the seed site model', () => {
  const model = repo(EMDASH)
  const doc = fixture('emdash.describe')
  assert.deepEqual(doc.blockKinds, emdashBlockKinds(model))
  assert.deepEqual(doc.i18n.locales, model.locales.all)
  assert.equal(doc.i18n.defaultLocale, model.locales.default)
  for (const kind of doc.blockKinds) for (const f of kind.fields) assert.equal(f.writable, null)
  assert.ok(!doc.capabilities.some((c) => c.name === 'ai.tracy.content.slot-write'))
  for (const type of model.types) {
    const kind = doc.blockKinds.find((k) => k.kind === type.name)
    assert.deepEqual(
      kind.fields.map((f) => f.key),
      type.fields.map((f) => f.name)
    )
  }
})

for (const [cms, file, slotField] of [
  ['joomla', JOOMLA, joomlaSlotField],
  ['wordpress', WORDPRESS, wordpressSlotField]
])
  test(`${cms}: every content-map slot maps into exactly one describe field of its type`, () => {
    const map = repo(file)
    const entities = new Map(map.entities.map((e) => [e.key, e]))
    const doc = fixture(`${cms}.describe`)
    for (const slot of map.slots) {
      const { kind, key } = slotField(slot, entities.get(slot.entity))
      const hits = doc.blockKinds
        .filter((k) => k.kind === kind)
        .flatMap((k) => k.fields.filter((f) => f.key === key))
      assert.equal(hits.length, 1, `${slot.key} -> ${kind}.${key}`)
      assert.equal(hits[0].type, slot.type, slot.key)
      const max = hits[0].constraints.maxCharacters
      assert.ok(max === null || max === slot.maxCharacters, slot.key)
    }
    const used = new Set(
      map.slots.map((s) => {
        const at = slotField(s, entities.get(s.entity))
        return `${at.kind}\u0000${at.key}`
      })
    )
    const declared = doc.blockKinds.flatMap((k) => k.fields.map((f) => `${k.kind}\u0000${f.key}`))
    assert.deepEqual(new Set(declared), used, 'no describe field without a slot')
  })

const describeMutations = [
  [
    'duplicate type',
    (d) => {
      d.types.push(d.types[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate block kind',
    (d) => {
      d.blockKinds.push(d.blockKinds[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate field key in one kind',
    (d) => {
      d.blockKinds[0].fields.push(d.blockKinds[0].fields[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate capability',
    (d) => {
      d.capabilities.push(d.capabilities[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'capability outside the Tracy content namespace',
    (d) => {
      d.capabilities.push({ name: 'com.example.write', version: '1' })
    },
    'CAPABILITY_NAME_INVALID'
  ],
  [
    'apply without the slot-write capability',
    (d) => {
      d.capabilities = d.capabilities.filter((c) => c.name !== 'ai.tracy.content.slot-write')
    },
    'APPLY_CAPABILITY_MISMATCH'
  ],
  [
    'slot-write capability for a viewer who cannot apply',
    (d) => {
      d.permissions.apply = false
    },
    'APPLY_CAPABILITY_MISMATCH'
  ],
  [
    'guidance over 600 characters',
    (d) => {
      d.guidance = 'x'.repeat(601)
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'i18n default locale not declared',
    (d) => {
      d.i18n.defaultLocale = 'vi-VN'
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'site default locale not declared',
    (d) => {
      d.site.defaultLocale = 'vi-VN'
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'noncanonical locale',
    (d) => {
      d.site.locales.push('en_US')
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'unknown describe field type',
    (d) => {
      d.blockKinds[0].fields[0].type = 'prose'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown role',
    (d) => {
      d.permissions.role = 'guest'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'read permission is always true',
    (d) => {
      d.permissions.read = false
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'nullable key omitted',
    (d) => {
      delete d.provenance
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown presentation state',
    (d) => {
      d.presentation.state = 'open'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'i18n fallback is null in v1',
    (d) => {
      d.i18n.fallback = 'en-GB'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown content type',
    (d) => {
      d.types[0].type = 'product'
    },
    'CONTENT_SCHEMA_INVALID'
  ]
]
for (const [name, mutate, code] of describeMutations)
  test(`describe: ${name}`, () => {
    const doc = fixture('joomla.describe')
    mutate(doc)
    rejects(doc, code, validateDescribe)
    rejects(doc, code)
  })

test('guidance of exactly 600 characters is allowed; code points are counted', () => {
  const doc = fixture('joomla.describe')
  doc.guidance = '界'.repeat(600)
  assert.deepEqual(validateDescribe(doc), [])
})

test('describe without write capability is consistent when apply is false', () => {
  const doc = fixture('joomla.describe')
  doc.permissions.apply = false
  doc.capabilities = doc.capabilities.filter((c) => c.name !== 'ai.tracy.content.slot-write')
  assert.deepEqual(validateDescribe(doc), [])
})

test('describe byte budget matches the envelope budget and does not mutate', () => {
  const doc = fixture('joomla.describe')
  doc.blockKinds[0].label = '界'.repeat(90000)
  const before = structuredClone(doc)
  rejects(doc, 'CONTENT_RESPONSE_TOO_LARGE', validateDescribe)
  rejects(doc, 'CONTENT_RESPONSE_TOO_LARGE')
  assert.deepEqual(doc, before)
  assert.deepEqual(validateDescribe(doc, { maxBytes: 300000 }), [])
})

test('unknown versions are refused by both validators; each refuses the other document', () => {
  for (const version of ['tracy-content-describe/v2', 'tracy-content/v2']) {
    const doc = fixture('joomla.describe')
    doc.schemaVersion = version
    rejects(doc, 'CONTENT_VERSION_UNSUPPORTED')
    rejects(doc, 'CONTENT_VERSION_UNSUPPORTED', validateDescribe)
  }
  rejects(fixture('joomla'), 'CONTENT_VERSION_UNSUPPORTED', validateDescribe)
  rejects(
    { error: { code: 'CONTENT_NOT_FOUND', message: 'x' } },
    'CONTENT_VERSION_UNSUPPORTED',
    validateDescribe
  )
  const envelopeShaped = fixture('joomla')
  envelopeShaped.schemaVersion = DESCRIBE_SCHEMA_VERSION
  rejects(envelopeShaped, 'CONTENT_SCHEMA_INVALID')
})

test('describe rejects non-JSON data', () => {
  const doc = fixture('joomla.describe')
  doc.guidance = undefined
  rejects(doc, 'CONTENT_SCHEMA_INVALID', validateDescribe)
})
