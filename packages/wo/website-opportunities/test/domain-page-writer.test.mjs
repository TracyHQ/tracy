// The page writer (ticket #594): one call to a scripted fake build model per page, pages written in parallel, each call
// with exactly its page's fields, types and limits and the plan data, never demo copy; a pure check right after; only
// failing fields are rewritten, once; a field that still fails throws a typed error. No test calls a real model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PAGE_WRITER_PROMPT, PageWriterError, writePages } from '../domain/page-writer.mjs'
import { siteCopyError } from '../domain/page-writer-site-check.mjs'
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

/** Answers like `answer`, with the page's search details from `seo(user)` when the call asks for them. */
const withSeo = (seo, override) => (request) => {
  const user = JSON.parse(request.user)
  const out = JSON.parse(answer(override)(request))
  return JSON.stringify(user.seo ? { ...out, seo: seo(user) } : out)
}

test('the writer follows the business voice: the profile voice reaches every call, its avoid list is held', async () => {
  const { plan, profile } = await approvedPlan()
  profile.voice = { summary: 'Warm and practical.', ownWords: ['rackets up'], avoid: ['elite'] }
  const seen = {}
  const model = overlappingModel((request) => {
    const page = pageOf(request)
    seen[page] = (seen[page] ?? 0) + 1
    return answer((f) => (f.key === 'home-b2/heading' && seen[page] === 1 ? 'Elite coaching' : undefined))(
      request
    )
  })
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  for (const call of model.calls) assert.deepEqual(JSON.parse(call.user).voice, profile.voice)
  const rewrite = JSON.parse(model.calls.filter((c) => pageOf(c) === 'home')[1].user).rewrite
  assert.deepEqual(
    rewrite.map((r) => r.key),
    ['home-b2/heading']
  )
  assert.match(rewrite[0].problems[0], /avoids/)
  assert.notEqual(pages[0].fields.find((f) => f.key === 'home-b2/heading').value, 'Elite coaching')
  assert.match(PAGE_WRITER_PROMPT, /never about the page/)
  assert.match(PAGE_WRITER_PROMPT, /contact channel/)
})

test('a sentence another page already says is rewritten on the later page, once; still repeated is a typed error', async () => {
  const { plan, profile } = await approvedPlan()
  const SAME = 'Coaching for all ages here'
  const seen = {}
  const model = overlappingModel((request) => {
    const page = pageOf(request)
    seen[page] = (seen[page] ?? 0) + 1
    return answer((f) =>
      (f.key === 'home-b2/heading' || f.key === 'team-b1/heading') && seen[page] === 1 ? SAME : undefined
    )(request)
  })
  const { pages } = await writePages({ plan, profile, blockStore: blockStore(), library: library(), model })
  assert.equal(model.calls.length, WRITTEN.length + 1, 'only the later page is called again')
  const again = JSON.parse(model.calls.at(-1).user)
  assert.equal(again.page.id, 'team')
  assert.deepEqual(
    again.rewrite.map((r) => r.key),
    ['team-b1/heading']
  )
  assert.match(again.rewrite[0].problems[0], /repeats home: home-b2\/heading/)
  assert.equal(pages[0].fields.find((f) => f.key === 'home-b2/heading').value, SAME)
  const stubborn = overlappingModel(
    answer((f) => (f.key === 'home-b2/heading' || f.key === 'team-b1/heading' ? SAME : undefined))
  )
  await assert.rejects(
    writePages({ plan, profile, blockStore: blockStore(), library: library(), model: stubborn }),
    (error) => {
      assert.equal(error.code, 'copy_check_failed')
      assert.deepEqual(
        error.details.failing.map((f) => [f.page, f.key, f.problems[0].code]),
        [['team', 'team-b1/heading', 'repeated_copy']]
      )
      return true
    }
  )
})

test('copy of pages written by another writer step is held against this page', async () => {
  const { plan, profile } = await approvedPlan()
  const SAME = 'Coaching for every age'
  const others = [{ id: 'home', fields: [{ key: 'home-b2/heading', from: 'writer', value: SAME }] }]
  const model = overlappingModel(answer((f) => (f.key === 'team-b1/heading' ? SAME : undefined)))
  const team = plan.pages.find((p) => p.id === 'team')
  await assert.rejects(
    writePages({
      plan: { ...plan, pages: [team] },
      profile,
      blockStore: blockStore(),
      library: library(),
      model,
      others
    }),
    (error) =>
      error.code === 'copy_check_failed' && error.details.failing[0].problems[0].code === 'repeated_copy'
  )
  assert.equal(model.calls.length, 2)
})

test('the writer writes each page search title and description within the template limits, unique across pages', async () => {
  const { plan, profile } = await approvedPlan()
  const mapping = { seo: { titleLimit: 40, descriptionLimit: 120 } }
  const seen = {}
  const model = overlappingModel((request) => {
    const page = pageOf(request)
    seen[page] = (seen[page] ?? 0) + 1
    return withSeo((user) =>
      user.page.id === 'team' && seen[page] === 1
        ? { title: 'Brindlewick Tennis Club', description: 'x'.repeat(121) }
        : user.page.id === 'team'
          ? { title: 'Coaches of Brindlewick Tennis Club', description: 'Meet the coaches of the club.' }
          : { title: 'Brindlewick Tennis Club', description: 'Tennis lessons and court hire in Fernhollow.' }
    )(request)
  })
  const { pages } = await writePages({
    plan,
    profile,
    blockStore: blockStore(),
    library: library(),
    mapping,
    model
  })
  const first = JSON.parse(model.calls[0].user)
  assert.deepEqual(first.seo, { titleLimit: 40, descriptionLimit: 120 })
  const again = JSON.parse(model.calls.at(-1).user)
  assert.equal(again.page.id, 'team')
  assert.deepEqual(again.rewrite.map((r) => [r.key, r.problems.length]).sort(), [
    ['seo.description', 1],
    ['seo.title', 1]
  ])
  assert.deepEqual(again.seo, { titleLimit: 40, descriptionLimit: 120 })
  assert.deepEqual(pages.find((p) => p.id === 'home').seo, {
    title: 'Brindlewick Tennis Club',
    description: 'Tennis lessons and court hire in Fernhollow.'
  })
  assert.equal(pages.find((p) => p.id === 'team').seo.title, 'Coaches of Brindlewick Tennis Club')
  assert.equal(pages.find((p) => p.id === 'contact').seo, undefined, 'a page with no call has no written seo')
})

test('after parallel writer steps, the site check names the later page to write again', async () => {
  const { plan, profile } = await approvedPlan()
  const written = await writePages({
    plan,
    profile,
    blockStore: blockStore(),
    library: library(),
    model: overlappingModel(answer())
  })
  assert.equal(siteCopyError({ pages: written.pages, profile }), null)
  const [home, team] = written.pages
  home.fields.find((f) => f.key === 'home-b2/heading').value = 'Coaching for all ages here'
  team.fields.find((f) => f.key === 'team-b1/heading').value = 'Coaching for all ages here'
  const error = siteCopyError({ pages: written.pages, profile })
  assert.ok(error instanceof PageWriterError)
  assert.equal(error.code, 'site_copy_failed')
  assert.equal(error.noRerun, undefined)
  assert.deepEqual(error.details.pages, ['team'])
  assert.deepEqual(error.details.failing, [
    { page: 'team', key: 'team-b1/heading', problems: [{ code: 'repeated_copy' }] }
  ])
})
