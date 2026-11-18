// The plan card's structured operations (#575): a page, a section, an item of a section, a key message, a contact
// channel of the footers or a later entry taken off the plan with one click, brought back exactly, the whole review
// gone back to the original; every result held to the edit gate and Contract B, every refusal coded. Invented club,
// invented template, scripted fake model: no real model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { gateEditedPlan, gateOperatedPlan } from '../domain/plan-edit-gate.mjs'
import { planLocksOf } from '../domain/plan-operation-locks.mjs'
import { OWNER_REMOVED } from '../domain/plan-operations.mjs'
import { goodComposition, scriptedModel, withIntentNotes } from './fixtures/plan-composer/invented-club.mjs'
import { inputs, reply } from './fixtures/plan-composer/intent-kit.mjs'

/** The invented store with a footer that shows the phone, and an in-place header. */
function kitStore(store) {
  const footer = store.blocks.find((b) => b.id === 'footer-main')
  footer.fields.push({ name: 'phone', kind: 'contact.phone', type: 'text', limit: 40 })
  store.blocks.find((b) => b.id === 'header-main').placement = 'in-place'
  return store
}

const editOf = (plan, changes, id = 'edit-base') => ({
  schema: 'tracy-build-plan-edit/v1',
  id,
  plan: { id: plan.id, revision: plan.revision },
  changes: changes.map(([field, value]) => ({ field, value }))
})
const opOf = (plan, operation, id = 'edit-op') => ({
  schema: 'tracy-build-plan-edit/v1',
  id,
  plan: { id: plan.id, revision: plan.revision },
  operation
})

/**
 * The composed plan, passed once through the edit gate (a footer that shows the phone too), so it is the gate's fixed
 * point a restore comes back to.
 */
async function base() {
  const model = scriptedModel(reply(withIntentNotes(goodComposition(), ['km-1', 'km-2'])))
  const input = inputs(model)
  input.blockStore = kitStore(input.blockStore)
  const composed = await composePlan(input)
  const kit = { blockStore: input.blockStore, pageRecipes: input.pageRecipes, library: input.library }
  const footer = composed.plan.pages[0].blocks.find((b) => b.block === 'footer-main')
  const field = `pages[home].blocks[${footer.id}].data`
  const gated = gateEditedPlan({
    plan: composed.plan,
    profile: composed.profile,
    edit: editOf(composed.plan, [[field, ['business-name', 'contact-phone']]]),
    ...kit
  })
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  return { plan: gated.plan, profile: gated.profile, kit }
}

/** Run one operation against `state` (`{plan, profile, review}`), the way the draft store keeps it. */
function operate(state, kit, operation, removal = `removal-${state.review.removals.length + 1}`) {
  const out = gateOperatedPlan({
    plan: state.plan,
    profile: state.profile,
    edit: opOf(state.plan, operation),
    review: state.review,
    removal,
    ...kit
  })
  if (!out.ok) return out
  const removals = out.removal
    ? [...state.review.removals, out.removal]
    : state.review.removals.filter((r) => r.id !== out.restored)
  return { ...out, state: { plan: out.plan, profile: out.profile, review: { ...state.review, removals } } }
}

const startOf = ({ plan, profile }) => ({ plan, profile, review: { base: { plan, profile }, removals: [] } })
const withoutRevision = ({ revision: _r, ...rest }) => rest
const codes = (out) => out.problems.map((p) => p.code)
const owned = (plan) => plan.leftOut.filter((e) => e.code === OWNER_REMOVED)

test('a page taken off leaves the plan valid, says what went with it, and comes back exactly', async () => {
  const b = await base()
  const start = startOf(b)
  const out = operate(start, b.kit, { op: 'remove-page', page: 'team' })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assert.equal(out.plan.revision, b.plan.revision + 1)
  assert.deepEqual(
    out.plan.pages.map((p) => p.id),
    ['home', 'contact']
  )
  assert.deepEqual(checkBuildDocument(out.plan), { ok: true, problems: [] })
  assert.deepEqual(
    owned(out.plan).map((e) => [e.kind, e.what, e.params.removal]),
    [
      ['page', 'Coaches', 'removal-1'],
      ['item', 'Ilse Varrow', 'removal-1']
    ]
  )
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.equal(back.ok, true, JSON.stringify(back.problems))
  assert.equal(back.plan.revision, b.plan.revision + 2)
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
  assert.deepEqual(back.state.review.removals, [])
})

