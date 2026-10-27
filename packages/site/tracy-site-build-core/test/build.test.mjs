/**
 * The build job (tasks/todo-build-with-experience.md §B1): one site, its stages in order, a file the
 * chat card and the Build tab poll, and the three ways a stage can end a run — done, waiting for the
 * customer, failed — plus the one that does not (skipped). No disk beyond a temp dir, no model, no
 * WordPress: the stages are functions handed in, so what is pinned is the sequencing and the file.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  createJob,
  JOB_FILE,
  jobFileFor,
  readJob,
  rerunJob,
  resumeBuild,
  runJob,
  startBuild
} from '../src/host/build.mjs'

/** The stage names a job is made with here — the engine has none of its own any more. */
const STAGES = ['check', 'theme', 'style', 'copy', 'seed', 'shot']

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Stage functions that record the order they ran in and answer as told. */
function fakeStages(answers = {}) {
  const ran = []
  const stages = Object.fromEntries(
    STAGES.map((name) => [
      name,
      async (job) => {
        ran.push(name)
        const a = answers[name]
        return typeof a === 'function' ? a(job) : (a ?? { status: 'done' })
      }
    ])
  )
  return { stages, ran }
}

function tmp() {
  return mkdtempSync(path.join(tmpdir(), 'tracy-build-'))
}

