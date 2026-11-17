/**
 * The link lines of research reach the agent in `tracy_build`'s answer (#609), so it can name a link that gave
 * nothing in its own sentence. Invented business, invented links.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-link-reads.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBuildTool, PRIVATE_GUIDANCE_MARK } from '../src/host/build-tool.mjs'

const SESSION = 'session-build-7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const PROFILE = { business: 'Hollowmere Bakery', counts: { facts: 7 } }
const READ = { name: 'Instagram', state: 'read', facts: 18, pictures: 12 }
const FAILED = { name: 'Google Maps', state: 'failed', reason: 'Google did not answer for this place' }

function toolAnswering(states) {
  const queue = [...states]
  let clock = 0
  return createBuildTool({
    http: async () =>
      new Response(JSON.stringify(queue.length > 1 ? queue.shift() : queue[0]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }),
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => [],
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    waitMs: 10_000,
    pollMs: 2_000
  })
}

const research = (tool) =>
  tool.execute(
    { action: 'research', links: ['https://www.instagram.com/hollowmere.example/'] },
    { agent: { session: { id: SESSION } } }
  )

test('a done research hands on its link lines; a link that could not be read gets private guidance', async () => {
  const answer = await research(
    toolAnswering([{ step: 'research', state: 'done', result: { profile: PROFILE, links: [READ, FAILED] } }])
  )
  assert.deepEqual(answer.links, [READ, FAILED])
  assert.ok(answer.next.startsWith(PRIVATE_GUIDANCE_MARK))
  assert.match(answer.next, /could not be read or gave nothing/)
})

test('every link read with something gives no guidance about links', async () => {
  const answer = await research(
    toolAnswering([{ step: 'research', state: 'done', result: { profile: PROFILE, links: [READ] } }])
  )
  assert.deepEqual(answer.links, [READ])
  assert.doesNotMatch(answer.next, /could not be read or gave nothing/)
  assert.match(answer.next, /action templates/)
})

test('a link whose pictures were all lost is a gap the agent names', async () => {
  const lost = { name: 'Instagram', state: 'read', facts: 18, pictures: 0, picturesLost: 12 }
  const answer = await research(
    toolAnswering([{ step: 'research', state: 'done', result: { profile: PROFILE, links: [lost] } }])
  )
  assert.match(answer.next, /could not be read or gave nothing/)
})

test('a research still running past the wait hands on its reading lines', async () => {
  const reading = [{ name: 'Instagram', state: 'reading' }]
  const answer = await research(toolAnswering([{ step: 'research', state: 'running', links: reading }]))
  assert.equal(answer.running, true)
  assert.deepEqual(answer.links, reading)
})