test('the first page, a main section, the site chrome and the last items a section needs stay', async () => {
  const b = await base()
  const s = startOf(b)
  const home = b.plan.pages[0]
  const blockOf = (block) => home.blocks.find((x) => x.block === block).id
  assert.deepEqual(codes(operate(s, b.kit, { op: 'remove-page', page: 'home' })), ['first_page'])
  assert.deepEqual(
    codes(operate(s, b.kit, { op: 'remove-block', page: 'home', block: blockOf('hero-home') })),
    ['main_block']
  )
  assert.deepEqual(
    codes(operate(s, b.kit, { op: 'remove-block', page: 'home', block: blockOf('header-main') })),
    ['site_chrome']
  )
  const gallery = home.blocks.find((x) => x.block === 'gallery-strip')
  const refused = operate(s, b.kit, {
    op: 'remove-item',
    page: 'home',
    block: gallery.id,
    item: gallery.data[0]
  })
  assert.deepEqual(codes(refused), ['too_few_items'])
  assert.deepEqual(refused.problems[0].params, { min: 3 })
  assert.equal(refused.problems[0].message, 'This section needs at least 3 of these, so this one stays.')
  assert.deepEqual(codes(operate(s, b.kit, { op: 'remove-page', page: 'nope' })), ['not_found'])
  assert.deepEqual(codes(operate(s, b.kit, { op: 'restore', removal: 'removal-9' })), ['removal_unknown'])
})

test('the locks come from the kit and the plan: recipes, in-place blocks, item minimums, end and main button', async () => {
  const b = await base()
  const plan = structuredClone(b.plan)
  const contact = plan.pages.find((p) => p.id === 'contact')
  contact.endAction = { block: contact.blocks[0].id, factIds: ['contact-phone'] }
  plan.primaryAction = { factIds: ['contact-phone'] }
  plan.legalPages = [{ kind: 'privacy', use: 'contact', id: 'legal:privacy' }]
  const locks = planLocksOf(plan, b.kit)
  assert.deepEqual(locks.pages, { home: 'first_page', contact: 'privacy_page' })
  assert.equal(locks.blocks[contact.blocks[0].id], 'main_block')
  assert.equal(locks.facts['contact-phone'], 'main_button')
  const services = plan.pages[0].blocks.find((x) => x.block === 'services-grid')
  assert.equal(locks.minItems[services.id], 2)
  const header = plan.pages[0].blocks.find((x) => x.block === 'header-main')
  assert.equal(locks.blocks[header.id], 'site_chrome')
})

test('items come off a section down to its minimum, each kept in the left out list, and come back in place', async () => {
  const b = await base()
  let s = startOf(b)
  const services = b.plan.pages[0].blocks.find((x) => x.block === 'services-grid')
  for (const item of services.data.slice(1, 3)) {
    const out = operate(s, b.kit, { op: 'remove-item', page: 'home', block: services.id, item })
    assert.equal(out.ok, true, JSON.stringify(out.problems))
    s = out.state
  }
  const left = s.plan.pages[0].blocks.find((x) => x.id === services.id).data
  assert.deepEqual(left, [services.data[0], services.data[3]])
  assert.deepEqual(
    owned(s.plan).map((e) => e.item),
    services.data.slice(1, 3)
  )
  const third = operate(s, b.kit, { op: 'remove-item', page: 'home', block: services.id, item: left[0] })
  assert.deepEqual(codes(third), ['too_few_items'])
  // Brought back out of order: each goes back where it was.
  s = operate(s, b.kit, { op: 'restore', removal: 'removal-1' }).state
  s = operate(s, b.kit, { op: 'restore', removal: 'removal-2' }).state
  assert.deepEqual(withoutRevision(s.plan), withoutRevision(b.plan))
})

