// Nothing of the needs profile disappears from a plan without a report (ticket #593): every fact and every item is
// shown in a block, placed by the gate's rules, or left out with a reason. Counted on the invented club and on
// adversarial compositions. No model is called here.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  COACH,
  PHOTOS,
  blockStore,
  brand,
  clubProfile,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const CONTACT_FACTS = ['contact-phone', 'contact-email', 'contact-address', 'contact-hours']
const contextOf = (profile = clubProfile(), store = blockStore()) =>
  composerContextOf({
    profile,
    blockStore: store,
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const without = (c, ...ids) => {
  for (const page of c.pages) page.blocks = page.blocks.filter((b) => !ids.includes(b.block))
  c.pages = c.pages.filter((p) => p.blocks.length > 0)
  return c
}
const where = (plan, id) =>
  plan.pages.flatMap((p) => p.blocks.filter((b) => b.data.includes(id)).map((b) => b.block))

test('facts no block shows are placed in a block with a field for them, or left out with a reason', () => {
  const result = gatePlan(without(goodComposition(), 'contact-strip'), contextOf())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const { plan, placed } = result
  // The contact strip comes back on the home page (its recipe lists it) for the phone, the address and the hours.
  for (const id of ['contact-phone', 'contact-address', 'contact-hours'])
    assert.deepEqual(where(plan, id), ['contact-strip'])
  assert.deepEqual(
    placed.filter((p) => CONTACT_FACTS.includes(p.item)).map((p) => p.how),
    [
      'template block with a field for it',
      'block on the plan with a field for it',
      'block on the plan with a field for it'
    ]
  )
  // No block of the template declares an email field: the email is reported, not dropped.
  const email = plan.leftOut.find((e) => e.what === 'Email')
  assert.match(email.reason, /No section of the template has a place for your email/)
  assert.equal(checkBuildDocument(plan).ok, true)
})

const ADVERSARIAL = {
  'the good composition': goodComposition(),
  'no contact block anywhere': without(goodComposition(), 'contact-strip'),
  'no gallery block': without(goodComposition(), 'gallery-strip'),
  'no services block': without(goodComposition(), 'services-grid'),
  'no team page': without(goodComposition(), 'team-cards'),
  'only the home page main block': {
    pages: [
      {
        pageType: 'home',
        name: 'Home',
        blocks: [{ block: 'hero-home', label: 'Top', data: ['business-name'], reason: 'Your name first.' }]
      }
    ]
  },
  'everything left out by the model': (() => {
    const c = without(goodComposition(), 'team-cards', 'gallery-strip')
    c.leftOut.push(
      { item: COACH, reason: 'Kept for later.' },
      ...PHOTOS.map((item) => ({ item, reason: 'Kept for later.' }))
    )
    return c
  })()
}

for (const [profileName, profile] of [
  ['club', clubProfile],
  ['club with conflicts', conflictedClubProfile]
])
  for (const [name, composition] of Object.entries(ADVERSARIAL))
    test(`accounting (${profileName}, ${name}): total = shown + placed + left out, zero unexplained`, () => {
      const context = contextOf(profile())
      const result = gatePlan(structuredClone(composition), context)
      assert.equal(result.ok, true, JSON.stringify(result.problems))
      const { total, shown, placed, leftOut, unexplained } = result.accounting
      console.log(
        `${profileName} / ${name}: ${total} = ${shown.length} shown + ${placed.length} placed + ${leftOut.length} left out`
      )
      assert.equal(total, context.data.byId.size)
      assert.equal(shown.length + placed.length + leftOut.length, total)
      assert.deepEqual(unexplained, [])
      // Each left out id has an entry with a reason in the plan.
      const labels = new Set(result.plan.leftOut.filter((e) => e.reason).map((e) => e.what))
      for (const id of leftOut) {
        const record = context.data.byId.get(id)
        const label = record.itemField
          ? context.data.byId.get(record.itemField.item).entry.label
          : record.entry.label
        assert.ok(labels.has(label), `${id} (${label}) has no left out entry`)
      }
      assert.equal(checkBuildDocument(result.plan).ok, true)
    })
