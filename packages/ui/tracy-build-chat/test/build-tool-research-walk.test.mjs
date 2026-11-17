/**
 * What a real owner's walk of the build chat's research found in `tracy_build`'s answers (#575, 17/11/2026): after
 * research the owner read one empty sentence, and a start refused for its limit was said again after every message.
 * The finished research now hands the agent an account of what each link gave and what is still missing, and a start
 * paused for its limit is not asked again before its time. Invented business, invented links.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-research-walk.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBuildTool, foundNextOf, PAUSED_AGAIN_NEXT } from '../src/host/build-tool.mjs'

const SESSION = 'session-build-3b2c1d0e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const PROFILE = { business: 'Hollowmere Bakery', counts: { facts: 7 } }
const READ = { name: 'Instagram', state: 'read', facts: 18, pictures: 12 }
const FAILED = { name: 'Google Maps', state: 'failed', reason: 'Google did not answer for this place' }
const MISSING = [
  { what: 'opening hours', held: true },
  { what: 'prices', held: false },
  { what: 'a booking link', held: false }
]

/** A tool whose doors answer `answers` in turn ({status, body}), on a clock it moves itself. */
function toolAnswering(answers, clock = { now: 0 }) {
  const queue = [...answers]
  const calls = []
  const tool = createBuildTool({
    http: async (url, init = {}) => {
      calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`)
      const { status = 200, body } = queue.length > 1 ? queue.shift() : queue[0]
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    },
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => [],
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms
    },
    waitMs: 10_000,
    pollMs: 2_000
  })
  return { tool, calls, clock }
}
const research = (tool) =>
  tool.execute(
    { action: 'research', links: ['https://www.instagram.com/hollowmere.example/'] },
    { agent: { session: { id: SESSION } } }
  )

test('a finished research hands the agent what each link gave and what is still missing', async () => {
  const { tool } = toolAnswering([
    {
      body: {
        step: 'research',
        state: 'done',
        result: { profile: PROFILE, links: [READ, FAILED], missing: MISSING }
      }
    }
  ])
  const answer = await research(tool)
  assert.match(answer.next, /Instagram: 18 facts, 12 pictures/)
  assert.match(answer.next, /Google Maps: could not be read \(Google did not answer for this place\)/)
  assert.match(answer.next, /kept off the site until the owner confirms it: opening hours/)
  assert.match(answer.next, /not found: prices and a booking link/)
  assert.ok(
    answer.next.indexOf('what research found') < answer.next.indexOf('action templates'),
    'the account comes before the next step'
  )
})

test('a research that found nothing to account for adds no account', () => {
  assert.equal(foundNextOf({ links: [], missing: [] }), null)
})

test('a start paused for its limit is not asked again before its time, and says how long', async () => {
  const retryAt = new Date(30 * 60_000).toISOString()
  const say =
    'I have done this many times in a short while, so I paused here. Please try again in about 30 minutes.'
  const { tool, calls, clock } = toolAnswering([{ status: 429, body: { code: 'TRY_LATER', say, retryAt } }])
  const first = await research(tool)
  assert.equal(first.paused, true)
  assert.equal(first.say, say)
  assert.equal(first.retryAt, retryAt)
  assert.match(first.next, /before retryAt/)

  clock.now = 10 * 60_000
  const again = await research(tool)
  assert.equal(again.paused, true)
  assert.equal(again.say, undefined, 'the pause sentence is not said again')
  assert.equal(again.minutesLeft, 20)
  assert.ok(again.next.endsWith(PAUSED_AGAIN_NEXT), again.next)
  assert.equal(calls.length, 1, 'tracy-web is not asked again before the time')

  clock.now = 31 * 60_000
  await research(tool)
  assert.equal(calls.length, 2, 'after the time the start is asked again')
})

test('research with no link and no name asks the owner for them and says nothing failed', async () => {
  const { tool } = toolAnswering([{ body: { step: 'research', state: 'needs', needs: ['name', 'city'] } }])
  const value = await tool.execute(
    { action: 'research', description: 'I want a website.' },
    { agent: { session: { id: SESSION } } }
  )
  assert.deepEqual(value.needs, ['name', 'city'])
  assert.equal(value.stopped, undefined)
  assert.match(value.next, /business name/)
  assert.match(value.next, /Do not say anything failed/)
})
