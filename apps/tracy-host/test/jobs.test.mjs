import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearDraining, draining, orphanJobs, putJob, readJob } from '../src/jobs.js'
// The acceptance mark is read through the namespace, so this file still loads where it does not exist yet.
import * as jobStore from '../src/jobs.js'

async function tmpJobsDir() {
  return mkdtemp(path.join(tmpdir(), 'tracy-host-jobs-'))
}

test('readJob: a job that was never written reads as null', async () => {
  const dir = await tmpJobsDir()
  assert.equal(await readJob(dir, 'nope'), null)
})

test('readJob: a jobs directory that does not exist at all reads as null, not a thrown error', async () => {
  const dir = path.join(await tmpJobsDir(), 'never-created')
  assert.equal(await readJob(dir, 'anything'), null)
})

test('putJob: first write sets id and createdAt, and the record round-trips through readJob', async () => {
  const dir = await tmpJobsDir()
  const written = await putJob(dir, 'job-1', { state: 'queued', step: 'queued', label: 'lantern' })
  assert.equal(written.id, 'job-1')
  assert.equal(typeof written.createdAt, 'number')
  assert.equal(written.state, 'queued')

  const read = await readJob(dir, 'job-1')
  assert.deepEqual(read, written)
})

test('putJob: a later call merges fields, keeps createdAt, and advances updatedAt', async () => {
  const dir = await tmpJobsDir()
  const first = await putJob(dir, 'job-1', { state: 'queued', step: 'queued', label: 'lantern' })
  await new Promise((r) => setTimeout(r, 5))
  const second = await putJob(dir, 'job-1', { state: 'running', step: 'starting' })

  assert.equal(second.createdAt, first.createdAt)
  assert.equal(second.label, 'lantern') // not overwritten by the second, partial, call
  assert.equal(second.state, 'running')
  assert.equal(second.step, 'starting')
  assert.ok(second.updatedAt > first.updatedAt)
})

test('putJob: two different job ids never collide', async () => {
  const dir = await tmpJobsDir()
  await putJob(dir, 'a', { label: 'a-site' })
  await putJob(dir, 'b', { label: 'b-site' })
  assert.equal((await readJob(dir, 'a')).label, 'a-site')
  assert.equal((await readJob(dir, 'b')).label, 'b-site')
})

test('putJob: no .tmp file is left behind after a write — the rename always lands', async () => {
  const dir = await tmpJobsDir()
  await putJob(dir, 'job-1', { state: 'done' })
  const files = await readdir(dir)
  assert.deepEqual(files, ['job-1.json'])
})

test('putJob: atomic — concurrent writes to the same id never leave readJob observing a partial file', async () => {
  const dir = await tmpJobsDir()
  const big = 'x'.repeat(200_000)
  // Two writers racing the same id, and twenty readers racing both — a half-written temp file
  // would show up here as a JSON parse error inside readJob (caught, returned as null) or, if the
  // atomicity guarantee failed, as a thrown exception. Neither writer nor reader should ever see
  // the latter.
  const writers = Promise.all([
    putJob(dir, 'job-1', { blob: big, tag: 'first' }),
    putJob(dir, 'job-1', { blob: big, tag: 'second' })
  ])
  const readers = await Promise.all(Array.from({ length: 20 }, () => readJob(dir, 'job-1')))
  await writers
  for (const job of readers) {
    if (job !== null) {
      assert.equal(job.blob, big)
      assert.ok(job.tag === 'first' || job.tag === 'second')
    }
  }
  const final = await readJob(dir, 'job-1')
  assert.equal(final.blob, big)
})

test('orphanJobs: a job left queued or running by the previous process is marked failed with the reason; finished ones are untouched', async () => {
  const dir = await tmpJobsDir()
  await putJob(dir, 'stuck', { state: 'running', step: '> docker build x', label: 'a' })
  await putJob(dir, 'waiting', { state: 'queued', step: 'queued', label: 'b' })
  await putJob(dir, 'ok', { state: 'done', step: 'ready', label: 'c' })
  await putJob(dir, 'bad', { state: 'failed', step: 'provision', label: 'd' })
  assert.deepEqual((await orphanJobs(dir, { now: 1000 })).sort(), ['stuck', 'waiting'])
  const stuck = await readJob(dir, 'stuck')
  assert.equal(stuck.state, 'failed')
  assert.match(stuck.detail, /restarted before this job finished \(was running at "> docker build x"\)/)
  assert.equal(stuck.orphanedAt, 1000)
  assert.equal((await readJob(dir, 'ok')).state, 'done')
  assert.equal((await readJob(dir, 'bad')).detail, undefined)
  assert.deepEqual(await orphanJobs(dir), [], 'a second boot finds nothing to mark')
  assert.deepEqual(
    await orphanJobs(path.join(dir, 'missing')),
    [],
    'no jobs directory yet: nothing to do, no throw'
  )
})

