/**
 * The site plan check (spec TracyHQ/tracy#231 seam 2, ticket #233): a pure module that refuses a site plan, listing every
 * reason, when an inventory element is undecided or decided twice, an added page names no template page layout, a card
 * count is over its section's capacity, a placed fact is not stated by the brief, a repeated item has no glossary entry,
 * the writing order has a cycle or a missing page, or a button has no real action. A complete plan passes. Hand-built plans
 * against the inventory of a real released template. Fictional business: a bicycle repair shop.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { checkSitePlan } from '../src/sites/brief-engines/site-plan-check.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'

const inventory = inventoryOfContract(contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8'))

const BRIEF = {
  reading: {
    about: 'Spoke & Chain fixes city bikes and cargo bikes while you wait.',
    services: [
      { id: 's1', label: 'Wheel truing', quote: 'Wheel truing from $25, done the same day' },
      { id: 's2', label: 'Brake service', quote: 'Brake pads and cables checked and set' }
    ],
    story: [{ label: 'Our first bench', quote: 'We opened our first workshop bench in 2011' }]
  }
}
const SITE = {
  name: 'Spoke & Chain',
  about: 'A bicycle repair shop.',
  phone: '+1 555 0142',
  email: 'hello@spokechain.example',
  address: '12 Harbour Lane',
  factSheet: briefFactSheet(BRIEF)
}

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const ADDED = 'page:added-cargo-bikes'
const KEPT = new Set([HOME, CLASSES, CONTACT])
const ITEMS = ['Wheel truing', 'Brake service']

/** A complete plan: three pages kept, one added, every other page dropped, every element on a kept page decided. */
function completePlan() {
  const elements = inventory.elements
  const pages = [
    ...elements
      .filter((e) => e.kind === 'page')
      .map((e) =>
        KEPT.has(e.id)
          ? {
              id: e.id,
              decision: 'keep',
              purpose: 'Show the workshop',
              lead: 'Bikes fixed while you wait',
              facts: e.id === HOME ? ['Wheel truing from $25', 'Open since 2011'] : [],
              items: e.id === CONTACT ? [] : ITEMS,
              dependsOn: e.id === HOME ? [CLASSES] : []
            }
          : { id: e.id, decision: 'drop', reason: 'not part of this business' }
      ),
    {
      id: ADDED,
      decision: 'add',
      copies: 'record-page:classes',
      route: 'cargo-bikes',
      purpose: 'Cargo bike repairs',
      lead: 'Cargo bikes carry families; we keep them rolling',
      facts: [],
      items: [],
      dependsOn: []
    }
  ]
  const kept = new Set([...KEPT, ADDED])
  const shown = new Set(
    elements.filter((e) => e.kind === 'section' && e.pages.some((p) => kept.has(p))).map((e) => e.id)
  )
  const decisions = []
  for (const e of elements) {
    if (!e.decide || e.kind === 'page') continue
    if (e.kind === 'section') {
      decisions.push(
        shown.has(e.id)
          ? { element: e.id, decision: 'keep' }
          : { element: e.id, decision: 'hide', reason: 'not on a kept page' }
      )
      continue
    }
    if (e.section && !shown.has(e.section)) continue
    if (e.card && e.card.index >= 2) continue
    if (e.kind === 'cards')
      decisions.push({ element: e.id, decision: 'keep', count: Math.min(2, e.limits.capacity) })
    else if (e.kind === 'picture')
      decisions.push({ element: e.id, decision: 'keep', picture: { draw: 'A mechanic truing a wheel' } })
    else if (e.kind === 'icon') decisions.push({ element: e.id, decision: 'keep', icon: 'neutral' })
    else if (e.kind === 'button' || e.kind === 'link')
      decisions.push({ element: e.id, decision: 'keep', action: { kind: 'page', target: CONTACT } })
    else if (e.kind === 'menu' || e.kind === 'footer-column')
      decisions.push({ element: e.id, decision: 'keep', items: [HOME, CLASSES, CONTACT] })
    else decisions.push({ element: e.id, decision: 'keep' })
  }
  return {
    version: 'site-plan/1',
    pages,
    decisions,
    glossary: [
      { name: 'Wheel truing', kind: 'offering', description: 'Wheels made straight again' },
      { name: 'Brake service', kind: 'offering', description: 'Brakes checked and set' }
    ],
    writingOrder: [CLASSES, ADDED, HOME, CONTACT],
    outOfScope: { template: [], brief: [] }
  }
}