test('createJob: six pending stages, a fresh id, the file written where the card reads it', () => {
  const root = tmp()
  try {
    const job = createJob(root, {
      id: 'airbnb',
      platform: 'wordpress',
      stages: STAGES,
      now: () => 1_700_000_000_000
    })
    assert.equal(job.schemaVersion, 'tracy-site-build/v1')
    assert.equal(job.status, 'running')
    assert.deepEqual(
      job.stages.map((s) => `${s.name}:${s.status}`),
      STAGES.map((n) => `${n}:pending`)
    )
    assert.equal(job.inspiration, 'airbnb')
    assert.equal(job.platform, 'wordpress')
    assert.match(job.job, /^build-/)
    const onDisk = JSON.parse(readFileSync(path.join(root, JOB_FILE), 'utf8'))
    assert.equal(onDisk.job, job.job)
    assert.deepEqual(readJob(root), onDisk)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: stages run in order, each written to disk as it turns, done at the end', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    const { stages, ran } = fakeStages({
      theme: { status: 'done', detail: 'tracy 0.1.24' },
      seed: { status: 'done', contentRevision: 'content-1', lastApplyId: 'seed-undo-1' }
    })
    const seen = []
    await runJob(root, job, stages, { onChange: (j) => seen.push(j.stages.map((s) => s.status).join(',')) })
    assert.deepEqual(ran, [...STAGES])
    assert.equal(job.status, 'done')
    assert.ok(job.endedAt)
    assert.equal(job.stages[1].detail, 'tracy 0.1.24')
    assert.ok(job.stages.every((s) => s.status === 'done' && s.startedAt && s.endedAt))
    assert.ok(seen.length >= STAGES.length * 2, 'a change per start and per end of every stage')
    assert.equal(readJob(root).status, 'done')
    assert.equal(readJob(root).lastApplyId, 'seed-undo-1')
    assert.equal(readJob(root).contentRevision, 'content-1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: a failed stage stops the run and names itself; the rest stay pending', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    const { stages, ran } = fakeStages({ theme: { status: 'failed', detail: 'no theme zip in this image' } })
    await runJob(root, job, stages)
    assert.deepEqual(ran, ['check', 'theme'])
    assert.equal(job.status, 'failed')
    assert.equal(job.failed, 'theme')
    assert.equal(job.stages[1].detail, 'no theme zip in this image')
    assert.equal(job.stages[2].status, 'pending')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: a stage that throws is a failed stage with the message, not a crash', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    const { stages } = fakeStages({
      style: () => {
        throw new Error('wp: command not found')
      }
    })
    await runJob(root, job, stages)
    assert.equal(job.status, 'failed')
    assert.equal(job.failed, 'style')
    assert.equal(job.stages[2].detail, 'wp: command not found')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: a refusal keeps its code beside its sentence, through a throw and onto disk', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    // How a CMS stage reports a refused door: the words for the person, the code on the Error. An
    // exception is the one path where a structured answer would otherwise flatten to a sentence,
    // and the Build tab needs the code to know whether offering a retry is honest.
    const { stages } = fakeStages({
      style: () => {
        throw Object.assign(new Error('Nobody is signed in behind this build any more.'), {
          code: 'NOT_SIGNED_IN'
        })
      }
    })
    await runJob(root, job, stages)
    assert.equal(job.stages[2].code, 'NOT_SIGNED_IN')
    assert.equal(job.stages[2].detail, 'Nobody is signed in behind this build any more.')
    assert.equal(readJob(root).stages[2].code, 'NOT_SIGNED_IN', 'the Build tab polls the file')

    // A stage answering rather than throwing carries it the same way, and a rerun clears it: a
    // stale code would offer a sign-in over a step that has since failed for another reason.
    const second = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    let refuse = true
    const run = fakeStages({
      style: () =>
        refuse ? { status: 'failed', detail: 'no', code: 'ACTOR_NOT_ACCEPTED' } : { status: 'done' }
    })
    await runJob(root, second, run.stages)
    assert.equal(second.stages[2].code, 'ACTOR_NOT_ACCEPTED')
    refuse = false
    await rerunJob(root, second, 'style', run.stages)
    assert.equal(second.stages[2].code, undefined)
    assert.equal(second.status, 'done')

    // A stage that simply did not work carries none at all, and nothing downstream invents one.
    const third = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    await runJob(
      root,
      third,
      fakeStages({ style: () => ({ status: 'failed', detail: 'the model answered nothing' }) }).stages
    )
    assert.equal('code' in third.stages[2], false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: waiting pauses the run at that stage; rerunJob from it continues to the end', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    let asked = 0
    const { stages, ran } = fakeStages({
      copy: () => (asked++ === 0 ? { status: 'waiting', detail: 'form:name,about' } : { status: 'done' })
    })
    await runJob(root, job, stages)
    assert.equal(job.status, 'waiting')
    assert.equal(job.waiting, 'form:name,about')
    assert.equal(job.stages[3].status, 'waiting')
    assert.deepEqual(ran, ['check', 'theme', 'style', 'copy'])

    await rerunJob(root, job, 'copy', stages)
    assert.equal(job.status, 'done')
    assert.equal(job.waiting, undefined)
    assert.deepEqual(ran.slice(4), ['copy', 'seed', 'shot'])
    assert.ok(
      job.stages.slice(0, 3).every((s) => s.status === 'done'),
      'earlier stages untouched'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: an optional screenshot may be skipped without failing the build', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    const { stages, ran } = fakeStages({ shot: { status: 'skipped', detail: 'no-browser' } })
    await runJob(root, job, stages)
    assert.equal(job.status, 'done')
    assert.equal(job.stages[5].status, 'skipped')
    assert.deepEqual(ran, [...STAGES])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rerunJob: only the named stage and those after it run again, with the request attached', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    const { stages, ran } = fakeStages()
    await runJob(root, job, stages)
    ran.length = 0
    const seen = []
    stages.seed = async (j) => {
      seen.push(j.rerun)
      return { status: 'done' }
    }
    await rerunJob(root, job, 'seed', stages, { pages: ['/'] })
    assert.deepEqual(ran, ['shot'], 'seed was replaced above; shot ran after it')
    assert.deepEqual(seen, [{ stage: 'seed', pages: ['/'] }])
    assert.equal(job.status, 'done')
    assert.equal(job.runs, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rerunJob: a stage that is not one of the six is refused', async () => {
  const root = tmp()
  try {
    const job = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES })
    await runJob(root, job, fakeStages().stages)
    await assert.rejects(() => rerunJob(root, job, 'deploy', fakeStages().stages), /unknown stage/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('startBuild: one job at a time — a second start while running returns the same job', async () => {
  const root = tmp()
  try {
    let release
    const gate = new Promise((r) => {
      release = r
    })
    const { stages } = fakeStages({ theme: () => gate.then(() => ({ status: 'done' })) })
    const a = startBuild(root, { id: 'airbnb', platform: 'wordpress', stages: STAGES }, stages)
    await tick()
    const b = startBuild(root, { id: 'apple', platform: 'wordpress', stages: STAGES }, stages)
    assert.equal(b.job, a.job, 'the running job, not a new one')
    assert.equal(b.inspiration, 'airbnb')
    release()
    await a.finished
    assert.equal(a.status, 'done')
    const c = startBuild(root, { id: 'apple', platform: 'wordpress', stages: STAGES }, stages)
    assert.notEqual(c.job, a.job, 'a finished job makes room for the next')
    await c.finished
    assert.equal(readJob(root).inspiration, 'apple')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readJob: no file is null, a broken file is null — never a throw on the polling route', () => {
  const root = tmp()
  try {
    assert.equal(readJob(root), null)
    assert.equal(existsSync(path.join(root, JOB_FILE)), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("createJob: the stage list is the caller's, and a job with none or with a repeat is refused", () => {
  const root = tmp()
  try {
    const four = createJob(root, {
      id: 'airbnb',
      platform: 'joomla',
      stages: ['check', 'template', 'copy', 'shot']
    })
    assert.deepEqual(
      four.stages.map((s) => s.name),
      ['check', 'template', 'copy', 'shot']
    )
    assert.throws(() => createJob(root, { id: 'airbnb', platform: 'joomla', stages: [] }), /stage names/)
    assert.throws(() => createJob(root, { id: 'airbnb', platform: 'joomla', stages: ['a', 'a'] }), /distinct/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runJob: a four-stage job runs all four and no more', async () => {
  const root = tmp()
  try {
    const ran = []
    const stages = Object.fromEntries(
      ['check', 'template', 'copy', 'shot'].map((n) => [n, async () => (ran.push(n), { status: 'done' })])
    )
    const job = createJob(root, {
      id: 'airbnb',
      platform: 'joomla',
      stages: ['check', 'template', 'copy', 'shot']
    })
    await runJob(root, job, stages)
    assert.deepEqual(ran, ['check', 'template', 'copy', 'shot'])
    assert.equal(job.status, 'done')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('one job per SITE: two presses for two sites in one folder are two builds, each with its own file', async () => {
  // A build always dresses a new site and a customer has several (Lee, 09/09). Keyed by folder
  // alone, the second press joined the first site's running job and the second site was never
  // dressed.
  const root = tmp()
  try {
    let releaseA
    const gateA = new Promise((r) => {
      releaseA = r
    })
    const { stages: slow } = fakeStages({ theme: () => gateA.then(() => ({ status: 'done' })) })
    const { stages: quick } = fakeStages()
    const a = startBuild(
      root,
      { id: 'airbnb', platform: 'wordpress', stages: STAGES, targetSiteKey: 'a.example' },
      slow
    )
    await tick()
    const b = startBuild(
      root,
      { id: 'apple', platform: 'wordpress', stages: STAGES, targetSiteKey: 'b.example' },
      quick
    )
    assert.notEqual(b.job, a.job, 'another site is another build')
    await b.finished
    assert.equal(readJob(root, 'b.example')?.inspiration, 'apple')
    assert.equal(readJob(root, 'a.example')?.status, 'running', "the first site's file is its own")
    assert.ok(existsSync(path.join(root, jobFileFor('a.example'))))
    assert.ok(existsSync(path.join(root, jobFileFor('b.example'))))
    // A second press for site A while it runs still joins it.
    const again = startBuild(
      root,
      { id: 'apple', platform: 'wordpress', stages: STAGES, targetSiteKey: 'a.example' },
      quick
    )
    assert.equal(again.job, a.job)
    releaseA()
    await a.finished
    assert.equal(readJob(root, 'a.example')?.status, 'done')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('answers resume a persisted waiting job and are visible to the resumed stage', async () => {
  const root = tmp()
  try {
    const stages = {
      copy: (job) => (job.answers?.about ? { status: 'done' } : { status: 'waiting', detail: 'form:about' })
    }
    const initial = startBuild(
      root,
      {
        id: 'apple',
        platform: 'joomla',
        stages: ['copy'],
        targetSiteKey: 'new.example',
        answers: { name: 'Bakery' }
      },
      stages
    )
    await initial.finished
    assert.equal(readJob(root, 'new.example').status, 'waiting')
    const resumed = resumeBuild(root, 'copy', stages, {
      siteKey: 'new.example',
      answers: { about: 'Fresh bread' }
    })
    await resumed.finished
    const saved = readJob(root, 'new.example')
    assert.equal(saved.status, 'done')
    assert.deepEqual(saved.answers, { name: 'Bakery', about: 'Fresh bread' })
    assert.equal(saved.job, initial.job)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
