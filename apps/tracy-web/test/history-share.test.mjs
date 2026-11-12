// Site changes opens with two doors at once, `/activity` and `/backups`, and each used to run its
// own `webroot-history` job on the host: two whole reads of the webroot back to back (7.1 s + 4.3 s
// on demo-tb-joomla, local stand 12/10/2026). `shareHistoryJobs` lets a second read of one site
// join the job already running, never a finished answer, and never across a write.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shareHistoryJobs } from '../src/sites/history-share.js'

const SITE = { site_key: 'a.tracy.test', label: 'a' }
const OTHER = { site_key: 'b.tracy.test', label: 'b' }

/** A fake host: every job stays open until the test settles it. */
function fakeHost() {
  const calls = []
  const run = (site, input) =>
    new Promise((resolve) => {
      calls.push({ site: site.site_key, kind: input.kind, resolve })
    })
  return { calls, run }
}

test('two history reads of one site while a job is running share that job', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs(host.run)
  const first = run(SITE, { kind: 'webroot-history' }, 45_000, undefined, { bounded: true })
  const second = run(SITE, { kind: 'webroot-history' }, 45_000)
  assert.equal(host.calls.length, 1, 'one job on the host')
  host.calls[0].resolve({ ok: true, output: '{"ok":true}' })
  assert.deepEqual(await first, { ok: true, output: '{"ok":true}' })
  assert.deepEqual(await second, { ok: true, output: '{"ok":true}' })
})

test('a finished answer is never handed out again: the next read runs its own job', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs(host.run)
  const first = run(SITE, { kind: 'webroot-history' }, 45_000)
  host.calls[0].resolve({ ok: true, output: 'one' })
  await first
  const next = run(SITE, { kind: 'webroot-history' }, 45_000)
  assert.equal(host.calls.length, 2)
  host.calls[1].resolve({ ok: true, output: 'two' })
  assert.equal((await next).output, 'two')
})

test('another site, or any other job on the site, is never joined', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs(host.run)
  run(SITE, { kind: 'webroot-history' }, 45_000)
  run(OTHER, { kind: 'webroot-history' }, 45_000)
  run(SITE, { kind: 'webroot-changes' }, 45_000)
  assert.deepEqual(
    host.calls.map((c) => [c.site, c.kind]),
    [
      ['a.tracy.test', 'webroot-history'],
      ['b.tracy.test', 'webroot-history'],
      ['a.tracy.test', 'webroot-changes']
    ]
  )
})

test('a job filed on the site after a history read started is not hidden by it: the next read runs fresh', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs(host.run)
  run(SITE, { kind: 'webroot-history' }, 45_000)
  run(SITE, { kind: 'webroot-backup', title: 'Before launch' }, 120_000)
  run(SITE, { kind: 'webroot-history' }, 45_000)
  assert.deepEqual(
    host.calls.map((c) => c.kind),
    ['webroot-history', 'webroot-backup', 'webroot-history']
  )
})

test('a read that fails is not kept either', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs((site, input) => {
    host.calls.push(input.kind)
    return Promise.reject(new Error('host down'))
  })
  await assert.rejects(run(SITE, { kind: 'webroot-history' }, 45_000))
  await assert.rejects(run(SITE, { kind: 'webroot-history' }, 45_000))
  assert.equal(host.calls.length, 2)
})

test('a bounded pending history read resumes its host job instead of starting another', async () => {
  const options = []
  const run = shareHistoryJobs(async (_site, _input, _deadline, _onJob, how) => {
    options.push(how)
    return options.length === 1
      ? { ok: false, reason: 'timeout', pending: true, jobId: 'history-one' }
      : { ok: true, output: 'full history' }
  })
  await run(SITE, { kind: 'webroot-history' }, 45_000, undefined, { bounded: true })
  assert.equal(
    (await run(SITE, { kind: 'webroot-history' }, 45_000, undefined, { bounded: true })).output,
    'full history'
  )
  assert.equal(options[1].resumeJobId, 'history-one')
})

test('a write invalidates a pending history identity so later reads observe the write', async () => {
  const options = []
  const run = shareHistoryJobs(async (_site, input, _deadline, _onJob, how) => {
    options.push({ kind: input.kind, ...how })
    return { ok: false, pending: true, jobId: 'old-history' }
  })
  await run(SITE, { kind: 'webroot-history' }, 45_000)
  await run(SITE, { kind: 'webroot-backup' }, 45_000)
  await run(SITE, { kind: 'webroot-history' }, 45_000)
  assert.equal(options[2].resumeJobId, undefined)
})

test('an invalidated old read cannot delete the newer pending identity', async () => {
  const host = fakeHost()
  const run = shareHistoryJobs(host.run)
  const old = run(SITE, { kind: 'webroot-history' }, 45_000)
  const write = run(SITE, { kind: 'webroot-backup' }, 45_000)
  const current = run(SITE, { kind: 'webroot-history' }, 45_000)
  host.calls[0].resolve({ ok: true, output: 'old' })
  await old
  const joined = run(SITE, { kind: 'webroot-history' }, 45_000)
  assert.equal(host.calls.length, 3)
  host.calls[1].resolve({ ok: true })
  host.calls[2].resolve({ ok: true, output: 'new' })
  await write
  assert.equal((await current).output, 'new')
  assert.equal((await joined).output, 'new')
})