test('a key message taken off leaves no section carrying it, and comes back to the sections that carried it', async () => {
  const b = await base()
  const out = operate(startOf(b), b.kit, { op: 'remove-key-message', message: 'km-1' })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assert.deepEqual(out.plan.keyMessages, [{ id: 'km-2', label: 'Courts kept in top shape' }])
  const carried = out.plan.pages.flatMap((p) => p.blocks).flatMap((x) => x.carries ?? [])
  assert.deepEqual(carried, ['km-2'])
  assert.deepEqual(
    owned(out.plan).map((e) => [e.kind, e.what]),
    [['feature', 'Coaching for every age']]
  )
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
})

test('a contact channel comes off every footer and the privacy page, not off the main button', async () => {
  const b = await base()
  const out = operate(startOf(b), b.kit, { op: 'remove-channel', fact: 'contact-phone' })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  const footer = out.plan.pages[0].blocks.find((x) => x.block === 'footer-main')
  assert.deepEqual(footer.data, ['business-name'])
  assert.equal(out.plan.legalPages[0].factIds.includes('contact-phone'), false)
  // The phone is still shown on the contact sections, so no detail is left out.
  assert.deepEqual(owned(out.plan), [])
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
  assert.deepEqual(codes(operate(startOf(b), b.kit, { op: 'remove-channel', fact: 'contact-hours' })), [
    'not_a_channel'
  ])
  assert.deepEqual(codes(operate(startOf(b), b.kit, { op: 'remove-channel', fact: 'contact-address' })), [
    'not_in_footer'
  ])
  const pinned = { ...b, plan: { ...b.plan, primaryAction: { factIds: ['contact-phone'] } } }
  assert.deepEqual(codes(operate(startOf(pinned), b.kit, { op: 'remove-channel', fact: 'contact-phone' })), [
    'main_button'
  ])
})

test('a later entry comes off and back; revert goes back to the plan before the first change', async () => {
  const b = await base()
  let s = startOf(b)
  s = operate(s, b.kit, { op: 'remove-later', later: 'later_prices' }).state
  assert.deepEqual(
    s.plan.later.map((e) => e.code),
    ['later_portraits']
  )
  s = operate(s, b.kit, { op: 'remove-page', page: 'team' }).state
  const reverted = operate(s, b.kit, { op: 'revert' })
  assert.equal(reverted.ok, true)
  assert.equal(reverted.plan.revision, s.plan.revision + 1)
  assert.deepEqual(withoutRevision(reverted.plan), withoutRevision(b.plan))
  assert.deepEqual(reverted.profile, b.profile)
})

test('a stale operation and a malformed one are refused before anything changes', async () => {
  const b = await base()
  const stale = gateOperatedPlan({
    plan: b.plan,
    profile: b.profile,
    edit: { ...opOf(b.plan, { op: 'remove-page', page: 'team' }), plan: { id: b.plan.id, revision: 0 } },
    review: { removals: [] },
    removal: 'r',
    ...b.kit
  })
  assert.equal(stale.ok, false)
  assert.match(stale.problems[0].message, /your plan changed in the meantime/)
  const malformed = gateOperatedPlan({
    plan: b.plan,
    profile: b.profile,
    edit: opOf(b.plan, { op: 'remove-page', page: 'team', block: 'x' }),
    review: { removals: [] },
    removal: 'r',
    ...b.kit
  })
  assert.equal(malformed.ok, false)
})

