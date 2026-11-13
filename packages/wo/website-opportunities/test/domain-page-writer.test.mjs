// The page writer (ticket #594): one call to a scripted fake build model per page, pages written in parallel, each call
// with exactly its page's fields, types and limits and the plan data, never demo copy; a pure check right after; only
// failing fields are rewritten, once; a field that still fails throws a typed error. No test calls a real model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PAGE_WRITER_PROMPT, PageWriterError, writePages } from '../domain/page-writer.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const DEMO = 'Welcome to the demo club of the template'
/** The pages with a copy field: the contact page shows data fields only, so it needs no call. */
const WRITTEN = ['home', 'team']

async function approvedPlan(language) {
  const profile = clubProfile()
  if (language) profile.language = { ...profile.language, value: language }
  const { plan } = await composePlan({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  return { plan, profile }
}

/** A value that fits a field: short, never padded. */
const fitting = (field) => `${field.name} ok`.slice(0, field.limit)

/** Answers every asked field with a fitting value, except the keys `override` answers. */
const answer =
  (override = () => undefined) =>
  (request) => {
    const user = JSON.parse(request.user)
    const fields = {}
    for (const block of user.blocks)
      for (const field of block.fields) fields[field.key] = override(field, user) ?? fitting(field)
    return JSON.stringify({ fields })
  }

/** A fake model that tracks how many calls are open at once; each call waits a little before it answers. */
function overlappingModel(reply) {
  let open = 0
  const calls = []
  const model = async (request) => {
    calls.push(request)
    open += 1
    model.maxOpen = Math.max(model.maxOpen, open)
    await new Promise((resolve) => setTimeout(resolve, 20))
    open -= 1
    return reply(request)
  }
  return Object.assign(model, { calls, maxOpen: 0 })
}

const pageOf = (request) => JSON.parse(request.user).page.id

test('pages are written in parallel, one call per page, each with only its own fields and no demo copy', async () => {
  const { plan, profile } = await approvedPlan()
  const store = blockStore()
  store.blocks[1].demo = { heading: DEMO }
  store.blocks[1].fields[0].example = DEMO
  const model = overlappingModel(answer())
  const { pages, prompt } = await writePages({ plan, profile, blockStore: store, library: library(), model })
  assert.equal(model.calls.length, WRITTEN.length)
  assert.equal(model.maxOpen, WRITTEN.length, 'every page call is open at the same time')
  assert.deepEqual(model.calls.map(pageOf).sort(), WRITTEN)
  assert.equal(prompt.file, 'page-writer-prompt.md')
  assert.match(PAGE_WRITER_PROMPT, /DRAFT, not approved/)
  for (const call of model.calls) {
    assert.equal(call.system, PAGE_WRITER_PROMPT)
    assert.ok(!call.user.includes(DEMO))
    assert.doesNotMatch(call.user, /"(demo|example)"/)
    const user = JSON.parse(call.user)
    assert.equal(user.language, 'en')
    for (const block of user.blocks) {
      assert.ok(block.id.startsWith(`${user.page.id}-`), `${block.id} belongs to ${user.page.id}`)
      for (const field of block.fields) {
        assert.equal(field.type, 'text')
        assert.ok(Number.isInteger(field.limit))
      }
    }
  }
  const home = JSON.parse(model.calls.find((c) => pageOf(c) === 'home').user)
  const services = home.blocks.find((b) => b.id === 'home-b3')
  assert.deepEqual(
    services.fields.map((f) => f.key),
    ['home-b3/heading'],
    'copy fields only: the service names are data, the price (number) and the icon are not written'
  )
  assert.deepEqual(
    services.shows.map((f) => f.value),
    ['Junior coaching', 'Adult group lessons', 'Court hire', 'Cardio tennis']
  )
  assert.equal(services.data[0].fields['offering.name'], 'Junior coaching')
  assert.ok(!home.blocks.some((b) => b.fields.some((f) => f.name === 'sticky' || f.name === 'background')))
  assert.ok(!home.blocks.some((b) => b.id === 'home-b4'), 'the gallery has no text field to write')
  const written = pages.flatMap((p) => p.fields).filter((f) => f.from !== 'no-data')
  assert.ok(written.every((c) => typeof c.value === 'string' && c.value.length > 0))
})

test('copy is written in the language the business uses publicly', async () => {
  const { plan, profile } = await approvedPlan('de')
  const model = overlappingModel(answer())
  await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  assert.equal(plan.language, 'de')
  assert.ok(model.calls.every((c) => JSON.parse(c.user).language === 'de'))
})

test('only failing fields are rewritten, once, and the rewrite keeps the good fields', async () => {
  const { plan, profile } = await approvedPlan()
  const tooLong = 'x'.repeat(43)
  const replies = {
    home: [
      answer((f) => (f.key === 'home-b2/heading' ? tooLong : f.key === 'home-b1/cta_label' ? 7 : undefined)),
      answer((f) => (f.key === 'home-b2/heading' ? 'Courts open all week' : undefined))
    ]
  }
  const seen = {}
  const model = overlappingModel((request) => {
    const page = pageOf(request)
    seen[page] = (seen[page] ?? 0) + 1
    return (replies[page]?.[seen[page] - 1] ?? answer())(request)
  })
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  const homeCalls = model.calls.filter((c) => pageOf(c) === 'home').map((c) => JSON.parse(c.user))
  assert.equal(homeCalls.length, 2)
  assert.equal(model.calls.length, WRITTEN.length + 1, 'pages that passed are not called again')
  const asked = homeCalls[1].blocks.flatMap((b) => b.fields.map((f) => f.key)).sort()
  assert.deepEqual(asked, ['home-b1/cta_label', 'home-b2/heading'])
  assert.deepEqual(homeCalls[1].rewrite.map((r) => r.key).sort(), asked)
  const heading = homeCalls[1].rewrite.find((r) => r.key === 'home-b2/heading')
  assert.equal(heading.written, tooLong)
  assert.match(heading.problems[0], /43 characters, the field holds at most 42/)
  const home = pages.find((p) => p.id === 'home')
  assert.equal(home.fields.find((c) => c.key === 'home-b2/heading').value, 'Courts open all week')
  assert.equal(home.fields.find((c) => c.key === 'home-b3/heading').value, 'heading ok')
  assert.deepEqual(home.attempts.at(-1).failing, [])
})

test('a field that still fails after the rewrite throws a typed error with the failing fields', async () => {
  const { plan, profile } = await approvedPlan()
  const model = overlappingModel(answer((f) => (f.key === 'team-b1/heading' ? 'y'.repeat(31) : undefined)))
  await assert.rejects(
    writePages({ plan, profile, blockStore: blockStore(), library: library(), model }),
    (error) => {
      assert.ok(error instanceof PageWriterError)
      assert.equal(error.code, 'copy_check_failed')
      assert.deepEqual(
        error.details.failing.map((f) => [f.page, f.key, f.problems[0].code]),
        [['team', 'team-b1/heading', 'over_limit']]
      )
      return true
    }
  )
  assert.equal(model.calls.filter((c) => pageOf(c) === 'team').length, 2, 'rewritten at most once')
})

test('an unreadable reply sends every field back once; a failing model call is a typed error', async () => {
  const { plan, profile } = await approvedPlan()
  const seen = {}
  const model = overlappingModel((request) => {
    const page = pageOf(request)
    seen[page] = (seen[page] ?? 0) + 1
    return page === 'team' && seen[page] === 1 ? 'not json' : answer()(request)
  })
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  const team = pages.find((p) => p.id === 'team')
  assert.equal(team.attempts.length, 2)
  assert.deepEqual(team.attempts[1].asked, team.attempts[0].asked)
  const broken = async () => {
    throw new Error('door closed')
  }
  await assert.rejects(
    writePages({ plan, profile, blockStore: blockStore(), library: library(), model: broken }),
    (error) => error instanceof PageWriterError && error.code === 'writer_call_failed'
  )
})
