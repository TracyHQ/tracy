// The business reading of the build chat's research (#609, `build-draft/gather-reading.js`), as the app wires it
// (`build-draft-gather-wiring.js` `preSiteGatherer`): the Website Opportunities reading step is the real one, only its
// model door and the fetch its call goes out through are fakes, answering what an invented model would. Every business,
// person, price and link is invented. No database, no network, no key.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-reading.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from 'website-opportunities/domain'
import { BUSINESS_READING_SYSTEM } from 'website-opportunities/domain/business-reading.mjs'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import {
  MAPS,
  SITE,
  connector,
  fakeDomain,
  placeDetails,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'

const CLASSES = 'https://hollowmere-bakehouse.example/classes'
const CLASS_LINE = 'Sourdough class for beginners, Saturday mornings, $45 a seat.'
const GYM = 'https://larkfen-boxing.example/'
const PRICING = 'https://larkfen-boxing.example/pricing'
const PRICE_LINE = 'Beginner boxing classes, unlimited monthly membership $79 monthly.'
const READY = {
  state: 'ready',
  door: {
    url: 'https://llm.example/v1/chat/completions',
    key: 'test-key',
    model: 'invented-model',
    effort: 'off'
  }
}
const noFetch = async () => assert.fail('no fetch outside the fakes')

/** The invented bakery's website with a classes page that states a class and its price. */
const withClasses = () => ({
  ...websiteResult(),
  pages: [...websiteResult().pages, { url: CLASSES, title: 'Classes', text: CLASS_LINE }]
})

/** An invented boxing gym's website: its home page and its pricing page, which states a class and its price. */
const gymSite = () => ({
  source: 'website',
  status: 'complete',
  reason: null,
  coverage: { fetched: 2 },
  profile: {
    name: 'Larkfen Boxing Club',
    phone: '+1 555 0177 204',
    address: '4 Marrow Street, Brackenford',
    bio: 'A boxing gym for every level.',
    businessType: 'ExerciseGym',
    links: []
  },
  pages: [
    { url: GYM, title: 'Larkfen Boxing Club', text: 'Larkfen Boxing Club. A boxing gym for every level.' },
    { url: PRICING, title: 'Pricing', text: PRICE_LINE }
  ],
  media: [],
  posts: []
})

/** The answer of the invented model to the gym's reading: its classes and their price, quoted from the pricing page. */
const gymAnswer = (prompt) => ({
  services: [
    {
      name: 'Beginner boxing classes',
      quote: PRICE_LINE,
      ref: refOf(prompt, 'Beginner boxing'),
      price: '$79 monthly'
    }
  ]
})

/** The ref the reading gave the text that starts with `start` (`[ref] (kind)` then the text, in the prompt). */
function refOf(prompt, start) {
  const found = [...prompt.matchAll(/^\[([^\]]+)\] \([^)]*\)\n"(.*)"$/gm)].find((m) => m[2].startsWith(start))
  assert.ok(found, `the prompt holds the text "${start}"`)
  return found[1]
}

/**
 * A model provider answering `answerOf(prompt)` to a reading as a chat completion, recording each reading call
 * (`calls`). `fail` reading calls answer 500 first; `hang` never answers at all. The reading's one theme retry
 * (`retries`, another system prompt) finds no theme.
 */
function fakeModel(answerOf, { fail = 0, hang = false } = {}) {
  const calls = []
  const retries = []
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    const reading = body.messages[0].content === BUSINESS_READING_SYSTEM
    ;(reading ? calls : retries).push({ url, model: body.model, prompt: body.messages[1].content })
    if (hang) return new Promise(() => {})
    if (reading && calls.length <= fail) return new Response('{}', { status: 500 })
    const prompt = body.messages[1].content
    return Response.json({
      id: `call-${calls.length + retries.length}`,
      choices: [
        {
          message: { content: JSON.stringify(reading ? answerOf(prompt) : { uspThemes: [] }) },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 }
    })
  }
  return { fetch, calls, retries }
}

/** The answer of the invented model: the class and its price, quoted from the classes page. */
const classAnswer = (prompt) => ({
  services: [
    {
      name: 'Sourdough class',
      quote: CLASS_LINE,
      ref: refOf(prompt, 'Sourdough class'),
      price: '$45 a seat'
    }
  ],
  story: [{ text: 'Sourdough baked before dawn', quote: 'Sourdough baked before dawn', ref: 'bio' }]
})

