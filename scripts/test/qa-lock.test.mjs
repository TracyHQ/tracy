#!/usr/bin/env node
/**
 * Daily QA run lock (`lockf`) and the orphan reconciliation that starts every run. Uses real
 * processes (`sleep`) spawned by the test; start times are read with `ps -o lstart=`.
 *
 *   node --test scripts/test/qa-lock.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { appendLine, openJournal } from '../qa/lib/journal.mjs'
import {
  LOCK_BUSY,
  LOCKF,
  lockArgv,
  procStart,
  reconcileOrphans,
  spawnTracked,
  trackedSpawnArgs
} from '../qa/lib/lock.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'qa-lock-'))
const strays = []
after(() => {
  for (const pid of strays) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  rmSync(tmp, { recursive: true, force: true })
})
let n = 0
const path = (name) => join(tmp, `${n++}-${name}`)

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const waitDead = async (pid, ms = 3000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (!alive(pid)) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return !alive(pid)
}
const exitOf = (child) => new Promise((r) => child.once('exit', (code) => r(code)))
const firstLine = (child) =>
  new Promise((r) => {
    let buf = ''
    child.stdout.on('data', (d) => {
      buf += d
      if (buf.includes('\n')) r(buf.split('\n')[0].trim())
    })
  })

const hasLockf = existsSync(LOCKF)

test('a second run gets exit code 75 while the first holds the lock', {
  skip: !hasLockf && 'no lockf'
}, async () => {
  const lock = path('run.lock')
  const [cmd, ...args] = lockArgv(lock, ['/bin/sleep', '30'])
  const first = spawn(cmd, args, { stdio: 'ignore', detached: true })
  strays.push(-first.pid)
  await new Promise((r) => setTimeout(r, 200))
  const [c2, ...a2] = lockArgv(lock, ['/usr/bin/true'])
  assert.equal(await exitOf(spawn(c2, a2, { stdio: 'ignore' })), LOCK_BUSY)
  // kill -9 the holder: the kernel releases the lock and the next run goes through.
  first.kill('SIGKILL')
  await exitOf(first)
  assert.equal(await exitOf(spawn(c2, a2, { stdio: 'ignore' })), 0)
  process.kill(-first.pid, 'SIGKILL') // the sleep lockf started, now an orphan
})

test('procStart reads a live process start time and null for a dead one', async () => {
  const s = spawn('/bin/sleep', ['5'], { stdio: 'ignore' })
  strays.push(s.pid)
  assert.match(procStart(s.pid), /^\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4}$/)
  s.kill('SIGKILL')
  await exitOf(s)
  assert.equal(procStart(s.pid), null)
})

test('a still-running tracked process from the old run is killed with its group', async () => {
  const procs = path('procs.jsonl')
  const child = spawnTracked(procs, { runId: 'r-live', label: 'pr1-sonnet' }, '/bin/sleep', ['30'], {
    stdio: 'ignore'
  })
  strays.push(child.pid)
  await new Promise((r) => setTimeout(r, 100))
  const report = reconcileOrphans({ procsPath: procs, runId: 'r-live' })
  assert.ok(await waitDead(child.pid), 'tracked process killed')
  assert.ok(report.killed.some((k) => k.pid === child.pid))
})

test('a grandchild left alive after its parent exited is found and killed', async () => {
  const procs = path('procs.jsonl')
  const child = spawnTracked(
    procs,
    { runId: 'r-gc', label: 'pr2-sol' },
    '/bin/sh',
    ['-c', '/bin/sleep 30 & echo $!'],
    {
      stdio: ['ignore', 'pipe', 'ignore']
    }
  )
  const grandchild = Number(await firstLine(child))
  strays.push(grandchild)
  await exitOf(child)
  assert.ok(alive(grandchild), 'grandchild outlived its parent')
  // The exit was recorded as a result: the grandchild must still be found.
  assert.ok(
    openJournal(procs)
      .lines()
      .some((l) => l.t === 'result')
  )
  const report = reconcileOrphans({ procsPath: procs, runId: 'r-gc' })
  assert.ok(await waitDead(grandchild), 'grandchild killed')
  assert.ok(report.killed.some((k) => k.pid === grandchild))
})

test('a PID with the same number but another start time is NOT killed', async () => {
  const procs = path('procs.jsonl')
  const other = spawn('/bin/sleep', ['30'], { stdio: 'ignore', detached: true })
  strays.push(other.pid)
  await new Promise((r) => setTimeout(r, 100))
  const j = openJournal(procs)
  const id = j.intent('pr3-sonnet', { runId: 'r-reuse', spawnId: 'x' })
  appendLine(procs, { t: 'spawned', id, pid: other.pid, pgid: other.pid, start: 'Mon Jan  1 00:00:00 2024' })
  const report = reconcileOrphans({ procsPath: procs, runId: 'r-reuse' })
  await new Promise((r) => setTimeout(r, 200))
  assert.ok(alive(other.pid), 'unrelated process left alone')
  assert.ok(report.mismatched.some((m) => m.pid === other.pid))
  assert.equal(report.killed.length, 0)
})

test('a spawn intent with no pid is still found through the run id', async () => {
  const procs = path('procs.jsonl')
  const j = openJournal(procs)
  // The orchestrator wrote the intent and died before it could record the pid.
  const id = j.intent('pr4-sol', { runId: 'r-nopid' })
  const { cmd, args, env } = trackedSpawnArgs('r-nopid', id, '/bin/sleep', ['30'])
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, env: { ...process.env, ...env } })
  strays.push(child.pid)
  await new Promise((r) => setTimeout(r, 150))
  const report = reconcileOrphans({ procsPath: procs, runId: 'r-nopid' })
  assert.ok(await waitDead(child.pid), 'found and killed')
  assert.ok(report.foundByRunId.some((k) => k.pid === child.pid))
})

test('reconciling a run with nothing left alive kills nothing', () => {
  const procs = path('procs.jsonl')
  const report = reconcileOrphans({ procsPath: procs, runId: 'r-empty' })
  assert.deepEqual(report.killed, [])
})
