// The build chat's reading of the owner's own words (#609, #575): the step chain's business reading over what the owner
// said, which a research of the owner's words keeps as the business's reading and a research of links as how the
// words were read. Research itself is the step chain's (`owner-research.js`, `place-research.js`): the gatherer never
// researches by itself. The Website Opportunities reading is the real one; only its model door is a fake answering
// what an invented model would. Every business, place and price is invented. No database, no network, no key.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-description-only.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUSINESS_READING_SYSTEM } from 'website-opportunities/domain/business-reading.mjs'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
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

test("the owner's words are read by the business reading: how they were read, and the reading itself", async () => {
  const { domain, calls } = await fakeDomain()
  const model = fakeModel()
  const gather = gatherer(domain, { readingDoor: async () => READY, readingFetch: model.fetch })
  const read = await gather.readDescription({ description: WORDS, name: 'Pellmoor Cycle Workshop' })
  assert.equal(calls.filter(([door]) => door === 'guard').length, 0, 'no link is judged or read')
  assert.equal(model.calls.length, 1, 'the words are read once by the business reading')
  assert.deepEqual(read.descriptionFacts, { read: true, heldOut: 0, cut: false })
  assert.ok(
    read.businessReading.services.some((s) => s.label === 'Bike repairs'),
    JSON.stringify(read.businessReading)
  )
})

test('no words: nothing is read', async () => {
  const { domain } = await fakeDomain()
  const model = fakeModel()
  const gather = gatherer(domain, { readingDoor: async () => READY, readingFetch: model.fetch })
  assert.equal(await gather.readDescription({ description: '  ', name: 'Pellmoor Cycle Workshop' }), null)
  assert.equal(model.calls.length, 0)
})

test('the gatherer never researches by itself: research is the step chain own', async () => {
  const { domain } = await fakeDomain()
  await assert.rejects(
    gatherer(domain)({ links: [], description: WORDS, name: 'Pellmoor Cycle Workshop' }, {}),
    {
      code: 'research_unavailable',
      noRerun: true
    }
  )
})
