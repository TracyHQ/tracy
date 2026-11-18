// The owner's marks on a page's search terms follow every edit of the list (#575 stand): a term the owner added and
// then takes off again leaves `seo.ownerAdded`, a term code makes and the owner took off leaves `seo.ownerRemoved`
// when the owner types it back, an undo of an added term takes its mark too, and a change request keeps the result.
// Each step is a second edit of the same list: one edit of it from a plan without marks never showed the problem.
// Invented club, scripted fake model: no real model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-search-term-marks.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { goodComposition, withIntentNotes } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

const FIELD = 'pages[home].seo.searchTerms'
const ADDED = 'tennis lessons for kids'
let n = 0
const editOf = (plan, value) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: `edit-terms-${++n}`,
  plan: { id: plan.id, revision: plan.revision },
  changes: [{ field: FIELD, value }]
})

/** One edit of the home page's terms on `state`, which must be saved. */
function setTerms(state, value) {
  const out = gateEditedPlan({
    plan: state.plan,
    profile: state.profile,
    edit: editOf(state.plan, value),
    ...kit()
  })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assert.deepEqual(checkBuildDocument(out.plan).problems, [])
  return { plan: out.plan, profile: out.profile }
}
const seoOf = (state) => state.plan.pages.find((p) => p.id === 'home').seo
const start = async () => {
  const first = await firstPlan(withIntentNotes(goodComposition()))
  assert.ok(seoOf(first).searchTerms.length > 1, 'the home page has search terms')
  return first
}

test('a term the owner added can be taken off again, and leaves no mark', async () => {
  const first = await start()
  const made = seoOf(first).searchTerms
  const added = setTerms(first, [...made, ADDED])
  assert.deepEqual(seoOf(added).ownerAdded, [ADDED])
  const removed = setTerms(added, made)
  assert.deepEqual(seoOf(removed).searchTerms, made)
  assert.equal(seoOf(removed).ownerAdded, undefined)
  assert.equal(seoOf(removed).ownerRemoved, undefined, 'an owner term taken off is no term code made')
})

test('a term code made that the owner took off can be typed back, and its mark goes', async () => {
  const first = await start()
  const made = seoOf(first).searchTerms
  const removed = setTerms(first, made.slice(1))
  assert.deepEqual(seoOf(removed).ownerRemoved, [made[0]])
  const back = setTerms(removed, [...made.slice(1), made[0]])
  assert.ok(seoOf(back).searchTerms.includes(made[0]))
  assert.equal(seoOf(back).ownerRemoved, undefined)
  assert.equal(seoOf(back).ownerAdded, undefined, 'a term code makes is never the owner own')
})

test('an undo of an added term (the edit back to the list before) takes its mark too', async () => {
  const first = await start()
  const made = seoOf(first).searchTerms
  const added = setTerms(first, [...made, ADDED])
  // The draft store's undo is an edit that sets the field back to its value before (`undoEditOf`).
  const undone = setTerms(added, seoOf(first).searchTerms)
  assert.deepEqual(seoOf(undone), seoOf(first))
})

test('add, take off again, then a change request: the rebuilt plan keeps the result', async () => {
  const first = await start()
  const made = seoOf(first).searchTerms
  const added = setTerms(first, [...made, ADDED])
  const removed = setTerms(added, made.slice(1))
  const reviews = removed.plan.pages[0].blocks.find(
    (b) => b.type === 'reviews' || b.block === 'reviews-strip'
  )
  assert.ok(reviews, 'the home page has a reviews section')
  const { input } = revision(
    removed,
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  const seo = result.plan.pages.find((p) => p.id === 'home').seo
  assert.equal(seo.searchTerms.includes(ADDED), false, JSON.stringify(seo))
  assert.equal(seo.searchTerms.includes(made[0]), false, JSON.stringify(seo))
  assert.equal(seo.ownerAdded, undefined)
  assert.deepEqual(seo.ownerRemoved, [made[0]])
  assert.ok(checkBuildDocument(result.plan).ok)
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

test('random adds and removals of search terms are all saved, and the marks always match the list', async () => {
  const first = await start()
  const made = seoOf(first).searchTerms
  const pool = [...made, ADDED, 'court hire near me', 'cardio tennis class']
  for (const seed of [5, 17, 41]) {
    const random = randomOf(seed)
    let s = first
    for (let step = 0; step < 40; step++) {
      const terms = seoOf(s).searchTerms
      const missing = pool.filter((t) => !terms.includes(t))
      const add = missing.length > 0 && (terms.length <= 1 || random() < 0.5)
      const pick = (items) => Math.floor(random() * items.length)
      const gone = add ? -1 : pick(terms)
      const next = add ? [...terms, missing[pick(missing)]].slice(0, 10) : terms.filter((_, i) => i !== gone)
      s = setTerms(s, next)
      const seo = seoOf(s)
      // The same terms; the order is the plan's: the terms code makes first, then the owner's own.
      assert.deepEqual([...seo.searchTerms].sort(), [...next].sort(), `seed ${seed} step ${step}`)
      const own = seo.searchTerms.findIndex((t) => !made.includes(t))
      if (own >= 0)
        assert.ok(
          seo.searchTerms.slice(own).every((t) => !made.includes(t)),
          `${seed}/${step}`
        )
      for (const t of seo.ownerAdded ?? [])
        assert.ok(!made.includes(t) && next.includes(t), `${seed}/${step} ${t}`)
      for (const t of seo.ownerRemoved ?? [])
        assert.ok(made.includes(t) && !next.includes(t), `${seed}/${step} ${t}`)
    }
  }
})
