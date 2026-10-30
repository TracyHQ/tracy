/**
 * Pictures and icons follow the accepted site plan (spec TracyHQ/tracy#231, ticket #239): after the copy is settled, the
 * picture stage gives every picture slot exactly the plan's decision (its brief photo, a drawing from the plan's
 * description, or hidden) and every icon the plan's meaning or the one neutral icon of its row. A brief photo the plan
 * does not use is never placed; a drawing is asked for only where the plan draws; no demo picture stays in a kept slot.
 * Runs the real picture stage (`shapeReal`) on the released ja-boxing 1.0.8 content map. Fictional business: a bicycle
 * repair workshop.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { briefPhotos } from '../src/sites/brief-engines/brief-photos.js'
import { declaredPictureSlots } from '../src/sites/brief-engines/drawn-pictures.js'
import { contentMapOf, keptPages, shapeReal } from '../src/sites/brief-engines/real-pictures.js'
import { completePlan } from '../src/sites/brief-engines/site-plan-defaults.js'
import { plannedPictures } from '../src/sites/brief-engines/site-plan-pictures.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)
const contentMap = contentMapOf(contract)

const asset = (id, extra) => ({
  id,
  kind: 'image',
  width: 3000,
  height: 2000,
  orientation: 'landscape',
  quality: 'high',
  content: 'interior',
  isGraphic: false,
  depicts: { id: 'general' },
  portraitOf: null,
  ...extra
})
const ASSETS = [
  asset('p-hall', { caption: 'The workshop floor with bikes on stands', sha256: 'a'.repeat(64) }),
  asset('p-wheel', { caption: 'A wheel being trued on the stand', sha256: 'b'.repeat(64) }),
  // A good photo the plan decides not to use: it must never reach the site.
  asset('p-spare', { caption: 'The shop front at dusk', sha256: 'c'.repeat(64) })
]
const BRIEF = {
  reading: {
    about: 'Spoke & Chain repairs and services bicycles in a small workshop.',
    services: [
      { id: 's1', label: 'Wheel truing' },
      { id: 's2', label: 'Full service' }
    ]
  },
  assets: ASSETS
}

const HERO = 'picture:module-156.0'
const GALLERY = 'picture:module-166.5'
const HIDDEN = 'picture:module-161.2'
const DRAWN = 'picture:module-177.0'
const DESCRIBE = 'A mechanic adjusting the brakes of a road bike on a work stand'
const NEUTRAL_ROW = 'icon:module-157.12'
const MEANT = 'icon:module-190.12'

/** The author's answer: every template page kept, three photo decisions, one hidden, one drawn, two icon choices. */
function plan() {
  const authored = {
    version: 'site-plan/1',
    pages: inventory.elements
      .filter((e) => e.kind === 'page')
      .map((e) => ({
        id: e.id,
        decision: 'keep',
        purpose: 'Show the workshop',
        lead: 'Bikes fixed',
        facts: []
      })),
    decisions: [
      { element: HIDDEN, decision: 'hide', reason: 'no photo shows this part of the business' },
      { element: DRAWN, decision: 'keep', picture: { draw: DESCRIBE } },
      { element: NEUTRAL_ROW, decision: 'keep', icon: 'neutral' },
      { element: MEANT, decision: 'keep', icon: 'calendar' }
    ],
    photos: [
      { photo: 'photo:p-hall', decision: 'use', slots: [HERO] },
      { photo: 'photo:p-wheel', decision: 'use', slots: [GALLERY] },
      { photo: 'photo:p-spare', decision: 'skip', reason: 'the shop front is not the workshop' }
    ],
    glossary: [],
    writingOrder: []
  }
  return completePlan(authored, { inventory, site: { name: 'Spoke & Chain' }, photos: briefPhotos(BRIEF) })
}

/** The demo files as the site serves them, at the size the map declares. */
const sizes = new Map()
for (const slot of [...contentMap.slots, ...declaredPictureSlots(contract)])
  if (slot.type === 'image' && slot.fit?.source?.width)
    sizes.set(String(slot.sample).split('#')[0], slot.fit.source)
const demoCache = new Map()
async function demoFile(file) {
  const size = sizes.get(file) ?? { width: 800, height: 600 }
  const key = `${size.width}x${size.height}${/\.png$/i.test(file) ? 'p' : 'j'}`
  if (!demoCache.has(key)) {
    const image = sharp({
      create: { width: size.width, height: size.height, channels: 3, background: '#777777' }
    })
    demoCache.set(key, await (/\.png$/i.test(file) ? image.png() : image.jpeg()).toBuffer())
  }
  return demoCache.get(key)
}

async function stage(sitePlan) {
  const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a6b4f' } })
    .jpeg()
    .toBuffer()
  const real = {
    buildId: 'build-239',
    plan: null,
    colours: ['#3a6b4f'],
    pictures: ASSETS.map((a) => ({ id: a.id, width: a.width, height: a.height, sha256: a.sha256 })),
    brief: BRIEF,
    briefBuild: true,
    bytes: async () => photo
  }
  return shapeReal({
    real,
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    siteFile: demoFile,
    siteBytes: demoFile,
    realPictures: { recordPlan: async (_id, made) => made },
    note: () => {},
    declared: declaredPictureSlots(contract),
    sitePlan
  })
}

