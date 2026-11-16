// The build chat's research with no link at all (#609): an owner with no website, no map listing and no social page
// says what the business is in their own words, and the research builds from those words alone. The Website
// Opportunities reading is the real one; only its model door is a fake answering what an invented model would. Every
// business, place and price is invented. No database, no network, no key.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-description-only.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from 'website-opportunities/domain'
import { BUSINESS_READING_SYSTEM } from 'website-opportunities/domain/business-reading.mjs'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import { researchStep } from '../src/build-draft/engine-steps.js'
import { fakeDomain, runtimeWith } from './build-draft-gather-fakes.mjs'

const SERVICE = 'Bike repairs and tune ups from 25 dollars, done the same day.'
const WORDS = `Pellmoor Cycle Workshop is a small bike repair shop in Quarrytown. ${SERVICE} Customers call or walk in.`
const READY = {
  state: 'ready',
  door: {
    url: 'https://llm.example/v1/chat/completions',
    key: 'test-key',
    model: 'invented-model',
    effort: 'off'
  }
}

/** The ref the reading gave the text that holds `start` (`[ref] (kind)` then the text, in the prompt). */
function refOf(prompt, start) {
  const found = [...prompt.matchAll(/^\[([^\]]+)\] \([^)]*\)\n"(.*)"$/gm)].find((m) => m[2].includes(start))
  assert.ok(found, `the prompt holds the text "${start}": ${prompt.slice(0, 600)}`)
  return found[1]
}

/** An invented model provider: the reading quotes the repair service from the owner's words. */
function fakeModel() {
  const calls = []
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    const reading = body.messages[0].content.startsWith(BUSINESS_READING_SYSTEM)
    const prompt = body.messages[1].content
    if (reading) calls.push(prompt)
    const answer = reading
      ? {
          services: [{ name: 'Bike repairs', quote: SERVICE, ref: refOf(prompt, 'Bike repairs'), price: '' }]
        }
      : { uspThemes: [] }
    return Response.json({
      id: `call-${calls.length}`,
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 }
    })
  }
  return { fetch, calls }
}

function gatherer(domain, rest = {}) {
  return preSiteGatherer({
    pool: null,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith(),
      fetch: async () => assert.fail('no link is fetched'),
      paidRunAllowed: async () => true,
      ...rest
    }
  })
}

test("no link but the owner's words: the research reads the words as the owner's answer and makes a brief", async () => {
  const { domain, calls } = await fakeDomain()
  const model = fakeModel()
  const gathered = await gatherer(domain, { readingDoor: async () => READY, readingFetch: model.fetch })(
    { links: [], description: WORDS, name: 'Pellmoor Cycle Workshop' },
    {}
  )
  assert.equal(calls.filter(([door]) => door === 'guard').length, 0, 'no link is judged or read')
  assert.equal(model.calls.length, 1, 'the words are read once by the business reading')
  assert.deepEqual(gathered.descriptionFacts, { read: true, heldOut: 0, cut: false })
  assert.deepEqual(gathered.setAside, [])
  const { brief } = gathered
  assert.ok(brief.reading.services.some((s) => s.label === 'Bike repairs'))
  assert.equal(brief.business.name, 'Pellmoor Cycle Workshop', 'the name the owner typed names the business')
  // The brand step refuses a brief with no brand part: nothing was observed, so it is the neutral one, claiming nothing.
  assert.deepEqual(
    [brief.brand?.origin, brief.brand?.official, brief.brand?.colors, brief.brand?.name],
    ['social', false, [], 'Pellmoor Cycle Workshop'],
    'the brief has a brand part'
  )
  // The needs profile's research reads the owner's facts with the origin "answer".
  const { sources } = researchOf(brief, { manifest: gathered.manifest })
  const own = sources.filter((s) => s.id === 'owner-statement')
  assert.ok(own.length, 'the research has the owner statement as a source')
  assert.ok(own.every((s) => s.origin === 'answer'))
})

test('no link and no words: there is nothing to read, and the research says so', async () => {
  const { domain } = await fakeDomain()
  await assert.rejects(gatherer(domain)({ links: [], description: null }, {}), {
    code: 'research_empty',
    reason: 'no_links',
    noRerun: true
  })
})

test('no link and no name: the owner is asked for the name, nothing is read', async () => {
  const { domain, calls } = await fakeDomain()
  await assert.rejects(gatherer(domain)({ links: [], description: WORDS }, {}), {
    code: 'research_empty',
    reason: 'no_name',
    noRerun: true
  })
  assert.equal(calls.length, 0)
})

test('research from the words alone: the needs profile reads the owner as its source and asks the ordinary questions', async () => {
  const { domain } = await fakeDomain()
  const model = fakeModel()
  const gather = gatherer(domain, { readingDoor: async () => READY, readingFetch: model.fetch })
  // The needs profile model's scripted reading: the repair service, from the owner's own statement.
  const needs = async () =>
    JSON.stringify({
      languages: [{ source: 'owner-statement', language: 'en' }],
      facts: [],
      items: [
        {
          source: 'owner-statement',
          kind: 'service',
          fields: { 'offering.name': 'Bike repairs' },
          evidence: SERVICE
        }
      ]
    })
  const record = await researchStep(
    { links: [], description: WORDS, name: 'Pellmoor Cycle Workshop' },
    { gather, model: needs, kit: null }
  )
  assert.equal(record.brief.business.name, 'Pellmoor Cycle Workshop')
  // The ordinary questions of a business that states no contact: its main button and how to reach it. None asks for a
  // link, the site name or a place.
  assert.deepEqual(
    record.profile.questions.map((q) => q.topic),
    ['main-button', 'contact-method']
  )
})
