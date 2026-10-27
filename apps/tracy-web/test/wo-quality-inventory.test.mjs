import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindQualityInventory } from '../src/opportunities-build/quality-inventory.js'

function scenario() {
  const manifest = {
    hash: 'declared-manifest',
    locale: 'en',
    records: [
      {
        key: 'home/home@en',
        collection: 'home',
        slug: 'home',
        locale: 'en',
        defaultLocale: true,
        fields: [{ slug: 'featured', type: 'reference' }],
        sample: { featured: '$ref:stories:sample:en' }
      },
      {
        key: 'stories/sample@en',
        collection: 'stories',
        slug: 'sample',
        locale: 'en',
        defaultLocale: true,
        fields: [],
        sample: {}
      },
      {
        key: 'home/home@fr',
        collection: 'home',
        slug: 'home',
        locale: 'fr',
        defaultLocale: false,
        fields: [],
        sample: {}
      }
    ],
    menus: [{ id: 'declared-primary', name: 'primary', locale: 'en' }],
    terms: [{ key: 'term:sector/energy@en', name: 'sector', slug: 'energy', locale: 'en' }],
    inactiveLocalePolicy: { menus: [{ id: 'declared-fr', name: 'primary', locale: 'fr' }] }
  }
  const plan = {
    hash: 'plan',
    manifestHash: manifest.hash,
    validation: { state: 'validated' },
    coverage: [
      { key: 'home/home@en', state: 'planned' },
      { key: 'stories/sample@en', state: 'planned' },
      { key: 'home/home@fr', state: 'empty-by-policy' }
    ],
    operations: [
      { kind: 'unpublish', key: 'home/home@fr', collection: 'home', slug: 'home', locale: 'fr' },
      {
        kind: 'term-update',
        key: 'term:sector/energy@en',
        name: 'sector',
        slug: 'energy',
        locale: 'en',
        fields: { label: 'Coffee', slug: 'coffee', description: '' }
      },
      {
        kind: 'update',
        key: 'home/home@en',
        collection: 'home',
        slug: 'home',
        locale: 'en',
        fields: { title: 'Coffee' }
      },
      {
        kind: 'update',
        key: 'stories/sample@en',
        collection: 'stories',
        slug: 'sample',
        locale: 'en',
        newSlug: 'coffee-story',
        fields: {}
      },
      { kind: 'menu-update', name: 'primary', menuId: 'declared-primary', locale: 'en', items: [] }
    ]
  }
  const inventory = {
    records: [
      { id: 'actual-home', collection: 'home', slug: 'home', locale: 'en', status: 'published' },
      { id: 'actual-story', collection: 'stories', slug: 'sample', locale: 'en', status: 'published' }
    ],
    menus: [{ id: 'actual-menu', name: 'primary', locale: 'en' }],
    terms: [{ id: 'actual-term', name: 'sector', slug: 'energy', locale: 'en' }]
  }
  return { manifest, plan, inventory }
}
test('installation binding retains actual IDs and explicit absent-locale policy without pretending render coverage', () => {
  const s = scenario(),
    bound = bindQualityInventory(s)
  assert.equal(bound.parentPlanHash, 'plan')
  assert.notEqual(bound.hash, 'plan')
  assert.equal(bound.operations.length, 4)
  assert.equal(bound.operations.find((o) => o.kind === 'term-update').id, 'actual-term')
  assert.equal(bound.operations.find((o) => o.kind === 'menu-update').id, 'actual-menu')
  assert.deepEqual(bound.operations.find((o) => o.key === 'home/home@en').expectedReferences, {
    featured: ['actual-story']
  })
  assert.equal(bound.installedCoverage.find((c) => c.key === 'home/home@fr').state, 'absent-by-install')
  assert.deepEqual(bound.coverageCounts, {
    declared: 3,
    modelRead: 2,
    installed: 2,
    policyAbsent: 1,
    rendered: 0
  })
  assert.equal(s.plan.operations[2].id, undefined)
})
test('unknown, duplicate, missing, scheduled or unresolved reference inventory refuses before execution', () => {
  for (const mutate of [
    (s) => s.inventory.records.push({ id: 'extra', collection: 'home', slug: 'unknown', locale: 'en' }),
    (s) => s.inventory.records.push({ ...s.inventory.records[0] }),
    (s) => s.inventory.records.shift(),
    (s) => (s.inventory.records[0].scheduledAt = '2026-11-01T00:00:00Z'),
    (s) => (s.plan.coverage[1].state = 'empty-by-policy'),
    (s) => (s.inventory.terms = []),
    (s) => (s.inventory.menus = [])
  ]) {
    const s = scenario()
    mutate(s)
    assert.throws(() => bindQualityInventory(s), /QUALITY_INVENTORY/)
  }
})
test('already hidden locale records need no mutation; scheduled records cannot be hidden by declaring them absent', () => {
  const s = scenario()
  s.inventory.records.push({
    id: 'actual-fr',
    collection: 'home',
    slug: 'home',
    locale: 'fr',
    status: 'draft'
  })
  assert.equal(
    bindQualityInventory(s).operations.some((o) => o.key === 'home/home@fr'),
    false
  )
  s.inventory.records[2].status = 'published'
  assert.equal(bindQualityInventory(s).operations[0].id, 'actual-fr')
  s.inventory.records[2].status = 'scheduled'
  assert.throws(() => bindQualityInventory(s), /QUALITY_INVENTORY_SCHEDULED/)
})
