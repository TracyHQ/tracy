#!/usr/bin/env node
/**
 * Daily QA state files: atomic JSON writes, the append-only intent/result journal, and the
 * per-lane PR state machine.
 *
 *   node --test scripts/test/qa-state.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { appendLine, openJournal, readLines } from '../qa/lib/journal.mjs'
import {
  advance,
  beginAttempt,
  listQueue,
  nextRunId,
  qaHome,
  readActiveRun,
  readDiscovery,
  readJson,
  readQueueEntry,
  recordTimeout,
  newQueueEntry,
  writeDiscovery,
  writeJsonAtomic,
  writeQueueEntry,
  writeRun
} from '../qa/lib/state.mjs'

const STATE = resolve(dirname(fileURLToPath(import.meta.url)), '../qa/lib/state.mjs')
const tmp = mkdtempSync(join(tmpdir(), 'qa-state-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0
const dir = () => {
  const d = join(tmp, `t${n++}`)
  mkdirSync(d, { recursive: true })
  return d
}

test('QA_HOME decides where state lives; default is ~/TCH-local/qa', () => {
  assert.equal(qaHome({ QA_HOME: '/x/y' }), '/x/y')
  assert.match(qaHome({ HOME: '/Users/z' }), /\/Users\/z\/TCH-local\/qa$/)
})

test('writeJsonAtomic round-trips and leaves no temp file behind', () => {
  const d = dir()
  const f = join(d, 'sub', 'a.json')
  writeJsonAtomic(f, { a: 1 })
  writeJsonAtomic(f, { a: 2 })
  assert.deepEqual(readJson(f), { a: 2 })
  assert.deepEqual(readdirSync(join(d, 'sub')), ['a.json'])
  assert.equal(readJson(join(d, 'missing.json'), 'fallback'), 'fallback')
})

test('a writer killed mid-write leaves the real file whole', async () => {
  const d = dir()
  const f = join(d, 'big.json')
  // Seed a known-good value, then let a child rewrite the file in a loop with large values and kill it.
  writeJsonAtomic(f, { gen: -1, pad: '' })
  const script = `
    import { writeJsonAtomic } from ${JSON.stringify(STATE)}
    const pad = 'x'.repeat(8 * 1024 * 1024)
    process.stdout.write('ready\\n')
    for (let gen = 0; ; gen++) writeJsonAtomic(${JSON.stringify(f)}, { gen, pad })
  `
  for (const delay of [30, 90, 170, 260]) {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      stdio: ['ignore', 'pipe', 'inherit']
    })
    await new Promise((r) => child.stdout.once('data', r))
    await new Promise((r) => setTimeout(r, delay))
    child.kill('SIGKILL')
    await new Promise((r) => child.once('exit', r))
    const value = JSON.parse(readFileSync(f, 'utf8'))
    assert.ok(Number.isInteger(value.gen), 'file parses as a whole value')
    assert.ok(value.gen === -1 || value.pad.length === 8 * 1024 * 1024)
  }
})

test('journal: an intent without a result comes back as unknown, with its data', () => {
  const d = dir()
  const j = openJournal(join(d, 'issues.jsonl'))
  const a = j.intent('pr745', { nonce: 'n1' })
  j.result(a, { issue: 12 })
  const b = j.intent('pr746', { nonce: 'n2' })
  const unknown = j.unknown()
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].id, b)
  assert.equal(unknown[0].key, 'pr746')
  assert.equal(unknown[0].nonce, 'n2')
  // A second journal object on the same file sees the same thing (state lives in the file).
  assert.deepEqual(
    openJournal(join(d, 'issues.jsonl'))
      .unknown()
      .map((e) => e.id),
    [b]
  )
  assert.equal(j.resultOf(a).issue, 12)
  assert.equal(j.resultOf(b), null)
})

test('journal: a torn last line (writer died mid-line) is skipped, earlier lines survive', () => {
  const d = dir()
  const f = join(d, 'x.jsonl')
  appendLine(f, { t: 'intent', id: 'i1', key: 'k' })
  writeFileSync(f, `${readFileSync(f, 'utf8')}{"t":"result","id":"i1"`, 'utf8')
  const { lines, torn } = readLines(f)
  assert.equal(lines.length, 1)
  assert.equal(torn, 1)
  // The next append starts on its own line, so the torn fragment cannot glue onto it.
  appendLine(f, { t: 'result', id: 'i1' })
  assert.equal(readLines(f).lines.length, 2)
  assert.equal(openJournal(f).unknown().length, 0)
})

test('queue entry round-trips; listQueue ignores temp files', () => {
  const home = dir()
  const e = newQueueEntry(
    { number: 745, mergeCommit: 'abc', kind: 'apps', priority: 2, firstSeen: '20261003a' },
    ['sonnet', 'sol']
  )
  writeQueueEntry(home, e)
  writeFileSync(join(home, 'state', 'queue', '.pr-9.json.123.tmp'), '{', 'utf8')
  assert.deepEqual(readQueueEntry(home, 745), e)
  assert.deepEqual(
    listQueue(home).map((x) => x.number),
    [745]
  )
  assert.equal(e.lanes.sonnet.state, 'queued')
  assert.equal(e.lanes.sol.attempts, 0)
})

test('state machine: forward steps only, terminal states are final', () => {
  let e = newQueueEntry({ number: 1, mergeCommit: 'a' }, ['sonnet'])
  for (const s of ['planned', 'written', 'rerun', 'verified', 'reported']) e = advance(e, 'sonnet', s)
  assert.equal(e.lanes.sonnet.state, 'reported')
  e = newQueueEntry({ number: 1, mergeCommit: 'a' }, ['sonnet'])
  assert.throws(() => advance(e, 'sonnet', 'written'), /queued -> written/)
  e = advance(e, 'sonnet', 'skipped', { reason: 'docs only' })
  assert.equal(e.lanes.sonnet.reason, 'docs only')
  assert.throws(() => advance(e, 'sonnet', 'planned'), /skipped/)
  assert.throws(() => advance(e, 'nope', 'planned'), /lane/)
})

test('a PR that times out twice gives up; once returns it to the queue', () => {
  let e = newQueueEntry({ number: 2, mergeCommit: 'b' }, ['sol'])
  e = advance(e, 'sol', 'planned')
  e = recordTimeout(e, 'sol')
  assert.equal(e.lanes.sol.state, 'queued')
  assert.equal(e.lanes.sol.timeouts, 1)
  e = advance(e, 'sol', 'planned')
  e = recordTimeout(e, 'sol')
  assert.equal(e.lanes.sol.state, 'gave-up')
  assert.equal(e.lanes.sol.timeouts, 2)
})

test('an interrupted state is redone with attempts + 1', () => {
  let e = newQueueEntry({ number: 3, mergeCommit: 'c' }, ['sonnet'])
  e = beginAttempt(e, 'sonnet')
  e = beginAttempt(e, 'sonnet')
  assert.equal(e.lanes.sonnet.attempts, 2)
  assert.equal(e.lanes.sonnet.state, 'queued')
  e = advance(e, 'sonnet', 'planned')
  assert.equal(e.lanes.sonnet.attempts, 0, 'a new state starts its own count')
})

test('discovery and run lease', () => {
  const home = dir()
  assert.equal(readDiscovery(home).discoveredThrough, null)
  writeDiscovery(home, 'deadbeef')
  assert.equal(readDiscovery(home).discoveredThrough, 'deadbeef')
  const now = Date.parse('2026-10-03T19:00:00Z')
  writeRun(home, { runId: '20261003a', laneKeyHashes: { sonnet: 'h' }, leaseUntil: now + 60_000 })
  assert.equal(readActiveRun(home, now).runId, '20261003a')
  assert.equal(readActiveRun(home, now + 61_000), null, 'expired lease = no run')
  writeFileSync(join(home, 'state', 'run.json'), 'garbage', 'utf8')
  assert.equal(readActiveRun(home, now), null, 'unreadable = no run')
})

test('nextRunId: machine date plus the next free letter', () => {
  const home = dir()
  const at = new Date(2026, 9, 3, 23, 0)
  assert.equal(nextRunId(home, at), '20261003a')
  mkdirSync(join(home, 'r', '20261003a'), { recursive: true })
  mkdirSync(join(home, 'r', '20261003b'), { recursive: true })
  assert.equal(nextRunId(home, at), '20261003c')
  assert.ok(!existsSync(join(home, 'r', '20261003c')))
})
