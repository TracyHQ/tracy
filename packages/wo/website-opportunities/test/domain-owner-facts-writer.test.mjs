// The owner's facts reach the site in the writer's own words (decision D46, #609), end to end from the reading of the
// owner's chat statement to the written pages: a service named by seven of the owner's words leaves the name field
// for the owner's facts, rides through the research, the needs profile and the plan data, is placed on one block and
// said in other words; a writer that copies the owner is asked once to rewrite, then the build stops typed; a held
// person never reaches the writer request in any form. Invented club, scripted fakes, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-facts-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldPersonFormsOf } from '../domain/held-person-forms.mjs'
import { OWNER_FACT_USE, placeOwnerFacts } from '../domain/page-writer-owner-facts.mjs'
import { PageWriterError } from '../domain/page-writer.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  FITTING,
  HELD,
  STORY,
  factWriter,
  ownerBrief,
  ownerPlan,
  writeOwnerPlan
} from './fixtures/owner-statement/club-owner-facts.mjs'

const REWORDED = 'Racket fitting is free'
const ownerEntries = (call) =>
  JSON.parse(call.user).blocks.flatMap((b) =>
    b.data.filter((d) => d.kind === 'owner.fact').map((d) => [b.id, d])
  )

test('a seven word service of the owner arrives on the site, in other words, on the block that shows services', async () => {
  const brief = ownerBrief()
  assert.deepEqual(
    brief.reading.ownerFacts.map((f) => [f.group, f.text]),
    [
      ['services', FITTING],
      ['story', STORY]
    ]
  )
  const built = await ownerPlan(brief)
  assert.deepEqual(
    built.profile.ownerFacts.map((f) => f.text),
    [FITTING, STORY]
  )
  // Never a plan fact or item: the composer never read them.
  assert.ok(!JSON.stringify(built.plan).includes(FITTING))
  // The story fact said with its year: a year the plan data holds only as an owner's fact, never refused as invented.
  const said = { [FITTING]: REWORDED, [STORY]: 'Our courts date from 1998' }
  const model = factWriter((fact, field) => (field.limit >= 25 ? said[fact.value] : undefined))
  const written = await writeOwnerPlan(built, model)
  const entries = model.calls.flatMap(ownerEntries)
  assert.deepEqual(
    entries.map(([block, d]) => [block, d.value, d.use]),
    [
      ['home-b2', STORY, OWNER_FACT_USE],
      ['home-b3', FITTING, OWNER_FACT_USE]
    ]
  )
  const value = (key) => written.pages.flatMap((p) => p.fields).find((f) => f.key === key).value
  assert.equal(value('home-b3/heading'), REWORDED)
  assert.equal(value('home-b2/heading'), 'Our courts date from 1998')
  assert.deepEqual(written.ownerFacts.unplaced, [])
  assert.deepEqual(
    written.ownerFacts.placed.map((p) => p.block),
    ['home-b3', 'home-b2']
  )
})

test('a writer that copies the owner is asked once for other words, then the build stops typed', async () => {
  const built = await ownerPlan(ownerBrief())
  const copied = 'free racket fitting before the'
  const model = factWriter((fact, field) =>
    fact.value === FITTING ? copied.slice(0, field.limit) : undefined
  )
  const error = await writeOwnerPlan(built, model).then(
    () => null,
    (e) => e
  )
  assert.ok(error instanceof PageWriterError)
  assert.equal(error.code, 'copy_check_failed')
  assert.equal(error.noRerun, true)
  assert.deepEqual(error.details.failing, [
    { page: 'home', key: 'home-b3/heading', problems: [{ code: 'copies_owner' }] }
  ])
  const home = model.calls.filter((c) => JSON.parse(c.user).page.id === 'home')
  assert.equal(home.length, 2, 'the first writing and one rewrite')
  const rewrite = JSON.parse(home[1].user).rewrite
  assert.deepEqual(
    rewrite.map((r) => r.key),
    ['home-b3/heading']
  )
  assert.match(rewrite[0].problems[0], /other words/)
  assert.ok(!rewrite[0].problems[0].includes('Every new member'), 'the problem never quotes the owner')
  // The same words with no statement given: nothing copies, nothing is refused.
  const quiet = await writeOwnerPlan(
    built,
    factWriter(() => undefined),
    null
  )
  assert.equal(quiet.pages.length, 3)
})

