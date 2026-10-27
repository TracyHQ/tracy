// Slot roles declared on the slots of a content map (ADR 0038): the vocabulary they come from, the deterministic check
// a contract must pass, and the group plan Website Opportunities fills from them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as domain from '../domain/index.mjs'
import { emptyPlaceProfile } from '../domain/place-profile.mjs'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/content-map-with-roles.json', import.meta.url), 'utf8')
)
const fixture = () => structuredClone(FIXTURE)
const slotOf = (map, key) => map.slots.find((s) => s.key === key)

const EDITORIAL = [
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.menu_label',
  'editorial.decorative_image'
]

test('the vocabulary has a new version with editorial roles next to the fact roles, each with a rule for no fact', () => {
  for (const role of EDITORIAL) {
    assert.equal(domain.isRole(role), true, role)
    assert.equal(domain.isFactRole(role), false, role)
    assert.ok(domain.PLACE_CONTENT_ROLES.includes(role), role)
    assert.ok(Object.hasOwn(domain.DEFAULT_NEUTRAL_BY_ROLE, role), role)
  }
  for (const role of domain.PLACE_CONTENT_ROLES) {
    assert.ok(Object.hasOwn(domain.DEFAULT_NEUTRAL_BY_ROLE, role), `no rule for no fact: ${role}`)
  }
  assert.equal(domain.isFactRole('offering.price'), true)
})

test('a sidecar bound against the first vocabulary still validates', () => {
  const sidecar = {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    roleVocabularyVersion: 'place-content-roles/1',
    status: 'checked',
    groups: [
      { id: 'module-9.item.0', entityKind: 'service', itemIndex: 0, requiredRoles: ['offering.name'] }
    ],
    bindings: [{ slotKey: 'module-9.0', groupId: 'module-9.item.0', role: 'offering.name', mode: 'copy' }]
  }
  assert.deepEqual(domain.validateSlotRoles(sidecar), { ok: true, errors: [] })
})

test('a content map with a role on every text and image slot passes the contract check', () => {
  assert.deepEqual(domain.checkContentMapRoles(fixture()), { declared: true, ok: true, errors: [] })
})

test('a content map that declares no roles is not checked: older contracts stay as they are', () => {
  const map = fixture()
  delete map.roleVocabularyVersion
  for (const slot of map.slots) {
    delete slot.role
    delete slot.group
  }
  assert.deepEqual(domain.checkContentMapRoles(map), { declared: false, ok: true, errors: [] })
})

test('an unknown role fails and names the slot and the role', () => {
  const map = fixture()
  slotOf(map, 'module-503.1').role = 'offering.cost'
  const res = domain.checkContentMapRoles(map)
  assert.equal(res.ok, false)
  assert.ok(
    res.errors.some((e) => e.includes('module-503.1') && e.includes('unknown role "offering.cost"')),
    res.errors.join('\n')
  )
})

test('a split group fails: two slots of one group that disagree on the card or the kind', () => {
  const map = fixture()
  slotOf(map, 'module-503.1').group = { id: 'module-503.item.0', item: 1, kind: 'menu_item' }
  const res = domain.checkContentMapRoles(map)
  assert.equal(res.ok, false)
  assert.ok(
    res.errors.some((e) => e.includes('group "module-503.item.0" is split') && e.includes('module-503.1')),
    res.errors.join('\n')
  )

  const kinds = fixture()
  slotOf(kinds, 'module-504.1').group = { id: 'module-504.quote.0', item: 0, kind: 'person' }
  const byKind = domain.checkContentMapRoles(kinds)
  assert.equal(byKind.ok, false)
  assert.ok(
    byKind.errors.some((e) => e.includes('group "module-504.quote.0" is split')),
    byKind.errors.join('\n')
  )
})

test('a text or image slot without a role fails; a link slot may go without one', () => {
  const map = fixture()
  delete slotOf(map, 'module-502.0').role
  delete slotOf(map, 'module-501.1').role
  const res = domain.checkContentMapRoles(map)
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes('module-502.0') && e.includes('has no role')))
  assert.ok(res.errors.some((e) => e.includes('module-501.1') && e.includes('has no role')))
  assert.ok(!res.errors.some((e) => e.includes('module-501.3')), res.errors.join('\n'))
})

