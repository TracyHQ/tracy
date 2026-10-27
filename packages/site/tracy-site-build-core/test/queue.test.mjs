import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createJob, startBuild, reviseBuild, currentJob, recoverBuild } from '../src/host/build.mjs'
import { acquireLease } from '../src/host/lease.mjs'

test('changes accepted during a stage survive on disk and run after that stage', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-queue-'))
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const seen = []
  const stages = {
    copy: async (job) => {
      seen.push(job.answers.name)
      if (seen.length === 1) await gate
      return { status: 'done' }
    }
  }
  try {
    const job = startBuild(
      root,
      {
        id: 'apple',
        platform: 'joomla',
        stages: ['copy'],
        answers: { name: 'First' },
        targetSiteKey: 'one.test'
      },
      stages
    )
    const accepted = reviseBuild(root, job, { name: 'Second', languages: ['en', 'vi'] }, stages)
    assert.ok(accepted.requestId)
    assert.equal(job.answers.name, 'First')
    assert.equal(acquireLease(root, 'one.test'), null)
    release()
    await job.finished
    assert.deepEqual(seen, ['First', 'Second'])
    assert.equal(currentJob(root, 'one.test').briefRevision, 1)
    assert.deepEqual(currentJob(root, 'one.test').answers.languages, ['en', 'vi'])
  } finally {
    release()
    rmSync(root, { recursive: true, force: true })
  }
})

test('an interrupted checkpoint consumes a durable brief and resumes only unfinished work', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-recover-'))
  try {
    const job = createJob(root, {
      id: 'apple',
      platform: 'joomla',
      stages: ['install', 'copy'],
      answers: { name: 'Old' }
    })
    job.stages[0].status = 'done'
    job.stages[1].status = 'running'
    const dir = path.join(root, 'docs/agents/build/requests', job.job)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'request.json'),
      JSON.stringify({ id: 'request', answers: { name: 'Recovered' } })
    )
    const seen = []
    const stages = {
      install: () => {
        throw new Error('must not reinstall')
      },
      copy: (j) => {
        seen.push(j.answers.name)
        return { status: 'done' }
      }
    }
    const resumed = recoverBuild(root, job, stages)
    await resumed.finished
    assert.deepEqual(seen, ['Recovered'])
    assert.equal(resumed.status, 'done')
    assert.equal(recoverBuild(root, resumed, stages), resumed)
    assert.deepEqual(seen, ['Recovered'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a process that exits while holding the lease does not strand the next build', async () => {
  const { execFileSync } = await import('node:child_process')
  const root = mkdtempSync(path.join(tmpdir(), 'build-dead-owner-'))
  try {
    const module = new URL('../src/host/lease.mjs', import.meta.url).href
    execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { acquireLease } from ${JSON.stringify(module)}; if (!acquireLease(${JSON.stringify(root)}, 'one.test')) process.exit(1)`
    ])
    const release = acquireLease(root, 'one.test')
    assert.equal(typeof release, 'function')
    assert.equal(acquireLease(root, 'one.test'), null)
    release()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a queued design change starts at template after the previous brief finishes', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-design-queue-'))
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const seen = []
  const stages = Object.fromEntries(
    ['check', 'template', 'copy'].map((stage) => [
      stage,
      async (job) => {
        seen.push(`${stage}:${job.inspiration}`)
        if (stage === 'copy' && job.runs === 1) await gate
        return { status: 'done' }
      }
    ])
  )
  try {
    const job = startBuild(
      root,
      { id: 'apple', platform: 'joomla', stages: Object.keys(stages), targetSiteKey: 'one.test' },
      stages
    )
    await new Promise((resolve) => setImmediate(resolve))
    reviseBuild(root, job, {}, stages, { stage: 'template', inspiration: 'airbnb' })
    assert.equal(job.inspiration, 'apple')
    release()
    await job.finished
    assert.deepEqual(seen, ['check:apple', 'template:apple', 'copy:apple', 'template:airbnb', 'copy:airbnb'])
  } finally {
    release()
    rmSync(root, { recursive: true, force: true })
  }
})
