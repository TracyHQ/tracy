// EmDash themes declare slot roles once per field in seed/field-map.json (ADR 0038, ticket 1804): what they derive to,
// what the contract check says about a field without a role, and where the shared reader takes them from.
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readSlotRoles } from '../src/lib/contract-slot-roles.js'
import { checkFieldMapRoles, fieldMapRolesOf } from '../src/lib/emdash-field-map-roles.js'
import { baseHashOf, sha256 } from '../src/lib/slot-roles.js'
import { checkAllSlotRoles } from '../../../scripts/slot-roles/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const THEME = path.join(ROOT, 'packages/cms/tracy-emdash-theme-base')
const SEED = path.join(THEME, 'seed')
const SIDECAR = JSON.parse(readFileSync(path.join(THEME, 'contracts/0.5.6/slot-roles.json'), 'utf8'))
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const keyed = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]))

/** A throwaway copy of the theme's seed and contract folders, laid out the way a checkout has them. */
function themeCopy(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-field-map-roles-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(SEED, path.join(dir, 'seed'), { recursive: true, filter: (src) => !src.includes('/media') })
  cpSync(path.join(THEME, 'contracts/0.5.6'), path.join(dir, 'contracts/0.5.6'), { recursive: true })
  return dir
}

// The sidecar bound three intro paragraphs as one-slot cards (a package card holding only a summary, an event card
// holding only a description). Vocabulary 2 requires a package card to have a name and an event card a title, so the
// field map keeps the same roles in a `claim` card, which asks for none. The slots, roles and card ids are unchanged;
// only the kind of those three cards differs.
const ONE_SLOT_CARDS = [
  'landing.landing.pricing_intro',
  'pricing.pricing.pricing_intro',
  'careers.careers.timeline_intro'
]
const isOneSlotCard = (groupId) => ONE_SLOT_CARDS.some((slot) => groupId === `${slot}.0`)

test('the base theme field map derives the roles its 0.5.6 sidecar declares', () => {
  const derived = fieldMapRolesOf(SEED)
  assert.ok(derived, 'the field map declares roles')
  assert.deepEqual(derived.errors, [])
  assert.equal(derived.ok, true)

  assert.deepEqual(keyed(derived.doc.bindings, 'slotKey'), keyed(SIDECAR.bindings, 'slotKey'))

  const groups = keyed(derived.doc.groups, 'id')
  assert.deepEqual(Object.keys(groups).sort(), SIDECAR.groups.map((g) => g.id).sort())
  for (const group of SIDECAR.groups) {
    const got = groups[group.id]
    assert.equal(got.groupId, group.groupId, group.id)
    assert.equal(got.itemIndex, group.itemIndex, group.id)
    // `requiredRoles` is left out: the sidecar listed the roles it bound, vocabulary 2 takes them from the kind.
    if (isOneSlotCard(group.id)) assert.equal(got.entityKind, 'claim', group.id)
    else {
      assert.equal(got.entityKind, group.entityKind, group.id)
      assert.deepEqual(got.allowedKinds, group.allowedKinds, group.id)
    }
  }
})

test('a field without a role is reported by the check, naming the field', () => {
  const fieldMap = readJson(path.join(SEED, 'field-map.json'))
  assert.deepEqual(checkFieldMapRoles(fieldMap).errors, [])

  const services = fieldMap.collections.find((c) => c.collection === 'services')
  delete services.fields.find((f) => f.slug === 'cta_btn_label').role
  const faq = services.fields.find((f) => f.slug === 'faq_items')
  delete faq.subRoles.answer

  const res = checkFieldMapRoles(fieldMap)
  assert.equal(res.ok, false)
  assert.deepEqual(res.errors.sort(), [
    'field "services.cta_btn_label" has no role',
    'repeater sub-field "services.faq_items.answer" has no role'
  ])
})

