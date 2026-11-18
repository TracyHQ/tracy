// A plan the composer's gate accepted is accepted unchanged by the plan edit door and by every operation's gate (#575).
// The composer adds parts the needs profile does not hold (a WhatsApp link and a second phone from the brief,
// `plan-composer-channels.mjs`); the edit door must judge the plan against the same plan data, or every card edit of
// such a plan is refused for a part the owner never touched. Invented club, invented template, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-edit-gate-composed.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { EDIT_DOOR_CODES, gateEditedPlan, gateOperatedPlan, PLAN_FAULT } from '../domain/plan-edit-gate.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { OPERATION_REFUSALS } from '../domain/plan-operations.mjs'
import {
  answer,
  blockStore,
  brand,
  clubProfile,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  template,
  PHONE_QUESTION,
  scriptedModel,
  withIntentNotes
} from './fixtures/plan-composer/invented-club.mjs'
import { brief, inputs, reply, richerKit } from './fixtures/plan-composer/intent-kit.mjs'
import { tradeComposition, tradeRecipes, tradeStore } from './fixtures/plan-composer/trade-blocks.mjs'

/** The invented club composed with a WhatsApp number and a second phone from the brief, each on the contact page. */
export async function composedWithChannels() {
  const kit = richerKit()
  const composition = withIntentNotes(goodComposition(), ['km-1', 'km-2'])
  const contact = composition.pages.find((p) => p.pageType === 'contact')
  contact.blocks[0].data.push('contact-phone-2')
  contact.blocks.push({
    block: 'social-row',
    label: 'Social links',
    data: ['contact-whatsapp'],
    reason: 'r',
    message: 'm'
  })
  const input = inputs(scriptedModel(reply(composition)), {
    ...kit,
    brief: brief({
      contact: { whatsapp: { number: '+1 555 0142 790', href: 'https://wa.me/15550142790', verified: true } },
      facts: [{ id: 'w1', field: 'whatsapp', value: '+1 555 0142 790', evidence: [{ source: 'google' }] }]
    }),
    answers: [answer(PHONE_QUESTION, { text: 'Show both numbers please' })],
    answerReadings: new Map([
      [
        PHONE_QUESTION,
        {
          facts: [
            { kind: 'contact.phone', value: '+1 555 0142 778', primary: true },
            { kind: 'contact.phone', value: '+1 555 0142 779', primary: false }
          ]
        }
      ]
    ])
  })
  const composed = await composePlan(input)
  const shown = composed.plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))
  assert.ok(
    shown.includes('contact-whatsapp') && shown.includes('contact-phone-2'),
    'the fixture places both'
  )
  return {
    plan: composed.plan,
    profile: composed.profile,
    kit: { blockStore: input.blockStore, pageRecipes: input.pageRecipes, library: input.library }
  }
}

const editOf = (plan, changes) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-1',
  plan: { id: plan.id, revision: plan.revision },
  changes
})
const opOf = (plan, operation) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-op',
  plan: { id: plan.id, revision: plan.revision },
  operation
})

test('an edit that changes nothing the composer made is accepted on a plan with brief channels', async () => {
  const { plan, profile, kit } = await composedWithChannels()
  const message = plan.keyMessages[0]
  const out = gateEditedPlan({
    plan,
    profile,
    edit: editOf(plan, [{ field: `keyMessages[${message.id}].label`, value: `${message.label} again` }]),
    ...kit
  })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assert.ok(
    out.plan.facts.some((f) => f.id === 'contact-whatsapp'),
    'the channel stays on the plan'
  )
  assert.deepEqual(checkBuildDocument(out.plan).problems, [])
})

test('every operation on a plan with brief channels is accepted or refused only for what the owner clicked', async () => {
  const { plan, profile, kit } = await composedWithChannels()
  const ops = []
  for (const page of plan.pages) {
    ops.push({ op: 'remove-page', page: page.id })
    for (const block of page.blocks) ops.push({ op: 'remove-block', page: page.id, block: block.id })
  }
  for (const m of plan.keyMessages ?? []) ops.push({ op: 'remove-key-message', message: m.id })
  for (const f of plan.facts) ops.push({ op: 'remove-channel', fact: f.id })
  let accepted = 0
  for (const operation of ops) {
    const out = gateOperatedPlan({
      plan,
      profile,
      edit: opOf(plan, operation),
      review: { base: { plan, profile }, removals: [] },
      removal: 'removal-1',
      ...kit
    })
    if (out.ok) {
      accepted += 1
      continue
    }
    for (const p of out.problems)
      assert.ok(
        Object.hasOwn(OPERATION_REFUSALS, p.code),
        `${JSON.stringify(operation)}: ${JSON.stringify(p)}`
      )
  }
  assert.ok(accepted > 0)
})