const check = (plan) => checkSitePlan(plan, { inventory, site: SITE })
const rules = (result) => result.reasons.map((r) => r.rule)
const decisionOf = (plan, id) => plan.decisions.find((d) => d.element === id)

test('a complete plan passes', async () => {
  const result = await check(completePlan())
  assert.deepEqual(result.reasons, [])
  assert.equal(result.ok, true)
})

test('an element with no decision is refused, naming it', async () => {
  const plan = completePlan()
  plan.decisions = plan.decisions.filter((d) => d.element !== 'picture:module-156.0')
  const result = await check(plan)
  assert.equal(result.ok, false)
  assert.deepEqual(result.reasons, [
    { rule: 'undecided', element: 'picture:module-156.0', message: result.reasons[0].message }
  ])
})

test('an element decided twice is refused', async () => {
  const plan = completePlan()
  plan.decisions.push({ element: 'icon:module-157.12', decision: 'keep', icon: 'neutral' })
  plan.pages.push({ id: CONTACT, decision: 'drop', reason: 'twice' })
  const result = await check(plan)
  assert.deepEqual(
    result.reasons
      .filter((r) => r.rule === 'decided-twice')
      .map((r) => r.element)
      .sort(),
    ['icon:module-157.12', CONTACT].sort()
  )
})

test('an added page that names no existing template page layout is refused', async () => {
  const plan = completePlan()
  plan.pages.find((p) => p.id === ADDED).copies = 'page:menuItem-999'
  plan.pages.push({ id: 'page:added-two', decision: 'add', purpose: 'x', lead: 'y', dependsOn: [] })
  plan.writingOrder.push('page:added-two')
  const result = await check(plan)
  assert.deepEqual(
    result.reasons.filter((r) => r.rule === 'added-page-layout').map((r) => r.element),
    [ADDED, 'page:added-two']
  )
})

test('a card count over its section capacity is refused', async () => {
  const plan = completePlan()
  decisionOf(plan, 'cards:module-157.item').count = 5
  const result = await check(plan)
  const over = result.reasons.filter((r) => r.rule === 'over-capacity')
  assert.deepEqual(
    over.map((r) => r.element),
    ['cards:module-157.item']
  )
  assert.match(over[0].message, /at most 4 cards/)
})

test('a placed fact the brief does not state is refused', async () => {
  const plan = completePlan()
  plan.pages.find((p) => p.id === HOME).facts.push('Tune-ups from $19')
  plan.glossary[1].description = 'Brake service from $30'
  const result = await check(plan)
  assert.deepEqual(rules(result), ['unsourced-fact', 'unsourced-fact'])
  assert.match(result.reasons[0].message, /\$19|19/)
})

test('an item on more than one page with no glossary entry is refused', async () => {
  const plan = completePlan()
  plan.glossary = plan.glossary.filter((g) => g.name !== 'Brake service')
  const result = await check(plan)
  assert.deepEqual(rules(result), ['missing-glossary'])
  assert.match(result.reasons[0].message, /Brake service/)
})

test('a cycle in the writing order is refused', async () => {
  const plan = completePlan()
  plan.pages.find((p) => p.id === CLASSES).dependsOn = [HOME]
  assert.ok(rules(await check(plan)).includes('writing-order-cycle'))
})

test('a kept page missing from the writing order, or depending on an unknown page, is refused', async () => {
  const plan = completePlan()
  plan.writingOrder = plan.writingOrder.filter((id) => id !== CONTACT)
  plan.pages.find((p) => p.id === ADDED).dependsOn = ['page:menuItem-152']
  const result = await check(plan)
  assert.deepEqual(
    result.reasons.filter((r) => r.rule === 'writing-order-missing').map((r) => r.element),
    [CONTACT, ADDED]
  )
})

test('a kept button with no real action is refused', async () => {
  const plan = completePlan()
  decisionOf(plan, 'button:module-156.5').action = null
  decisionOf(plan, 'button:module-161.3').action = { kind: 'call', target: '+1 555 0199' }
  const result = await check(plan)
  assert.deepEqual(
    result.reasons.map((r) => [r.rule, r.element]),
    [
      ['button-no-action', 'button:module-156.5'],
      ['button-no-action', 'button:module-161.3']
    ]
  )
})

