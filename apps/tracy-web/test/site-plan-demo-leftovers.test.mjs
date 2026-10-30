/**
 * No demo text or demo picture is left by an accepted site plan, and a failing line comes off (COO rules, debts of tickets
 * TracyHQ/tracy#237 and #239):
 *   - a failing offering summary with no sourced fallback is not kept as written: it is handed back as refused;
 *   - a demo blog post of the template (never written by the build) is hidden by default and a plan keeping it is refused,
 *     so none of its demo pictures stays;
 *   - the logo slot takes the brief's logo or the business-name wordmark, never a photo or a drawing: the default plan
 *     says so and the plan check refuses anything else.
 * Plans against the inventory of a real released template. Fictional businesses: a flower shop and a dog grooming salon.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { offeringSummaryValues } from '../src/sites/brief-engines/offering-summaries.js'
import { checkSitePlan } from '../src/sites/brief-engines/site-plan-check.js'
import { completePlan } from '../src/sites/brief-engines/site-plan-defaults.js'
import { plannedPictures } from '../src/sites/brief-engines/site-plan-pictures.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'
import { planHonesty } from 'website-opportunities/domain/site-plan-honesty.mjs'

const inventory = inventoryOfContract(contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8'))
const SITE = { name: 'Petal & Stem', about: 'A flower shop.', phone: '+1 555 0177' }

const HOME = 'page:menuItem-101'
/** The template's blog listing page, which lists its demo posts. */
const BLOG = 'page:menuItem-198'
const POST = 'section:article-1'
const LOGOS = inventory.elements.filter((e) => e.kind === 'picture' && e.role === 'business.logo')

/** The author's short plan: the home page and the blog listing kept; code completes the rest. */
function authored(extra = {}) {
  return {
    version: 'site-plan/1',
    pages: [HOME, BLOG].map((id) => ({
      id,
      decision: 'keep',
      purpose: 'Show the shop',
      lead: 'Fresh flowers',
      facts: [],
      items: [],
      dependsOn: []
    })),
    decisions: [],
    photos: [],
    glossary: [],
    writingOrder: [],
    ...extra
  }
}
const complete = (/** @type {any} */ plan) => completePlan(plan, { inventory, site: SITE, photos: [] })
const decisionOf = (/** @type {any} */ plan, /** @type {string} */ id) =>
  plan.decisions.find((d) => d.element === id)

test('the template has logo slots and demo blog posts to test against', () => {
  assert.ok(LOGOS.length >= 2)
  assert.ok(inventory.elements.some((e) => e.id === POST))
})

test('by default every logo slot takes the logo, never a drawing or a photo', () => {
  const plan = complete(authored())
  for (const e of LOGOS) {
    const d = decisionOf(plan, e.id)
    if (!d) continue
    assert.equal(d.decision, 'keep', e.id)
    assert.deepEqual(d.picture, { logo: true }, e.id)
  }
  const planned = plannedPictures(plan, { inventory })
  for (const e of LOGOS) {
    const p = planned?.pictures.get(e.key)
    if (p && p.decision !== 'off') assert.equal(p.decision, 'logo', e.id)
  }
})

test('the plan check refuses a photo or a drawing in a logo slot', async () => {
  const [logo] = LOGOS
  for (const picture of [{ draw: 'A bunch of tulips' }, { photo: 'photo:p1' }, { template: true }]) {
    const plan = complete(authored({ decisions: [{ element: logo.id, decision: 'keep', picture }] }))
    const { reasons } = await checkSitePlan(plan, { inventory, site: SITE })
    assert.ok(
      reasons.some((r) => r.rule === 'logo-slot' && r.element === logo.id),
      `${JSON.stringify(picture)}: ${JSON.stringify(reasons.map((r) => r.rule))}`
    )
  }
  const placed = complete(authored({ photos: [{ photo: 'photo:p1', decision: 'use', slots: [logo.id] }] }))
  const { reasons } = await checkSitePlan(placed, {
    inventory,
    site: SITE,
    photos: [{ id: 'photo:p1', caption: 'Tulips in the window' }]
  })
  assert.ok(reasons.some((r) => r.rule === 'logo-slot' && r.element === logo.id))
  const fine = await checkSitePlan(complete(authored()), { inventory, site: SITE })
  assert.ok(!fine.reasons.some((r) => r.rule === 'logo-slot'), JSON.stringify(fine.reasons))
})

test('a demo blog post is hidden by default, so none of its demo pictures is kept', () => {
  const plan = complete(authored())
  assert.equal(decisionOf(plan, POST)?.decision, 'hide')
  const planned = plannedPictures(plan, { inventory })
  for (const e of inventory.elements.filter((x) => x.kind === 'picture' && x.section === POST))
    assert.equal(planned?.pictures.get(e.key)?.decision, 'off', e.id)
})

test('the plan check refuses a plan that keeps a demo blog post the build never writes', async () => {
  const plan = complete(authored({ decisions: [{ element: POST, decision: 'keep' }] }))
  const { reasons } = await checkSitePlan(plan, { inventory, site: SITE })
  assert.ok(
    reasons.some((r) => r.rule === 'demo-post-kept' && r.element === POST),
    JSON.stringify(reasons.map((r) => r.rule))
  )
})

// A dog grooming salon: an offering summary that names another offering and has no sourced line that fits.
const group = { id: 'article-31.offering', kind: 'service', item: 0 }
const SLOTS = [
  {
    key: 'article-31.title',
    entity: 'article-31',
    type: 'text',
    sample: 'Demo',
    role: 'offering.name',
    group
  },
  {
    key: 'article-31.intro',
    entity: 'article-31',
    type: 'text',
    sample: 'Demo activity from the template.',
    role: 'offering.summary',
    group,
    maxCharacters: 60
  }
]
const LONG =
  'Full grooming with a warm bath, a gentle blow dry, a breed cut by hand, nail trimming and ear cleaning for every coat.'

test('a failing offering summary with no sourced fallback is refused, never kept as written', async () => {
  const { honesty } = planHonesty(
    {
      reading: {
        services: [
          { id: 'one', label: 'Full grooming', quote: LONG },
          { id: 'two', label: 'Nail clipping' }
        ]
      }
    },
    { slots: SLOTS, entities: [{ key: 'article-31', kind: 'article' }] }
  )
  const refused = new Set()
  const values = await offeringSummaryValues({
    slots: SLOTS,
    honesty,
    written: { 'article-31.intro': 'Book Nail clipping today.' },
    refused
  })
  assert.equal('article-31.intro' in values, false)
  assert.deepEqual([...refused], ['article-31.intro'])
})