function gatherer(domain, { keys = {}, settings = {}, ...rest } = {}) {
  return preSiteGatherer({
    pool: null,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith(keys, settings),
      fetch: noFetch,
      paidRunAllowed: async () => true,
      ...rest
    }
  })
}

test('the website pages are read by the business reading: its service and price land in the brief with their source', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(gymSite()) } })
  const model = fakeModel(gymAnswer)
  const gathered = await gatherer(domain, {
    readingDoor: async () => READY,
    readingFetch: model.fetch
  })({ links: [GYM], description: null }, {})
  assert.equal(model.calls.length, 1)
  assert.equal(model.calls[0].url, READY.door.url)
  assert.equal(model.calls[0].model, 'invented-model')
  const { brief } = gathered
  assert.equal(brief.trade, 'fitness')
  // The reading lands where a website opportunity's brief has it (`brief.reading`), with its quote's own page.
  assert.equal(brief.reading?.method, 'model')
  const service = brief.reading.services.find((i) => i.label === 'Beginner boxing classes')
  assert.ok(service, `the reading's service is in the brief: ${JSON.stringify(brief.reading.services)}`)
  assert.equal(service.source.url, PRICING)
  // Its price stands: neither the offerings nor the prices are listed as missing any more.
  assert.deepEqual(
    brief.missing.filter((m) => ['offerings', 'prices'].includes(m.field)),
    [],
    JSON.stringify(brief.missing)
  )
  assert.ok(
    brief.facts.some((f) => JSON.stringify(f.value ?? '').includes('$79 monthly')),
    `the price is a fact of the brief: ${JSON.stringify(brief.facts.map((f) => [f.field, f.value]))}`
  )
  // The research record says how it was read, its tokens and what it cost against the job cap.
  assert.equal(gathered.reading.method, 'model')
  assert.equal(gathered.reading.model, 'invented-model')
  assert.equal(gathered.reading.attempts, 1)
  // The reading and its one theme retry, each counted.
  assert.equal(model.retries.length, 1)
  assert.equal(gathered.reading.calls, 2)
  assert.equal(gathered.reading.tokens.prompt, 1800)
  assert.equal(gathered.reading.tokens.completion, 600)
  assert.ok(Number.isInteger(gathered.reading.costCents))
  assert.equal(gathered.reading.capCents, 200, 'the default cap of one research job (/ops/wo)')
  // What research made of it (`researchOf`) reads the service and its price.
  const { sources } = researchOf(brief, { manifest: [] })
  assert.match(JSON.stringify(sources), /Beginner boxing classes/)
  assert.match(JSON.stringify(sources), /\$79 monthly/)
})

test('without a model door the reading rules read what they can; the research goes on and says why', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(withClasses()) } })
  // No database: the server has no door to look the assignment up in.
  const none = await gatherer(domain)({ links: [SITE], description: null }, {})
  assert.equal(none.brief.business.name, 'Hollowmere Bakehouse')
  assert.deepEqual(
    [none.reading.method, none.reading.reason, none.reading.calls, none.reading.costCents],
    ['rules', 'not_configured', 0, 0]
  )
  // A door that cannot be looked up is unavailable, never a failed research.
  const broken = await gatherer(domain, {
    readingDoor: async () => {
      throw new Error('door store down')
    }
  })({ links: [SITE], description: null }, {})
  assert.deepEqual(
    [broken.reading.method, broken.reading.reason, broken.reading.door],
    ['rules', 'unavailable', 'door_lookup_failed']
  )
})

test('a failed model call is read once more on the same inputs, then the research goes on without it', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(withClasses()) } })
  const once = fakeModel(classAnswer, { fail: 1 })
  const recovered = await gatherer(domain, { readingDoor: async () => READY, readingFetch: once.fetch })(
    { links: [SITE], description: null },
    {}
  )
  assert.equal(once.calls.length, 2)
  assert.deepEqual([recovered.reading.method, recovered.reading.attempts], ['model', 2])
  assert.ok(recovered.brief.reading.services.some((i) => i.label === 'Sourdough class'))
  const always = fakeModel(classAnswer, { fail: 9 })
  const failed = await gatherer(domain, { readingDoor: async () => READY, readingFetch: always.fetch })(
    { links: [SITE], description: null },
    {}
  )
  assert.equal(always.calls.length, 2, 'one rerun at most')
  assert.deepEqual(
    [failed.reading.method, failed.reading.reason, failed.reading.attempts],
    ['rules', 'failed', 2]
  )
  assert.equal(failed.brief.business.name, 'Hollowmere Bakehouse')
})

