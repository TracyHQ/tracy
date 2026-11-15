// The browser's build run feed (#610, `src/client/sources.ts`): the task list card reads the account's build run from
// `GET /api/build-draft/build`, again while it runs, and stops reading on the outcome or when no card listens. Every
// value here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-run-feed.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(path.join(tmpdir(), 'build-run-feed-'))
after(() => rmSync(out, { recursive: true, force: true }))
const file = path.join(out, 'sources.mjs')
await build({
  entryPoints: [path.join(root, 'src/client/sources.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: file,
  logLevel: 'silent'
})
const { createBuildRunFeed, BUILD_RUN_PATH } = await import(pathToFileURL(file).href)

const event = (seq) => ({ schema: 'tracy-build-progress/v1', seq, steps: [] })
const SESSION = 'session-build-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6'

function feedOf(answers) {
  const asked = []
  const timers = []
  const fetchImpl = async (url, init) => {
    asked.push({ url, init })
    const body = answers.length > 1 ? answers.shift() : answers[0]
    return new Response(JSON.stringify(body), { status: 200 })
  }
  const feed = createBuildRunFeed(fetchImpl, {
    pollMs: 5,
    setTimer: (run) => {
      timers.push(run)
      return timers.length
    },
    clearTimer: () => timers.splice(0)
  })
  const tick = async () => {
    const run = timers.shift()
    run?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { feed, asked, timers, tick }
}

test('before any build the feed reads nothing, and draws no made up run', async () => {
  const { feed, asked, timers } = feedOf([{ build: null, run: null }])
  const stop = feed.subscribe(() => {})
  await feed.load()
  assert.equal(feed.read(SESSION), null)
  assert.equal(asked[0].url, BUILD_RUN_PATH)
  assert.equal(asked[0].init.credentials, 'same-origin')
  stop()
  assert.equal(timers.length, 0)
})

test('a build refused before any step reads as not started, with no run and no reads after it', async () => {
  const { feed, timers } = feedOf([
    { build: { id: 'b1', state: 'stopped', notStarted: 'design-not-buildable' }, run: null }
  ])
  const stop = feed.subscribe(() => {})
  await feed.load()
  assert.deepEqual(feed.read(SESSION), { notStarted: 'design-not-buildable' })
  assert.equal(timers.length, 0, 'nothing runs, so nothing is read again')
  stop()
})

test('a running build is read again until its outcome, then the reads stop', async () => {
  const outcome = { schema: 'tracy-build-outcome/v1', result: 'done', steps: [] }
  const { feed, asked, timers, tick } = feedOf([
    { run: { events: [event(1)] } },
    { run: { events: [event(2)] } },
    { run: { outcome } }
  ])
  let heard = 0
  feed.subscribe(() => heard++)
  await tick()
  assert.equal(feed.read(SESSION).events[0].seq, 1)
  await tick()
  assert.equal(feed.read(SESSION).events[0].seq, 2)
  await tick()
  assert.deepEqual(feed.read(SESSION), { outcome })
  assert.equal(timers.length, 0, 'no read is planned after the outcome')
  assert.equal(asked.length, 3)
  assert.equal(heard, 3)
})

test('before any build is asked for, nothing is polled: one read, then no timer', async () => {
  const { feed, asked, timers, tick } = feedOf([{ build: null, run: null }])
  feed.subscribe(() => {})
  await tick()
  assert.equal(asked.length, 1)
  assert.equal(timers.length, 0, 'no read every few seconds while the owner is still answering questions')
})

test('a build asked for again after a stopped one is read again, and its new run replaces the stopped outcome', async () => {
  const stoppedOutcome = { schema: 'tracy-build-outcome/v1', result: 'stopped', steps: [] }
  const done = { schema: 'tracy-build-outcome/v1', result: 'done', steps: [] }
  const { feed, asked, timers, tick } = feedOf([
    { run: { outcome: stoppedOutcome } },
    // The door has not started the new run yet on the first read after the new Approve.
    { run: { outcome: stoppedOutcome } },
    { run: { events: [event(1)] } },
    { run: { outcome: done } }
  ])
  feed.subscribe(() => {})
  await tick()
  assert.deepEqual(feed.read(SESSION), { outcome: stoppedOutcome })
  assert.equal(timers.length, 0, 'the stopped outcome ends the reads')
  feed.wake('build-call-2')
  await tick()
  assert.deepEqual(feed.read(SESSION), { outcome: stoppedOutcome }, 'still the old run')
  assert.equal(timers.length, 1, 'but the feed keeps reading for the new one')
  await tick()
  assert.equal(feed.read(SESSION).events[0].seq, 1, 'the new run shows')
  await tick()
  assert.deepEqual(feed.read(SESSION), { outcome: done })
  assert.equal(timers.length, 0)
  feed.wake('build-call-2')
  await tick()
  assert.equal(asked.length, 4, 'the same build call wakes the feed once')
})

test('the reads stop when the last card stops listening', async () => {
  const { feed, timers, tick } = feedOf([{ run: { events: [event(1)] } }])
  const stop = feed.subscribe(() => {})
  await tick()
  assert.equal(timers.length, 1)
  stop()
  assert.equal(timers.length, 0)
})
