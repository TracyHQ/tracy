/**
 * The action `start-over` of `tracy_build`: the owner is asked first, the door is reached only with `confirm: true`,
 * and its answer or refusal reaches the owner as one plain sentence. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/start-over.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { BUILD_DESCRIPTION, BUILD_PARAMETERS, createBuildTool } from '../src/host/build-tool.mjs'
import { START_OVER_CONFIRM_SAY } from '../src/host/start-over.mjs'

const SESSION = 'session-build-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6'

/** A tool whose door answers `status` and `body`; `calls` keeps every request it sent. */
function toolAnswering(status, body) {
  const calls = []
  const tool = createBuildTool({
    http: async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null })
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    },
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => [],
    now: () => 0,
    sleep: async () => {},
    waitMs: 1000,
    pollMs: 100
  })
  return { tool, calls }
}
const call = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })

test('a first call only asks the owner, in the same words as tracy-web', async () => {
  const { tool, calls } = toolAnswering(200, { started: true })
  const asked = await call(tool, { action: 'start-over' })
  assert.equal(asked.confirm, true)
  assert.equal(asked.say, START_OVER_CONFIRM_SAY)
  assert.equal(calls.length, 0, 'nothing is discarded before the owner agreed')
  const web = readFileSync(
    new URL('../../../../apps/tracy-web/src/lib/i18n/strings.js', import.meta.url),
    'utf8'
  )
  assert.ok(web.includes(`'${START_OVER_CONFIRM_SAY}'`), 'the two copies of the question are equal')
})

test('with confirm the door starts over and the conversation is closed', async () => {
  const say = 'What I gathered so far is discarded. Open the build chat again to start a new conversation.'
  const { tool, calls } = toolAnswering(200, { started: true, open: '/new/build', say })
  const done = await call(tool, { action: 'start-over', confirm: true })
  assert.equal(done.startedOver, true)
  assert.equal(done.open, '/new/build')
  assert.equal(done.say, say)
  const door = calls.find((c) => c.url.endsWith('/api/build-draft/start-over'))
  assert.deepEqual(door, {
    url: 'https://tracy.example/api/build-draft/start-over',
    method: 'POST',
    body: { confirm: true }
  })
})

test('a refusal is said as the door words it, and nothing else happens', async () => {
  const say =
    'A site was already built from this conversation, so it cannot start over. Building a second site is not available yet.'
  const { tool } = toolAnswering(409, { code: 'SITE_BUILT', say })
  const refused = await call(tool, { action: 'start-over', confirm: true })
  assert.equal(refused.refused, true)
  assert.equal(refused.say, say)
})

test('the tool describes the action and its confirm', () => {
  assert.ok(BUILD_PARAMETERS.properties.action.enum.includes('start-over'))
  assert.equal(BUILD_PARAMETERS.properties.confirm.type, 'boolean')
  assert.match(BUILD_DESCRIPTION, /start-over ONLY when the owner clearly asks/)
})