test("a business value the owner also typed is the data's wording: written as it is, it copies no one", async () => {
  const built = await ownerPlan(ownerBrief())
  const model = factWriter((fact) =>
    fact.value === STORY ? 'Visit 14 Quillmoor Lane, Fernhollow' : undefined
  )
  const written = await writeOwnerPlan(built, model)
  assert.equal(model.calls.length, 2, 'one call per page, no rewrite')
  assert.ok(
    written.pages.flatMap((p) => p.fields).some((f) => f.value === 'Visit 14 Quillmoor Lane, Fernhollow')
  )
})

test('a held person named in the statement reaches no writer request, in any form', async () => {
  const extra = [
    { id: 'of_held_1', kind: 'owner-fact', group: 'story', text: 'Odalys runs the junior squad', source: {} },
    {
      id: 'of_held_2',
      kind: 'owner-fact',
      group: 'facts',
      text: 'juniors train with O Brenwick',
      source: {}
    },
    {
      id: 'of_tag',
      kind: 'owner-tagline',
      group: 'keyMessages',
      text: 'Serve it up',
      source: {},
      reason: 'awaits_product_decision'
    }
  ]
  const brief = ownerBrief({ held: true, extra })
  const built = await ownerPlan(brief)
  const ids = built.research.setAside.filter((s) => s.what === 'owner fact')
  assert.deepEqual(
    ids.map((s) => [s.id, s.reason]),
    [
      ['of_held_1', 'it names a text the owner keeps off the site'],
      ['of_held_2', 'it names a text the owner keeps off the site'],
      ['of_tag', 'awaits_product_decision']
    ]
  )
  // A profile that carries one anyway (an older research) still keeps it from the plan data.
  const leaked = {
    ...built.profile,
    ownerFacts: [...built.profile.ownerFacts, { id: 'x', group: 'story', text: `${HELD} coaches` }]
  }
  assert.ok(!planDataOf(leaked).ownerFacts.some((f) => f.id === 'x'))
  const model = factWriter()
  await writeOwnerPlan(built, model)
  const bytes = model.calls.map((c) => c.user).join('\n')
  const { forms, firstCased } = heldPersonFormsOf(HELD)
  for (const form of [...forms, firstCased, 'Brenwick'].filter(Boolean))
    assert.ok(!bytes.toLowerCase().includes(form.toLowerCase()), `the request names ${form}`)
  assert.ok(bytes.includes(FITTING), 'the facts that name no one still arrive')
})

test('a fact no block can say is reported with its reason, never forced onto a page', async () => {
  const built = await ownerPlan(ownerBrief())
  const plan = { ...built.plan, pages: built.plan.pages.filter((p) => p.pageType !== 'home') }
  const context = {
    data: {
      ownerFacts: [
        { id: 'f1', group: 'services', text: FITTING },
        { id: 'f2', group: 'story', text: 'x' }
      ],
      byId: new Map()
    }
  }
  const out = placeOwnerFacts(
    plan,
    context,
    plan.pages.map(() => [])
  )
  assert.deepEqual(out.placed, [])
  assert.deepEqual(
    out.unplaced.map((u) => [u.id, u.reason]),
    [
      ['f1', 'no block of the plan shows a service and has a copy field'],
      ['f2', 'the home page has no copy field']
    ]
  )
})

test('while the business name is held, a fact naming it is set aside by id, never carried', () => {
  const brief = {
    business: { name: 'Quillmoor Tennis' },
    facts: [{ field: 'name', onSite: false, value: 'Quillmoor Tennis' }],
    reading: {
      ownerFacts: [
        { id: 'of_a', kind: 'owner-fact', group: 'story', text: 'Quillmoor Tennis began in a barn' },
        { id: 'of_b', kind: 'owner-fact', group: 'story', text: 'four courts under lights' }
      ]
    }
  }
  const owner = researchOf(brief).sources.find((s) => s.id === 'owner-statement')
  assert.deepEqual(owner.ownerFacts, [{ id: 'of_b', group: 'story', text: 'four courts under lights' }])
})
