/**
 * Demo building fills slots from the roles on a content map (ADR 0038, ticket #1805): a fictional bakery contract whose
 * content map declares roles and groups drives the plan exactly as the equivalent `slot-roles.json` sidecar does, a slot
 * with no matching fact gets the vocabulary's no-fact policy (editorial roles keep the template's words), and a
 * hand-written role map is ignored for a contract that has roles.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as domain from 'website-opportunities/domain'
import { planFillOf, readSlotRoles } from '../src/lib/contract-slot-roles.js'
import { agentSlotFillOf } from '../src/opportunities-build/agent-slot-fill.js'
import { placeProfileOfRevision } from '../src/opportunities-build/place-profile-of-revision.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const BASE = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5')
const FIXTURE = path.join(ROOT, 'packages/wo/website-opportunities/test/fixtures/content-map-with-roles.json')
const AT = '2026-10-27T10:00:00.000Z'

/** A copy of a released contract whose content map is replaced; the original is never touched. */
function contractWith(t, contentMap, { sidecar = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'slot-fill-content-map-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(BASE, dir, { recursive: true })
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(contentMap, null, 2))
  if (!sidecar) rmSync(path.join(dir, 'slot-roles.json'), { force: true })
  return dir
}

/** The fictional bakery's frozen research: two loaves with a price, no photo. */
function bakeryRevision(
  items = [
    ['Rye sourdough', '7.5'],
    ['Seeded spelt', '6.8']
  ]
) {
  return {
    cms: 'joomla',
    template: { quickstart: 'tracy-base/j6', version: '1.0.5' },
    brief: {
      sitemap: [
        {
          slug: 'menu',
          sections: [
            {
              kind: 'menu',
              menuItems: items.map(([name, price]) => ({
                name,
                price,
                priceScale: 1,
                section: 'Bread',
                source: { url: 'https://bakery.test/menu', kind: 'page' }
              }))
            }
          ]
        }
      ],
      agentDemoSnapshot: {
        at: AT,
        opportunity: { provider: 'google', provider_id: 'juniper', name: 'Juniper Crumb Bakery' },
        profile: {
          name: 'Juniper Crumb Bakery',
          phone: '+44 20 7946 0000',
          googlePlace: { placeId: 'juniper', primaryType: 'bakery', types: ['bakery', 'food'] }
        },
        menu: { items: [] },
        brand: {},
        sources: [
          { id: 's1', data: { source: 'menu-file', ref: 'https://bakery.test/menu', status: 'complete' } }
        ],
        media: [],
        posts: []
      }
    }
  }
}

const planOf = (doc, revision) => {
  const placed = placeProfileOfRevision(domain, revision)
  assert.ok(placed)
  return planFillOf(domain, doc, { placeProfile: placed, locale: 'en' })
}

/** The sidecar a person would write for the fixture's roles: same groups, same bindings, written out by hand. */
const equivalentSidecar = (doc) => ({
  schemaVersion: doc.schemaVersion,
  contract: doc.contract,
  cms: doc.cms,
  status: 'checked',
  groups: doc.groups.map((g) => ({ ...g, neutral: { ...g.neutral } })),
  bindings: doc.bindings.map((b) => ({ ...b }))
})

test('a content map with roles drives the plan identically to the equivalent sidecar', (t) => {
  const dir = contractWith(t, JSON.parse(readFileSync(FIXTURE, 'utf8')))
  const read = readSlotRoles(dir, { cms: 'joomla', template: 'tracy-base' })
  assert.equal(read.source, 'content-map')
  assert.equal(read.state, 'ready')
  const revision = bakeryRevision()
  const fromContentMap = planOf(read.doc, revision)
  const fromSidecar = planOf(equivalentSidecar(read.doc), revision)
  assert.deepEqual(fromContentMap, fromSidecar)
  assert.ok(fromContentMap.writes.length > 0)
})