test('a button reaching the brief phone, email or a kept page passes; a hidden button needs no action', async () => {
  const plan = completePlan()
  decisionOf(plan, 'button:module-156.5').action = { kind: 'call', target: '+1 555 0142' }
  decisionOf(plan, 'button:module-161.3').action = {
    kind: 'email',
    target: 'hello@spokechain.example'
  }
  Object.assign(decisionOf(plan, 'link:' + firstLink(plan)), { decision: 'hide', action: null })
  assert.deepEqual((await check(plan)).reasons, [])
})

test('every reason is listed, not only the first', async () => {
  const plan = completePlan()
  plan.decisions = plan.decisions.filter((d) => d.element !== 'picture:module-156.0')
  decisionOf(plan, 'cards:module-157.item').count = 9
  plan.glossary = []
  decisionOf(plan, 'button:module-156.5').action = { kind: 'page', target: 'page:menuItem-152' }
  assert.deepEqual([...new Set(rules(await check(plan)))].sort(), [
    'button-no-action',
    'missing-glossary',
    'over-capacity',
    'undecided'
  ])
})

function firstLink(plan) {
  return plan.decisions.find((d) => d.element.startsWith('link:')).element.slice('link:'.length)
}

// Every brief photo is decided once (COO, 30/10/2026): used in named picture slots, or not used with a reason; a photo the
// brief's own labels refuse (`brief-photos.js`) is never placed.
const PHOTOS = [
  { id: 'photo:p1', caption: 'A mechanic truing a wheel', verdict: 'accept', rejectedFor: [] },
  { id: 'photo:p2', caption: 'Shop logo', verdict: 'reject', rejectedFor: ['graphic'] }
]
const withPhotos = (plan) => checkSitePlan(plan, { inventory, site: SITE, photos: PHOTOS })
function photoPlan() {
  const plan = completePlan()
  plan.photos = [
    { photo: 'photo:p1', decision: 'use', slots: ['picture:module-156.0'] },
    { photo: 'photo:p2', decision: 'skip', reason: 'a logo, not a photograph' }
  ]
  return plan
}

test('a plan that decides every brief photo once passes', async () => {
  assert.deepEqual((await withPhotos(photoPlan())).reasons, [])
})

test('a brief photo with no decision, a used photo with no slot or a skipped one with no reason is refused', async () => {
  const plan = photoPlan()
  plan.photos = [{ photo: 'photo:p1', decision: 'use', slots: [] }]
  const result = await withPhotos(plan)
  assert.deepEqual(
    result.reasons.map((r) => [r.rule, r.element]),
    [
      ['photo-undecided', 'photo:p1'],
      ['photo-undecided', 'photo:p2']
    ]
  )
  plan.photos = [
    { photo: 'photo:p1', decision: 'use', slots: ['picture:module-156.0'] },
    { photo: 'photo:p2', decision: 'skip' }
  ]
  assert.deepEqual(rules(await withPhotos(plan)), ['photo-undecided'])
})

test('a photo decided twice, or a photo the brief does not have, is refused', async () => {
  const plan = photoPlan()
  plan.photos.push({ photo: 'photo:p1', decision: 'skip', reason: 'twice' })
  plan.photos.push({ photo: 'photo:p9', decision: 'skip', reason: 'unknown' })
  assert.deepEqual(rules(await withPhotos(plan)), ['photo-decided-twice', 'unknown-photo'])
})

test('a photo the brief labels refuse is never placed', async () => {
  const plan = photoPlan()
  plan.photos[1] = { photo: 'photo:p2', decision: 'use', slots: ['picture:module-156.0'] }
  const result = await withPhotos(plan)
  assert.deepEqual(rules(result), ['photo-unusable-used'])
  assert.match(result.reasons[0].message, /graphic/)
})

test('a used photo placed in a slot that is not a template picture slot is refused', async () => {
  const plan = photoPlan()
  plan.photos[0].slots = ['picture:module-999.0']
  assert.deepEqual(rules(await withPhotos(plan)), ['unknown-element'])
})