// #295: the marker `deploy-tracy-stack.sh` writes while it waits to replace this container.
test('draining: honoured until its own `until`, and never past an hour, whatever it says', async () => {
  const dir = await tmpJobsDir()
  const now = Date.now()
  assert.equal(await draining(dir, { now }), false, 'no marker is no deploy')
  assert.equal(await draining(undefined, { now }), false, 'no jobs directory configured')
  await writeFile(path.join(dir, 'draining'), JSON.stringify({ until: now + 60_000 }))
  assert.equal(await draining(dir, { now }), true)
  assert.equal(await draining(dir, { now: now + 61_000 }), false, 'past its own end')
  await writeFile(path.join(dir, 'draining'), JSON.stringify({ until: now + 10 * 3600_000 }))
  const twoHoursAgo = new Date(now - 2 * 3600_000)
  await utimes(path.join(dir, 'draining'), twoHoursAgo, twoHoursAgo)
  assert.equal(await draining(dir, { now }), false, 'a marker from a deploy that died two hours ago')
  await writeFile(path.join(dir, 'draining'), 'not json')
  assert.equal(await draining(dir, { now }), true, 'a fresh marker without an end still counts')
})

test('clearDraining: removes the marker a deploy left, and says whether there was one', async () => {
  const dir = await tmpJobsDir()
  assert.equal(await clearDraining(dir), false)
  await writeFile(path.join(dir, 'draining'), JSON.stringify({ until: Date.now() + 60_000 }))
  assert.equal(await clearDraining(dir), true)
  assert.equal(await draining(dir), false)
  // orphanJobs reads the same directory at the same boot, and a marker is not a job.
  assert.deepEqual(await orphanJobs(dir), [])
})

test('acceptJob / jobAccepted: the mark is a file of its own, there after the write and untouched by the record', async () => {
  const dir = path.join(await tmpJobsDir(), 'made-on-demand')
  assert.equal(await jobStore.jobAccepted(dir, 'job-1'), false, 'no directory yet: looked, not there')
  await jobStore.acceptJob(dir, 'job-1')
  assert.equal(await jobStore.jobAccepted(dir, 'job-1'), true)
  assert.equal(await jobStore.jobAccepted(dir, 'job-2'), false)
  assert.equal(await readJob(dir, 'job-1'), null, 'a mark is not a record')
  const mark = await readFile(path.join(dir, 'job-1.accepted'), 'utf8')
  assert.equal(JSON.parse(mark).id, 'job-1')

  await putJob(dir, 'job-1', { state: 'running' })
  await rm(path.join(dir, 'job-1.json'))
  assert.equal(await jobStore.jobAccepted(dir, 'job-1'), true, 'the record going takes nothing from the mark')
  await jobStore.acceptJob(dir, 'job-1')
  assert.equal(await jobStore.jobAccepted(dir, 'job-1'), true, 'marking twice is marking once')
  assert.deepEqual(await readdir(dir), ['job-1.accepted'], 'no temp file left behind')
})

test('orphanJobs: a mark is not a job — a restart reads past it and leaves it', async () => {
  const dir = await tmpJobsDir()
  await jobStore.acceptJob(dir, 'job-1')
  await putJob(dir, 'job-1', { state: 'running', step: 'go-live:live' })
  assert.deepEqual(await orphanJobs(dir), ['job-1'])
  assert.equal(await jobStore.jobAccepted(dir, 'job-1'), true)
})

test('jobAccepted: only "the path does not exist" is a no — anything else that keeps the mark from being read throws', async () => {
  const notADir = path.join(await tmpJobsDir(), 'file')
  await writeFile(notADir, 'x')
  await assert.rejects(jobStore.jobAccepted(notADir, 'job-1'), { code: 'ENOTDIR' })

  const dir = await tmpJobsDir()
  await mkdir(path.join(dir, 'folder.accepted'))
  await assert.rejects(jobStore.jobAccepted(dir, 'folder'), /not a regular file/)
  await symlink(path.join(dir, 'nowhere'), path.join(dir, 'link.accepted'))
  await assert.rejects(jobStore.jobAccepted(dir, 'link'), /not a regular file/)
})

test('acceptJob: a mark that cannot be written throws, and leaves nothing that reads as one', async () => {
  const notADir = path.join(await tmpJobsDir(), 'file')
  await writeFile(notADir, 'x')
  await assert.rejects(jobStore.acceptJob(notADir, 'job-1'))

  const dir = await tmpJobsDir()
  await mkdir(path.join(dir, 'job-1.accepted'))
  await writeFile(path.join(dir, 'job-1.accepted', 'in-the-way'), 'x')
  await assert.rejects(jobStore.acceptJob(dir, 'job-1'))
  assert.deepEqual(await readdir(dir), ['job-1.accepted'], 'the temp file was cleaned up')
})