test('the intent notes are edited in place; the search terms keep what the owner added and took off', async () => {
  const b = await base()
  const home = b.plan.pages[0]
  const services = home.blocks.find((x) => x.block === 'services-grid')
  const typed = [...home.seo.searchTerms.slice(1), 'tennis lessons for kids']
  const out = gateEditedPlan({
    plan: b.plan,
    profile: b.profile,
    edit: editOf(b.plan, [
      ['keyMessages[km-1].label', 'Coaching from age four'],
      ['pages[home].keyMessage', 'A club for the whole family.'],
      ['pages[home].seo.titleIntent', 'The club and its courts'],
      [`pages[home].blocks[${services.id}].message`, 'What a member can book.'],
      ['pages[home].seo.searchTerms', typed]
    ]),
    ...b.kit
  })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assert.equal(out.plan.keyMessages[0].label, 'Coaching from age four')
  assert.equal(out.plan.pages[0].keyMessage, 'A club for the whole family.')
  assert.deepEqual(out.plan.pages[0].seo.searchTerms, typed)
  assert.deepEqual(out.plan.pages[0].seo.ownerAdded, ['tennis lessons for kids'])
  assert.deepEqual(out.plan.pages[0].seo.ownerRemoved, [home.seo.searchTerms[0]])
  // A later edit makes the terms again from the data: the owner's choice stays, a renamed service is read again.
  const renamed = gateEditedPlan({
    plan: out.plan,
    profile: out.profile,
    edit: editOf(out.plan, [[`items[${services.data[1]}].label`, 'Evening group lessons']], 'edit-2'),
    ...b.kit
  })
  assert.equal(renamed.ok, true, JSON.stringify(renamed.problems))
  const terms = renamed.plan.pages[0].seo.searchTerms
  assert.equal(terms.includes(home.seo.searchTerms[0]), false)
  assert.equal(terms.includes('tennis lessons for kids'), true)
  assert.equal(terms.includes('Evening group lessons'), true)
  // The other pages had no owner terms: they are made again, untouched by the marks.
  assert.equal(renamed.plan.pages[1].seo.ownerAdded, undefined)
})

test('a search term list the card cannot save is refused with its code', async () => {
  const b = await base()
  const terms = b.plan.pages[0].seo.searchTerms
  const tryTerms = (value) =>
    codes(
      gateEditedPlan({
        plan: b.plan,
        profile: b.profile,
        edit: editOf(b.plan, [['pages[home].seo.searchTerms', value]]),
        ...b.kit
      })
    )
  assert.deepEqual(tryTerms([]), ['search_terms_empty'])
  assert.deepEqual(tryTerms([...terms, 'x'.repeat(61)]), ['search_term_too_long'])
  assert.deepEqual(tryTerms([...terms, terms[0].toUpperCase()]), ['search_term_twice'])
  assert.deepEqual(tryTerms(Array.from({ length: 11 }, (_, i) => `term ${i}`)), ['too_many_search_terms'])
})

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

/** Every operation the card could send on `plan`, refused or not. */
function candidatesOf(state) {
  const { plan } = state
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
  for (const r of state.review.removals) ops.push({ op: 'restore', removal: r.id })
  return ops
}

test('hundreds of random operations leave every plan valid, and undoing them all gives back the original', async () => {
  const b = await base()
  for (const seed of [1, 7, 42]) {
    const random = randomOf(seed)
    let s = startOf(b)
    let n = 0
    for (let step = 0; step < 120; step++) {
      const ops = candidatesOf(s)
      const op = ops[Math.floor(random() * ops.length)]
      const out = operate(s, b.kit, op, `removal-${seed}-${n++}`)
      if (!out.ok) {
        assert.ok(
          out.problems.every((p) => typeof p.code === 'string'),
          JSON.stringify(out.problems)
        )
        continue
      }
      assert.deepEqual(
        checkBuildDocument(out.plan).problems,
        [],
        `seed ${seed} step ${step} ${JSON.stringify(op)}`
      )
      assert.equal(out.plan.revision, s.plan.revision + 1)
      s = out.state
    }
    while (s.review.removals.length) {
      const last = s.review.removals.at(-1)
      const out = operate(s, b.kit, { op: 'restore', removal: last.id })
      assert.equal(out.ok, true, `seed ${seed} restore ${last.id}: ${JSON.stringify(out.problems)}`)
      s = out.state
    }
    assert.deepEqual(withoutRevision(s.plan), withoutRevision(b.plan), `seed ${seed}`)
  }
})