test('links, alt text and identifiers need no role; an unknown role or a fact role without a group kind does', () => {
  const res = checkFieldMapRoles({
    roleVocabularyVersion: 'place-content-roles/2',
    settings: {
      title: { role: 'business.name', group: { kind: 'business' } },
      tagline: { role: 'business.tagline', group: { kind: 'business' } }
    },
    collections: [
      {
        collection: 'pages',
        fields: [
          { slug: 'cta_url', type: 'string' },
          { slug: 'image_alt', type: 'string' },
          { slug: 'form_id', type: 'string' },
          { slug: 'sort', type: 'integer' },
          { slug: 'heading', type: 'string', role: 'editorial.shout' },
          { slug: 'price', type: 'string', role: 'package.price' }
        ]
      }
    ]
  })
  assert.deepEqual(res.errors, [
    'field "pages.heading" has unknown role "editorial.shout"',
    'field "pages.price" has fact role "package.price" and needs group.kind (one of ' +
      'business, contact, menu_item, service, package, person, stat_item, step, quote, claim, faq, event, post)'
  ])
})

test('a field map without roles is not checked', () => {
  assert.deepEqual(checkFieldMapRoles({ collections: [{ collection: 'pages', fields: [] }] }), {
    declared: false,
    ok: true,
    errors: []
  })
})

test('the shared reader takes EmDash roles from the field map, before the sidecar beside it', () => {
  const read = readSlotRoles(path.join(THEME, 'contracts/0.5.6'), { cms: 'emdash', template: 'tracy-base' })
  assert.equal(read.source, 'field-map')
  assert.equal(read.state, 'ready')
  assert.equal(read.doc.status, 'checked')
  assert.equal(read.doc.bindings.length, SIDECAR.bindings.length)
  assert.deepEqual(read.gaps, [])
})

test('a field map with broken roles is invalid, with the reason, and never falls back to the sidecar', (t) => {
  const dir = themeCopy(t)
  const file = path.join(dir, 'seed/field-map.json')
  const fieldMap = readJson(file)
  delete fieldMap.collections
    .find((c) => c.collection === 'services')
    .fields.find((f) => f.slug === 'cta_btn_label').role
  writeFileSync(file, JSON.stringify(fieldMap))
  const read = readSlotRoles(path.join(dir, 'contracts/0.5.6'), { cms: 'emdash' })
  assert.equal(read.source, 'field-map')
  assert.equal(read.state, 'invalid')
  assert.deepEqual(read.errors, ['field "services.cta_btn_label" has no role'])
})

test('a field map that declares no roles leaves the sidecar in charge', (t) => {
  const dir = themeCopy(t)
  const file = path.join(dir, 'seed/field-map.json')
  const fieldMap = readJson(file)
  delete fieldMap.roleVocabularyVersion
  delete fieldMap.settings
  for (const col of fieldMap.collections)
    for (const field of col.fields) {
      delete field.role
      delete field.group
      delete field.subRoles
    }
  writeFileSync(file, JSON.stringify(fieldMap))
  // The sidecar is bound to the files it was cut from: bind the copy to the stripped field map.
  const sidecarFile = path.join(dir, 'contracts/0.5.6/slot-roles.json')
  const sidecar = readJson(sidecarFile)
  sidecar.baseFiles['seed/field-map.json'] = sha256(readFileSync(file))
  sidecar.baseHash = baseHashOf(sidecar.baseFiles, Object.keys(sidecar.baseFiles))
  writeFileSync(sidecarFile, JSON.stringify(sidecar))

  const read = readSlotRoles(path.join(dir, 'contracts/0.5.6'), { cms: 'emdash' })
  assert.equal(read.source, 'sidecar')
  assert.equal(read.state, 'ready')
})

test('the contract check judges an EmDash contract by its field map, not by a sidecar cut from older files', () => {
  assert.deepEqual(checkAllSlotRoles(ROOT).errors, [])
})

test('the contract check reports an EmDash field without a role', (t) => {
  const dir = themeCopy(t)
  const file = path.join(dir, 'seed/field-map.json')
  const fieldMap = readJson(file)
  delete fieldMap.collections.find((c) => c.collection === 'home').fields.find((f) => f.slug === 'hero_title')
    .role
  writeFileSync(file, JSON.stringify(fieldMap))
  const res = checkAllSlotRoles(dir, [path.join(dir, 'contracts/0.5.6')])
  assert.equal(res.ok, false)
  assert.match(res.errors.join('\n'), /contracts\/0\.5\.6: field "home\.hero_title" has no role/)
})
