/**
 * The working row follows the engine's real step while a `tracy_build` call waits (#575, 17/11/2026 walk): research
 * said the plan step's title, and the link lines flipped all together only when the call ended. The engine feed reads
 * `GET /api/build-draft/engine` while a row listens; the row says the step that runs and each link's line as read.
 * Invented links.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/engine-feed.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { bundleClient } from './bundle-client.mjs'

let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    export { createEngineFeed, ENGINE_PATH, rowOfRunning } from './engine-feed'
`))
})
after(() => done?.())

const ok = (body) => new Response(JSON.stringify(body), { status: 200 })

test('the feed reads the engine while a row listens, says each change once, and stops when nobody listens', async () => {
  const answers = [
    { step: 'research', state: 'running', links: [{ name: 'Instagram', state: 'reading' }] },
    { step: 'research', state: 'running', links: [{ name: 'Instagram', state: 'read' }] },
    { step: 'research', state: 'done', result: {} }
  ]
  const paths = []
  const timers = []
  const feed = lib.createEngineFeed(
    async (path) => {
      paths.push(path)
      return ok(answers.length > 1 ? answers.shift() : answers[0])
    },
    { setTimer: (run) => timers.push(run) && timers.length, clearTimer: () => {} }
  )
  const seen = []
  const stop = feed.subscribe(() => seen.push(feed.read()))
  await feed.load()
  assert.deepEqual(paths, [lib.ENGINE_PATH])
  assert.deepEqual(seen.at(-1), { step: 'research', links: [{ name: 'Instagram', state: 'reading' }] })
  timers.shift()()
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(seen.at(-1).links, [{ name: 'Instagram', state: 'read' }], 'the link flips on its own')
  timers.shift()()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(feed.read(), null, 'a step that ended runs no more')
  const changes = seen.length
  stop()
  await feed.load()
  assert.equal(seen.length, changes, 'nobody listens: nothing is said')
})

test('a plan or status call waiting on research says it reads the links, not that it plans', () => {
  const own = { kind: 'working', step: 'plan', links: [] }
  const links = [{ name: 'Google Maps', state: 'read' }]
  assert.deepEqual(lib.rowOfRunning(own, { step: 'research', links }), {
    kind: 'working',
    step: 'research',
    links
  })
  assert.deepEqual(lib.rowOfRunning(own, { step: 'compose', links: [] }), {
    kind: 'working',
    step: 'compose',
    links: []
  })
  assert.equal(lib.rowOfRunning(own, null), own, 'no engine read: the call own row')
  const templates = { kind: 'working', step: 'templates', links: [] }
  assert.equal(lib.rowOfRunning(templates, { step: 'research', links }), templates)
})