test('the reading is held to the cap of one research job and to its own time', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(withClasses()) } })
  const model = fakeModel(classAnswer)
  const capped = await gatherer(domain, {
    settings: { researchJobCapCents: 0 },
    readingDoor: async () => READY,
    readingFetch: model.fetch
  })({ links: [SITE], description: null }, {})
  assert.equal(model.calls.length, 0, 'no call goes out past the cap')
  assert.deepEqual(
    [capped.reading.method, capped.reading.reason, capped.reading.capCents],
    ['rules', 'budget', 0]
  )
  const hung = fakeModel(classAnswer, { hang: true })
  const late = await gatherer(domain, {
    readingDoor: async () => READY,
    readingFetch: hung.fetch,
    readingBudgetMs: 50
  })({ links: [SITE], description: null }, {})
  assert.deepEqual([late.reading.method, late.reading.reason], [null, 'timeout'])
  assert.equal(late.brief.business.name, 'Hollowmere Bakehouse', 'the research keeps what it read')
})

test('a person the reading finds only in one guest review stays held off the site', async () => {
  const review = 'Corvin at the counter always saves us the last rye loaf.'
  const details = () => ({
    ...placeDetails(),
    reviews: [{ text: { text: review }, authorAttribution: { displayName: 'Invented Guest' }, rating: 5 }]
  })
  const { domain } = await fakeDomain({ connectors: { website: connector(withClasses()) }, details })
  const model = fakeModel((prompt) => ({
    ...classAnswer(prompt),
    team: [{ name: 'Corvin', role: '', quote: 'Corvin at the counter', ref: refOf(prompt, 'Corvin') }]
  }))
  const { brief, reading } = await gatherer(domain, {
    keys: { google: 'google-test' },
    readingDoor: async () => READY,
    readingFetch: model.fetch
  })({ links: [MAPS, SITE], description: null }, {})
  assert.equal(reading.method, 'model')
  const { withheld } = researchOf(brief, { manifest: [] })
  assert.deepEqual(withheld?.people, ['Corvin'], 'the person stays held')
  // The reading found the person, the brief keeps them off: no page of the sitemap names them.
  assert.ok(brief.reading.team.some((p) => p.label === 'Corvin'))
  assert.equal(JSON.stringify(brief.sitemap).includes('Corvin'), false)
})

// Decision D46: what the owner typed is a source to rewrite, never copy. No passage kind of the reading means "the
// owner's own statement" and the plan has no honest label for one yet, so its facts are not read: nothing it alone
// says reaches the brief, and the research record says why.
const SPARRING = 'Junior sparring club every Sunday morning for ages ten to fourteen.'

test('the description is not handed to the reading as another source; its facts wait, and the record says why (D46)', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(gymSite()) } })
  const model = fakeModel(gymAnswer)
  const gathered = await gatherer(domain, {
    readingDoor: async () => READY,
    readingFetch: model.fetch
  })({ links: [GYM], description: `We opened in 1990. ${SPARRING}` }, {})
  assert.equal(model.calls.length, 1)
  assert.ok(
    !model.calls[0].prompt.includes('Junior sparring'),
    'the reading never reads it as another source'
  )
  assert.ok(
    !JSON.stringify(gathered.brief).includes('Junior sparring'),
    'nothing it alone says is in the brief'
  )
  assert.ok(gathered.brief.reading.services.some((i) => i.label === 'Beginner boxing classes'))
  assert.deepEqual(gathered.descriptionFacts, { read: false, reason: 'no_owner_statement_source' })
})

test('without a model door the description is never used word for word instead (D46)', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(gymSite()) } })
  const gathered = await gatherer(domain)({ links: [GYM], description: SPARRING }, {})
  assert.equal(gathered.reading.method, 'rules')
  assert.ok(!JSON.stringify(gathered.brief).includes('Junior sparring'))
  assert.deepEqual(gathered.descriptionFacts, { read: false, reason: 'no_owner_statement_source' })
  // The website's own bio is what the story reads.
  const story = gathered.brief.facts.find((f) => f.field === 'story')
  assert.equal(story?.value?.text, 'A boxing gym for every level.')
})
