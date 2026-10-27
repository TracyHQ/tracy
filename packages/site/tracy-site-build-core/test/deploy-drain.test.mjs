/**
 * A build and a deploy that recreates dsh (#295): the build holds a lease the deploy waits for,
 * steps aside between stages while the deploy asks long work to hold off (`$DSH_HOME/draining`),
 * and goes on from the next stage once the deploy is over.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJob, recoverBuild, startBuild, unfinishedJobs } from '../src/host/build.mjs'
import { notifyBuild } from '../src/host/notifications.mjs'

async function withHome(fn) {
  const home = mkdtempSync(path.join(tmpdir(), 'build-drain-home-'))
  const root = mkdtempSync(path.join(tmpdir(), 'build-drain-root-'))
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return await fn(home, root)
  } finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
}

const request = {
  id: 'apple',
  platform: 'joomla',
  stages: ['install', 'copy', 'seed'],
  ownerSessionId: 's1',
  targetSiteKey: 'one.test'
}

test('a deploy asking to drain lets the running stage finish, then pauses before the next', () =>
  withHome(async (home, root) => {
    const seen = []
    /** @type {unknown} */
    let leaseDuringInstall = null
    const stages = {
      install: () => {
        seen.push('install')
        const files = readdirSync(path.join(home, 'leases'))
        leaseDuringInstall = JSON.parse(readFileSync(path.join(home, 'leases', files[0]), 'utf8'))
        // The deploy starts waiting while this stage runs.
        writeFileSync(path.join(home, 'draining'), '')
        return { status: 'done' }
      },
      copy: () => {
        seen.push('copy')
        return { status: 'done' }
      },
      seed: () => {
        seen.push('seed')
        return { status: 'done' }
      }
    }
    const job = startBuild(root, request, stages)
    await job.finished

    assert.deepEqual(seen, ['install'])
    assert.equal(job.status, 'paused')
    assert.equal(job.paused, 'host-updating')
    assert.deepEqual(
      job.stages.map((s) => s.status),
      ['done', 'pending', 'pending']
    )
    assert.equal(readJob(root, 'one.test')?.status, 'paused', 'the pause is on disk for the next process')
    assert.deepEqual(leaseDuringInstall && { ...leaseDuringInstall, heartbeatAt: 'x' }, {
      id: `build-${job.job}`,
      kind: 'build',
      siteKey: 'one.test',
      sessionId: 's1',
      heartbeatAt: 'x'
    })
    assert.deepEqual(
      readdirSync(path.join(home, 'leases')),
      [],
      'the lease is released so the deploy goes on'
    )
    assert.deepEqual(
      unfinishedJobs(root).map((one) => one.job),
      [job.job]
    )

    // Still draining: resuming would only pause again, so nothing runs.
    const onDisk = readJob(root, 'one.test')
    assert.equal(recoverBuild(root, onDisk, stages), onDisk)
    assert.deepEqual(seen, ['install'])

    // The deploy is over.
    rmSync(path.join(home, 'draining'))
    const resumed = recoverBuild(root, onDisk, stages)
    await resumed.finished
    assert.deepEqual(seen, ['install', 'copy', 'seed'])
    assert.equal(resumed.status, 'done')
    assert.equal(resumed.paused, undefined)
    assert.deepEqual(unfinishedJobs(root), [])
    assert.equal(existsSync(path.join(home, 'leases', `build-${job.job}.json`)), false)
  }))

test('a build started while a deploy drains starts no stage at all', () =>
  withHome(async (home, root) => {
    writeFileSync(path.join(home, 'draining'), '')
    let ran = false
    const job = startBuild(root, request, {
      install: () => {
        ran = true
        return { status: 'done' }
      }
    })
    await job.finished
    assert.equal(ran, false)
    assert.equal(job.status, 'paused')
  }))

test('a paused build tells the owner nothing: it is still under way', () =>
  withHome(async (_home, root) => {
    const told = []
    const job = { ...request, job: 'build-x', status: 'paused', runs: 1, stages: [] }
    const sent = notifyBuild(root, job, {
      getAgent: () => ({ followup: (message) => told.push(message) }),
      plugin: 'test'
    })
    assert.equal(sent, false)
    assert.deepEqual(told, [])
  }))