test('a fact slot outside any group, a group missing a role its kind needs, a malformed group, and a stale vocabulary all fail', () => {
  const loose = fixture()
  delete slotOf(loose, 'module-504.0').group
  assert.ok(
    domain
      .checkContentMapRoles(loose)
      .errors.some((e) => e.includes('module-504.0') && e.includes('needs a group'))
  )

  const lacking = fixture()
  slotOf(lacking, 'module-503.3').role = 'offering.description'
  assert.ok(
    domain
      .checkContentMapRoles(lacking)
      .errors.some((e) => e.includes('group "module-503.item.1"') && e.includes('offering.name'))
  )

  const malformed = fixture()
  slotOf(malformed, 'module-503.0').group = { id: '', item: -1, kind: 'spaceship' }
  assert.ok(
    domain
      .checkContentMapRoles(malformed)
      .errors.some((e) => e.includes('module-503.0') && e.includes('group'))
  )

  const stale = fixture()
  stale.roleVocabularyVersion = 'place-content-roles/1'
  assert.ok(domain.checkContentMapRoles(stale).errors.some((e) => e.includes('roleVocabularyVersion')))

  const twice = fixture()
  twice.slots.push({
    ...slotOf(twice, 'module-503.0'),
    group: { id: 'module-503.item.1', item: 1, kind: 'menu_item' }
  })
  assert.ok(
    domain
      .checkContentMapRoles(twice)
      .errors.some((e) => e.includes('module-503.0') && e.includes('more than once'))
  )
})

test('the group plan read from a content map is the one the fill planner takes: one card per group, fact slots only', () => {
  const doc = domain.slotRolesOfContentMap(fixture(), { contract: 'juniper-crumb/j6/1.0.0', cms: 'joomla' })
  assert.equal(doc.status, 'checked')
  assert.equal(doc.contract, 'juniper-crumb/j6/1.0.0')
  assert.equal(doc.roleVocabularyVersion, 'place-content-roles/2')
  assert.deepEqual(
    doc.groups.map((g) => [g.groupId, g.entityKind, g.itemIndex]),
    [
      ['site.identity.0', 'business', 0],
      ['module-503.item.0', 'menu_item', 0],
      ['module-503.item.1', 'menu_item', 1],
      ['module-504.quote.0', 'quote', 0]
    ]
  )
  const card = doc.groups.find((g) => g.groupId === 'module-503.item.0')
  assert.deepEqual(card.allowedKinds, ['menu_item', 'service', 'package'])
  assert.deepEqual(card.neutral['offering.price'], domain.DEFAULT_NEUTRAL_BY_ROLE['offering.price'])
  assert.deepEqual(
    doc.bindings.map((b) => [b.slotKey, b.role, b.mode]),
    [
      ['site.name', 'business.name', 'verbatim'],
      ['module-503.0', 'offering.name', 'copy'],
      ['module-503.1', 'offering.price', 'format'],
      ['module-503.2', 'offering.image', 'asset'],
      ['module-503.3', 'offering.name', 'copy'],
      ['module-503.4', 'offering.price', 'format'],
      ['module-504.0', 'quote.text', 'copy'],
      ['module-504.1', 'quote.author_name', 'copy']
    ]
  )
  assert.deepEqual(domain.validateSlotRoles(doc), { ok: true, errors: [] })

  // With no facts at all, the planner leaves every bound slot empty or neutral: nothing is invented.
  const profile = emptyPlaceProfile()
  const plan = domain.planSlotFill({
    slotRoles: doc,
    profile,
    assessment: domain.provisionalAssessment(profile),
    locale: 'en',
    neutralFor: domain.neutralFor
  })
  assert.equal(plan.writes.length, doc.bindings.length)
  for (const write of plan.writes) assert.ok(['empty', 'neutral'].includes(write.state), write.slotKey)
})
