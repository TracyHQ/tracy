// Spec TracyHQ/tracy#189 (COO decision 30/10/2026): a showcase block repeated across kept pages stays on one page.
// Two made-up businesses: a bakery and a dental clinic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planRepeatedBlocks } from '../domain/repeated-blocks.mjs'
import { planSite, SITE_PLAN_REASONS } from '../domain/site-plan.mjs'

const menu = (id, path) => ({ key: `menuItem-${id}`, kind: 'menuItem', identity: { path } })
const on = (entity, mode = 'include') => ({ entity, assignmentMode: mode })
const slot = (key, role, extra = {}) => ({ key, entity: key.split('.')[0], type: 'text', role, ...extra })
const photo = (key, item) =>
  slot(key, 'business.gallery_image', { type: 'image', group: { id: `${key}.g`, item, kind: 'gallery' } })

/** A template with pages home (1), about (2), services (3), team (4) and a gallery page (5). */
function map({ assigned, extraSlots = [], extra = {} }) {
  const paths = { 1: 'home', 2: 'about-us', 3: 'services', 4: 'about-us/team', 5: 'gallery' }
  return {
    entities: Object.entries(paths).map(([id, path]) => menu(id, path)),
    pages: Object.entries(paths).map(([id]) => ({
      entity: `menuItem-${id}`,
      assignedModules: assigned[id] ?? []
    })),
    slots: [
      // A strip of photos and one figure, with a heading, an intro and a button: a showcase.
      photo('module-30.0', 0),
      photo('module-30.1', 1),
      slot('module-30.2', 'stat.value', { group: { id: 'module-30.stat.0', kind: 'stat_item' } }),
      slot('module-30.3', 'editorial.heading'),
      slot('module-30.4', 'contact.cta_label'),
      // People cards: a working block.
      slot('module-31.0', 'person.name', { group: { id: 'module-31.p.0', kind: 'person' } }),
      slot('module-31.1', 'editorial.heading'),
      // A contact strip with figures beside the phone: a working block.
      slot('module-32.0', 'stat.value'),
      slot('module-32.1', 'contact.phone'),
      // A footer gallery shown on every page.
      photo('module-33.0', 0),
      ...extraSlots
    ],
    ...extra
  }
}
const rows = (keep = ['home', 'about-us', 'services', 'about-us/team', 'gallery']) =>
  [
    { id: 'home', role: 'home' },
    { id: 'about-us', role: 'about' },
    { id: 'services', role: 'services' },
    { id: 'about-us/team', role: 'team' },
    { id: 'gallery', role: 'gallery' }
  ].map((r) => ({ ...r, decision: keep.includes(r.id) ? 'keep' : 'drop' }))

test('bakery: a photo and figure strip on home, About, services and team stays on home only', () => {
  const contentMap = map({
    assigned: {
      1: [on('module-30'), on('module-33', 'all')],
      2: [on('module-30'), on('module-33', 'all')],
      3: [on('module-30'), on('module-33', 'all')],
      4: [on('module-30'), on('module-33', 'all')]
    }
  })
  const out = planRepeatedBlocks({
    pages: rows(['home', 'about-us', 'services', 'about-us/team']),
    contentMap
  })
  const strip = out.find((b) => b.entity === 'module-30')
  assert.equal(strip.repeat, 'once')
  assert.deepEqual(strip.keepOn, { id: 'home', entity: 'menuItem-1' })
  assert.deepEqual(
    strip.takenOffFrom.map((p) => p.id),
    ['about-us', 'services', 'about-us/team']
  )
  assert.equal(strip.reason, 'repeated-showcase')
  assert.ok(strip.why.length > 20)
  // The footer gallery is the template's frame: shown everywhere on purpose.
  assert.equal(out.find((b) => b.entity === 'module-33').repeat, 'everywhere')
})

test('dental clinic: not on home, the photo strip keeps the gallery page, else About over services', () => {
  const assigned = { 2: [on('module-30')], 3: [on('module-30')], 5: [on('module-30')] }
  const withGallery = planRepeatedBlocks({ pages: rows(), contentMap: map({ assigned }) })
  assert.equal(withGallery[0].keepOn.id, 'gallery')
  const noGallery = planRepeatedBlocks({
    pages: rows(['home', 'about-us', 'services']),
    contentMap: map({ assigned })
  })
  assert.equal(noGallery[0].keepOn.id, 'about-us')
  assert.deepEqual(
    noGallery[0].takenOffFrom.map((p) => p.id),
    ['services']
  )
})

test('a figures-only band without photos keeps About before a gallery page', () => {
  const contentMap = map({
    assigned: { 3: [on('module-34')], 5: [on('module-34')], 2: [on('module-34')] },
    extraSlots: [
      slot('module-34.0', 'stat.value', { group: { id: 'module-34.s.0', kind: 'stat_item' } }),
      slot('module-34.1', 'stat.label', { group: { id: 'module-34.s.0', kind: 'stat_item' } })
    ]
  })
  assert.equal(planRepeatedBlocks({ pages: rows(), contentMap })[0].keepOn.id, 'about-us')
})

test('people cards, a contact strip, a declared call-to-action band and a page frame are never taken off', () => {
  const contentMap = map({
    assigned: {
      1: [on('module-31'), on('module-32'), on('module-30'), on('module-35', 'exclude')],
      2: [on('module-31'), on('module-32'), on('module-30'), on('module-35', 'exclude')]
    },
    extraSlots: [photo('module-35.0', 0)],
    extra: { ctaBands: [{ id: 'module-30.cta-band', entity: 'module-30' }] }
  })
  const out = planRepeatedBlocks({ pages: rows(), contentMap })
  assert.deepEqual(
    out.map((b) => [b.entity, b.repeat]),
    [
      ['module-30', 'everywhere'],
      ['module-31', 'everywhere'],
      ['module-32', 'everywhere'],
      ['module-35', 'everywhere']
    ]
  )
})

test('a block shown on one kept page and on dropped pages is no repeat', () => {
  const contentMap = map({ assigned: { 1: [on('module-30')], 3: [on('module-30')], 4: [on('module-30')] } })
  assert.deepEqual(planRepeatedBlocks({ pages: rows(['home', 'about-us']), contentMap }), [])
  assert.deepEqual(planRepeatedBlocks({ pages: rows(), contentMap: null }), [])
})

test('the site plan carries the repeated blocks, and its reasons explain them', () => {
  const plan = planSite({ business: { name: 'Fictional Bakery' } }, { questions: [] }, { contentMap: null })
  assert.deepEqual(plan.repeatedBlocks, [])
  assert.ok(SITE_PLAN_REASONS['repeated-showcase'])
  assert.ok(SITE_PLAN_REASONS['repeated-on-purpose'])
})