/** A plan the composer's gate accepted, from `composition` on `profile` and the invented kit. */
function gated(
  composition,
  profile = clubProfile(),
  kit = { blockStore: blockStore(), pageRecipes: pageRecipes(), library: library() }
) {
  const context = composerContextOf({
    profile,
    ...kit,
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const result = gatePlan(composition, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  return { plan: result.plan, profile: context.profile, kit }
}

const PRIVACY = {
  kind: 'privacy',
  use: 'create',
  id: 'legal:privacy',
  says: 'Who runs the club and how to reach it; what the email and the phone are used for.',
  factIds: ['business-name', 'contact-email', 'contact-phone']
}
/** Every plan the package composes in its tests, in the kinds the composer adds beyond the profile. */
const PLANS = {
  'the invented club, reviews placed by the gate from the library, a privacy page planned by code': () =>
    gated(goodComposition()),
  'a planned privacy page and not-found page': () =>
    gated({
      ...goodComposition(),
      legalPages: [PRIVACY],
      notFound: { says: 'This page is not here; point back to the courts.', leadsTo: ['home'] }
    }),
  'item field facts of open conflicts (a price, a role)': () =>
    gated(goodComposition(), conflictedClubProfile()),
  'a WhatsApp link and a second phone from the brief': composedWithChannels,
  'a repeating section kept on trade basis with no item of its own': tradePlan
}

/** The invented club with a services type section kept on trade basis: its copy is written from the trade, no item. */
function tradePlan() {
  const out = gated(tradeComposition(), clubProfile(), {
    blockStore: tradeStore(),
    pageRecipes: tradeRecipes(),
    library: library()
  })
  const trade = out.plan.pages.flatMap((p) => p.blocks).filter((b) => b.basis === 'trade')
  assert.equal(trade.length, 1, 'the plan keeps the trade section')
  assert.deepEqual(trade[0].data, [], 'with no item of its own')
  return out
}

/** Every operation the card could send on `plan`. */
function operationsOf(plan, removals = []) {
  const ops = []
  for (const page of plan.pages) {
    ops.push({ op: 'remove-page', page: page.id })
    for (const block of page.blocks) {
      ops.push({ op: 'remove-block', page: page.id, block: block.id })
      for (const item of block.data) ops.push({ op: 'remove-item', page: page.id, block: block.id, item })
    }
  }
  for (const m of plan.keyMessages ?? []) ops.push({ op: 'remove-key-message', message: m.id })
  for (const e of plan.later ?? []) ops.push({ op: 'remove-later', later: e.code })
  for (const f of plan.facts) ops.push({ op: 'remove-channel', fact: f.id })
  for (const r of removals) ops.push({ op: 'restore', removal: r.id })
  return ops
}

for (const [name, make] of Object.entries(PLANS)) {
  test(`a composed plan passes the edit door unchanged: ${name}`, async () => {
    const { plan, profile, kit } = await make()
    const page = plan.pages[0]
    const out = gateEditedPlan({
      plan,
      profile,
      edit: editOf(plan, [{ field: `pages[${page.id}].name`, value: page.name }]),
      ...kit
    })
    assert.equal(out.ok, true, JSON.stringify(out.problems))
    assert.deepEqual(checkBuildDocument(out.plan).problems, [])
  })

  test(`every operation is accepted or refused only for what the owner clicked: ${name}`, async () => {
    const { plan, profile, kit } = await make()
    for (const operation of operationsOf(plan)) {
      const out = gateOperatedPlan({
        plan,
        profile,
        edit: opOf(plan, operation),
        review: { base: { plan, profile }, removals: [] },
        removal: 'removal-1',
        ...kit
      })
      if (out.ok) continue
      for (const p of out.problems)
        assert.ok(
          Object.hasOwn(OPERATION_REFUSALS, p.code),
          `${JSON.stringify(operation)}: ${JSON.stringify(p)}`
        )
    }
  })
}

/** A seeded random number generator (mulberry32), so a failing sequence can be run again. */
function randomOf(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('random operations on a plan with brief channels, a privacy page and a library block stay valid and undo fully', async () => {
  const start = await composedWithChannels()
  const blocks = start.plan.pages.flatMap((p) => p.blocks)
  assert.ok(
    blocks.some((b) => b.block === 'tracy-reviews'),
    'a library block is on the plan'
  )
  assert.ok((start.plan.legalPages ?? []).length > 0, 'a privacy page is on the plan')
  randomWalk(start)
})

test('random operations on a plan with a trade basis section stay valid and undo fully', () => {
  randomWalk(tradePlan())
})

/** Random operations from `start` (seeds 3, 11, 29), each kept plan valid, then every removal brought back. */
function randomWalk(start) {
  const withoutRevision = ({ revision: _r, ...rest }) => rest
  for (const seed of [3, 11, 29]) {
    const random = randomOf(seed)
    let s = { plan: start.plan, profile: start.profile, review: { base: start, removals: [] } }
    for (let step = 0; step < 80; step++) {
      const ops = operationsOf(s.plan, s.review.removals)
      const operation = ops[Math.floor(random() * ops.length)]
      const out = gateOperatedPlan({
        plan: s.plan,
        profile: s.profile,
        edit: opOf(s.plan, operation),
        review: s.review,
        removal: `removal-${seed}-${step}`,
        ...start.kit
      })
      if (!out.ok) {
        for (const p of out.problems)
          assert.ok(
            Object.hasOwn(OPERATION_REFUSALS, p.code),
            `seed ${seed} step ${step}: ${JSON.stringify(p)}`
          )
        continue
      }
      assert.deepEqual(checkBuildDocument(out.plan).problems, [], `seed ${seed} step ${step}`)
      const removals = out.removal
        ? [...s.review.removals, out.removal]
        : s.review.removals.filter((r) => r.id !== out.restored)
      s = { plan: out.plan, profile: out.profile, review: { ...s.review, removals } }
    }
    while (s.review.removals.length) {
      const last = s.review.removals.at(-1)
      const out = gateOperatedPlan({
        plan: s.plan,
        profile: s.profile,
        edit: opOf(s.plan, { op: 'restore', removal: last.id }),
        review: s.review,
        ...start.kit
      })
      assert.equal(out.ok, true, `seed ${seed} restore ${last.id}: ${JSON.stringify(out.problems)}`)
      s = {
        plan: out.plan,
        profile: out.profile,
        review: { ...s.review, removals: s.review.removals.filter((r) => r.id !== out.restored) }
      }
    }
    assert.deepEqual(withoutRevision(s.plan), withoutRevision(start.plan), `seed ${seed}`)
  }
}

test('a change refused for a fault the plan already had says so, never asks to try again', async () => {
  const { plan, profile, kit } = await composedWithChannels()
  // A plan stored before a gate learned a part (here a fact no data holds): every gate check of it fails.
  const broken = structuredClone(plan)
  broken.facts.push({
    id: 'contact-fax',
    kind: 'contact.phone',
    label: 'Fax',
    value: '+1 555 0100',
    sources: [{ kind: 'google', name: 'Google Maps listing' }]
  })
  broken.pages.find((p) => p.pageType === 'contact').blocks[0].data.push('contact-fax')
  const page = broken.pages[0]
  const edit = gateEditedPlan({
    plan: broken,
    profile,
    edit: editOf(broken, [{ field: `pages[${page.id}].name`, value: page.name }]),
    ...kit
  })
  assert.deepEqual(
    edit.problems.map((p) => p.code),
    [PLAN_FAULT]
  )
  assert.ok(edit.problems[0].details.problems.some((p) => p.code === 'invented_item'))
  const block = broken.pages
    .find((p) => p.pageType === 'home')
    .blocks.find((b) => b.block === 'gallery-strip')
  const op = gateOperatedPlan({
    plan: broken,
    profile,
    edit: opOf(broken, { op: 'remove-block', page: 'home', block: block.id }),
    review: { base: { plan: broken, profile }, removals: [] },
    removal: 'removal-1',
    ...kit
  })
  assert.deepEqual(
    op.problems.map((p) => p.code),
    [PLAN_FAULT]
  )
})

test('every code a refusal carries is one the card has words for', async () => {
  const { plan, profile, kit } = await composedWithChannels()
  const seen = new Set()
  for (const operation of operationsOf(plan)) {
    const out = gateOperatedPlan({
      plan,
      profile,
      edit: opOf(plan, operation),
      review: { base: { plan, profile }, removals: [] },
      removal: 'removal-1',
      ...kit
    })
    for (const p of out.problems) seen.add(p.code)
  }
  const page = plan.pages[0]
  for (const changes of [
    [{ field: `pages[${page.id}].seo.searchTerms`, value: [] }],
    [{ field: `pages[${page.id}].blocks[${page.blocks[0].id}].data`, value: ['contact-nothing'] }]
  ])
    for (const p of gateEditedPlan({ plan, profile, edit: editOf(plan, changes), ...kit }).problems)
      seen.add(p.code)
  for (const code of seen) assert.ok(EDIT_DOOR_CODES.includes(code), code)
})

test('a trade basis section can be taken off and brought back, and offers no item to take off', async () => {
  const { planLocksOf } = await import('../domain/plan-operation-locks.mjs')
  const { plan, profile, kit } = tradePlan()
  const page = plan.pages.find((p) => p.blocks.some((b) => b.basis === 'trade'))
  const block = page.blocks.find((b) => b.basis === 'trade')
  const locks = planLocksOf(plan, kit)
  assert.equal(locks.blocks[block.id], undefined, 'the section itself is not locked')
  assert.deepEqual(block.data, [], 'no item, so the card offers no item trash')
  const removed = gateOperatedPlan({
    plan,
    profile,
    edit: opOf(plan, { op: 'remove-block', page: page.id, block: block.id }),
    review: { base: { plan, profile }, removals: [] },
    removal: 'removal-1',
    ...kit
  })
  assert.equal(removed.ok, true, JSON.stringify(removed.problems))
  const restored = gateOperatedPlan({
    plan: removed.plan,
    profile: removed.profile,
    edit: opOf(removed.plan, { op: 'restore', removal: 'removal-1' }),
    review: { base: { plan, profile }, removals: [removed.removal] },
    ...kit
  })
  assert.equal(restored.ok, true, JSON.stringify(restored.problems))
  const back = restored.plan.pages.find((p) => p.id === page.id).blocks.find((b) => b.id === block.id)
  assert.deepEqual(back, block)
})