test('a group of the content map is filled from one entity, and a slot without a fact gets its no-fact policy', (t) => {
  const dir = contractWith(t, JSON.parse(readFileSync(FIXTURE, 'utf8')))
  const { doc } = readSlotRoles(dir)
  const plan = planOf(doc, bakeryRevision())
  const group = (id) =>
    Object.fromEntries(plan.writes.filter((w) => w.groupId === id).map((w) => [w.role, w]))
  const first = group('module-503.item.0')
  assert.equal(first['offering.name'].value, 'Rye sourdough')
  assert.equal(first['offering.price'].entityId, first['offering.name'].entityId)
  const second = group('module-503.item.1')
  assert.equal(second['offering.name'].value, 'Seeded spelt')
  assert.notEqual(second['offering.name'].entityId, first['offering.name'].entityId)
  // No photo was found: the picture slot takes the vocabulary's rule for it, never another dish's picture.
  assert.notEqual(first['offering.image'].state, 'sourced')
  // Editorial slots hold no fact: nothing is written, so the template's own words stay.
  const written = new Set(plan.writes.map((w) => w.slotKey))
  for (const key of ['module-501.0', 'module-501.1', 'module-501.2', 'menuItem-12.title', 'module-502.0'])
    assert.equal(written.has(key), false, key)
  for (const role of ['editorial.heading', 'editorial.paragraph', 'editorial.decorative_image'])
    assert.equal(domain.DEFAULT_NEUTRAL_BY_ROLE[role].policy, 'keep', role)
  // A card with no entity left (one dish only) takes the no-fact rule of its role, as a sidecar group does.
  const short = planOf(doc, bakeryRevision([['Rye sourdough', '7.5']]))
  const spare = Object.fromEntries(
    short.writes.filter((w) => w.groupId === 'module-503.item.1').map((w) => [w.role, w])
  )
  assert.notEqual(spare['offering.name'].state, 'sourced')
  assert.equal(spare['offering.price'].state, 'empty')
})

test('a hand-written role map is ignored once the contract has roles on its content map', (t) => {
  const dir = contractWith(t, JSON.parse(readFileSync(FIXTURE, 'utf8')))
  assert.ok(domain.slotRolesFor('joomla', 'tracy-base'), 'the hand map exists for this template')
  const withRoles = readSlotRoles(dir, { cms: 'joomla', template: 'tracy-base' })
  assert.equal(withRoles.handMap, null)
  // Without roles on the content map the hand map is still returned.
  const plain = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  for (const slot of plain.slots) {
    delete slot.role
    delete slot.group
  }
  delete plain.roleVocabularyVersion
  const without = readSlotRoles(contractWith(t, plain, { sidecar: false }), {
    cms: 'joomla',
    template: 'tracy-base'
  })
  assert.equal(without.source, 'hand-map')
  assert.ok(without.handMap)
  assert.equal(domain.handMapApplies(plain), true)
  assert.equal(domain.handMapApplies(JSON.parse(readFileSync(FIXTURE, 'utf8'))), false)
})

test('the agent demo plan is made from content-map roles, and falls back to nothing when there are none', async (t) => {
  const dir = contractWith(t, JSON.parse(readFileSync(FIXTURE, 'utf8')))
  const revision = bakeryRevision()
  const roles = readSlotRoles(dir)
  const profile = await agentSlotFillOf(revision, 'profile', { sidecarFor: () => roles })
  assert.equal(profile.slotFill.state, 'ready')
  assert.ok(profile.slotFill.groups.some((g) => g.groupId === 'module-503.item.0'))
  const none = await agentSlotFillOf(revision, 'profile', {
    sidecarFor: () => readSlotRoles(null, { cms: 'joomla', template: 'tracy-base' })
  })
  assert.match(none.slotFill.state, /missing/)
})

test('the same reader gives each slot its Slot fit, and says missing for a content map without one', (t) => {
  const map = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  assert.equal(readSlotRoles(contractWith(t, map)).fit.state, 'missing')
  map.slotFitVersion = 'slot-fit/1'
  map.fitGroups = { 'module-503.item': { items: 2, uniform: true, whenFewer: 'neutral' } }
  for (const s of map.slots)
    if (s.type === 'text' || s.type === 'image')
      s.fit =
        s.type === 'image'
          ? {
              measured: false,
              kind: 'photo',
              replace: 'photo',
              transparent: false,
              source: { width: 800, height: 600, format: 'jpg' }
            }
          : { measured: false }
  const { fit } = readSlotRoles(contractWith(t, map))
  assert.equal(fit.state, 'ready')
  assert.equal(fit.version, 'slot-fit/1')
  assert.equal(fit.slots['module-502.0'].kind, 'photo')
  assert.deepEqual(fit.groups, map.fitGroups)
  assert.deepEqual(fit.missing, { image: 0, text: 0 })
})