const planned = plannedPictures(plan(), { inventory })
const withPlan = stage(planned)

test('every picture slot of the plan has exactly one decision applied, recorded on the build', async () => {
  const shaped = await withPlan
  const record = shaped.sitePlan?.pictures ?? []
  const keys = record.map((r) => r.slot)
  for (const [key] of planned.pictures) assert.ok(keys.includes(key), `${key} has an applied decision`)
  for (const r of record)
    assert.ok(
      ['photo', 'draw', 'hide', 'substitute', 'off', 'own-door', 'template', 'not-shown'].includes(r.applied),
      `${r.slot}: ${r.applied}`
    )
  const of = new Map(record.map((r) => [r.element, r]))
  assert.equal(of.get(HERO).applied, 'photo')
  assert.equal(of.get(HERO).mediaId, 'p-hall')
  assert.equal(of.get(HIDDEN).applied, 'hide')
})

test('no demo picture is left in a kept slot: each is written once, as a photo, a drawing or a cleared picture', async () => {
  const shaped = await withPlan
  const written = new Map()
  for (const item of shaped.shaped)
    for (const s of item.group.slots) written.set(s.key, (written.get(s.key) ?? 0) + 1)
  const onSite = new Set(shaped.map.groups.flatMap((g) => g.occurrences.map((o) => o.key)))
  for (const r of shaped.sitePlan.pictures) {
    if (!['photo', 'draw', 'hide', 'substitute'].includes(r.applied)) continue
    assert.ok(
      onSite.has(r.slot) || r.applied === 'hide',
      `${r.slot} (${r.applied}) is on a page the site shows`
    )
    assert.equal(written.get(r.slot), 1, `${r.slot} (${r.applied}) is written exactly once`)
  }
  const hidden = shaped.shaped.find((i) => i.group.slots.some((s) => s.key === HIDDEN.slice(8)))
  assert.equal(hidden?.hide, true, 'a hidden picture is cleared and taken off')
})

test('a picture is drawn only where the plan draws, from the plan description', async () => {
  const shaped = await withPlan
  const drawnByPlan = new Set(shaped.sitePlan.pictures.filter((r) => r.planned === 'draw').map((r) => r.slot))
  for (const g of shaped.plan.drawings ?? [])
    for (const key of g.keys) assert.ok(drawnByPlan.has(key), `${key} is drawn only because the plan says so`)
  const own = (shaped.plan.drawings ?? []).find((g) => g.keys.includes(DRAWN.slice(8)))
  assert.ok(own, 'the planned drawing is asked for')
  assert.equal(own.subject.describe, DESCRIBE)
})

test('a brief photo the plan does not use is never placed, extended or drawn from', async () => {
  const shaped = await withPlan
  assert.ok(!shaped.plan.placements.some((p) => p.mediaId === 'p-spare'))
  for (const g of shaped.plan.drawings ?? []) {
    assert.notEqual(g.sourceId, 'p-spare')
    assert.ok(!g.referenceIds.includes('p-spare'))
  }
  // A used photo goes only where the plan put it.
  const byPhoto = shaped.plan.placements.filter((p) => p.mediaId === 'p-hall')
  for (const p of byPhoto)
    assert.ok(
      shaped.map.groups
        .find((g) => g.id === p.groupId)
        .occurrences.every((o) => planned.pictures.get(o.key)?.mediaId === 'p-hall')
    )
})

test('icons follow the plan: a neutral row shows one neutral icon, a meaning shows its own icon', async () => {
  const shaped = await withPlan
  const domain = await websiteOpportunitiesDomain()
  const icons = new Map(shaped.sitePlan.icons.map((r) => [r.slot, r]))
  const row = [...icons.values()].filter((r) => r.slot.startsWith('module-157.'))
  assert.ok(row.length > 1)
  for (const r of row) assert.equal(r.glyph, domain.NEUTRAL_GLYPHS[0], `${r.slot} is neutral`)
  const meant = icons.get(MEANT.slice(5))
  assert.equal(meant.applied, 'meaning')
  assert.match(meant.glyph, /calendar/)
})

test('with no plan the picture stage decides as before and records nothing', async () => {
  const shaped = await stage(null)
  assert.equal(shaped.sitePlan, undefined)
  assert.ok(shaped.plan.placements.length > 0)
})

test('a planned photo the acceptance or crop rules refuse leaves its slot hidden, with the reason', async () => {
  const { followPlannedPictures } = await import('../src/sites/brief-engines/site-plan-pictures.js')
  const own = {
    pictures: new Map([['hero.0', { element: 'picture:hero.0', decision: 'photo', mediaId: 'p-small' }]]),
    icons: new Map(),
    skipped: new Set(),
    used: new Set(['p-small'])
  }
  const { slots, record } = followPlannedPictures(
    [
      {
        key: 'hero.0',
        type: 'image',
        file: 'images/hero.jpg',
        action: 'keep',
        reason: 'no-general-photo',
        refused: { 'too-small': 1, 'not-in-site-plan': 2 }
      }
    ],
    own
  )
  assert.equal(slots[0].action, 'substitute')
  assert.equal(slots[0].reason, 'site-plan-hidden')
  assert.equal(record.get('hero.0').applied, 'hide')
  assert.match(record.get('hero.0').reason, /too-small/)
})
