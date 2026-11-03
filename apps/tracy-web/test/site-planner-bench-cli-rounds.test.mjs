// The site planner bench CLI on fix rounds (ADR 0041, #303): status says which fix round is running, and get writes
// every plan version, the check and the failure list of each round, the failures still standing, and a compact turns
// log with the time and the running cost of each call.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/site-planner/bench-cli.js'
import { runFiles, statusLines } from '../src/site-planner/bench-export.js'
import { createSitePlannerQueue, NOT_A_PLAN_MESSAGE } from '../src/site-planner/bench-worker.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { assignPlannerDoor, KIT_REF, readyKitImages, SECRET } from './_site-planner-bench.mjs'
import { brief, plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'site-planner-cli-rounds-'))
  writeFileSync(path.join(dir, 'hsc.json'), JSON.stringify(brief()))
})
after(() => dir && rmSync(dir, { recursive: true, force: true }))

async function cli(...argv) {
  const out = []
  const err = []
  const code = await runCli(argv, {
    pool: db.pool,
    secret: SECRET,
    kitImages: readyKitImages(),
    cwd: dir,
    out: (line) => out.push(line),
    err: (line) => err.push(line)
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

const badPlan = () => {
  const p = plan()
  delete p.site
  return p
}

async function finishedRun(replies) {
  await assignPlannerDoor(db.pool)
  const id = (await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF)).out
  const model = scriptedModel(replies)
  await createSitePlannerQueue({
    pool: db.pool,
    secret: SECRET,
    kitImages: readyKitImages(),
    fetchImpl: model.fetchImpl,
    log: quiet
  }).drain()
  return id
}

const bare = {
  id: 'r',
  status: 'queued',
  startedBy: 'cli',
  createdAt: '2026-11-03T00:00:00.000Z',
  briefSource: { kind: 'file', name: 'hsc.json' },
  kitRef: KIT_REF,
  model: 'm',
  costUsd: 0,
  attempts: 1,
  rounds: [],
  totals: { turns: 0, calls: 0, cachedTokens: 0, turnsWithoutCost: 0 }
}
const stateOf = (run) =>
  statusLines({ ...bare, ...run }, Date.parse(bare.createdAt)).find((l) => l.startsWith('state'))

test('status says what the run is doing, and which fix round', () => {
  assert.match(stateOf({ step: 'waiting', round: 0 }), /queued \(waiting\)$/)
  assert.match(stateOf({ step: 'planning', round: 0 }), /queued \(planning round 0\)$/)
  assert.match(stateOf({ step: 'fixing', round: 1 }), /queued \(fixing round 1\/2\)$/)
  assert.match(stateOf({ step: 'checking', round: 2 }), /queued \(checking round 2\)$/)
  assert.match(
    stateOf({ status: 'succeeded', step: 'done', round: 2, rounds: [{ round: 2 }] }),
    /succeeded \(after round 2\)$/
  )
})

test('status shows the call in flight: what a streamed call has received and how long since its last byte', () => {
  const now = Date.parse(bare.createdAt) + 600_000
  const callOf = (inFlight, over = {}) =>
    statusLines({ ...bare, step: 'planning', ...over, inFlight }, now).find((l) => l.startsWith('call'))
  const progress = {
    contentChars: 41_200,
    reasoningChars: 9_800,
    toolArgumentChars: 0,
    lastByteAt: new Date(now - 12_000).toISOString(),
    at: new Date(now - 3_000).toISOString()
  }
  const dispatchedAt = new Date(now - 300_000).toISOString()
  assert.equal(
    callOf({ n: 7, round: 0, dispatchedAt, streamed: true, progress }),
    'call      turn 7 (round 0) writing: 41k chars of answer, 10k of reasoning, 12s since last byte'
  )
  assert.match(
    callOf({ n: 7, round: 0, dispatchedAt, streamed: true, progress: null }),
    /nothing reported yet, sent 300s ago/
  )
  assert.match(callOf({ n: 2, round: 1, dispatchedAt, streamed: false, progress: null }), /\(not streamed\)$/)
  assert.equal(callOf(null), undefined)
  // A finished run shows no call, even with a dispatched turn left on record.
  assert.equal(
    callOf({ n: 7, round: 0, dispatchedAt, streamed: true, progress }, { status: 'failed', rounds: [] }),
    undefined
  )
})

test('a run never fixed: get writes three versions and the failures still standing', opts, async () => {
  const id = await finishedRun([
    toolCallReply({ calls: [['read_kit_part', { id: 'contents' }]], usage: usageOf({ cost: 0.5 }) }),
    finalReply({ content: JSON.stringify(badPlan()), usage: usageOf({ cost: 1 }) }),
    finalReply({ content: JSON.stringify(badPlan()), usage: usageOf({ cost: 1 }) }),
    finalReply({ content: JSON.stringify(badPlan()), usage: usageOf({ cost: 1 }) })
  ])
  const status = await cli('status', id)
  assert.match(status.out, /state\s+succeeded \(after round 2\)/)
  assert.match(status.out, /standing\s+7 failures after round 2/)

  const out = path.join(dir, 'export')
  const got = await cli('get', id, '--out', out)
  assert.equal(got.code, 0, got.err)
  const files = readdirSync(out).sort()
  assert.deepEqual(files, [
    'brief.json',
    'check-v1.json',
    'check-v2.json',
    'check-v3.json',
    'failures-standing.txt',
    'failures-v1.txt',
    'failures-v2.txt',
    'failures-v3.txt',
    'plan-v1.json',
    'plan-v2.json',
    'plan-v3.json',
    'run.json',
    'turns.jsonl'
  ])
  const read = (name) => readFileSync(path.join(out, name), 'utf8')
  assert.equal(read('failures-standing.txt'), read('failures-v3.txt'))
  assert.match(read('failures-v1.txt'), /^R09 \| /)
  // get says plainly what still fails.
  assert.match(got.out, /7 failures still standing after round 2:\nR09 \| /)
  const meta = JSON.parse(read('run.json'))
  assert.deepEqual(
    meta.rounds.map((r) => [r.round, r.state, r.summary.fail]),
    [
      [0, 'checked', 3],
      [1, 'checked', 3],
      [2, 'checked', 3]
    ]
  )
  assert.equal(meta.standingFailures, undefined)
  const turns = read('turns.jsonl').trim().split('\n').map(JSON.parse)
  assert.deepEqual(
    turns.map((t) => [t.n, t.round, t.costUsd, t.runningCostUsd]),
    [
      [0, 0, 0.5, 0.5],
      [1, 0, 1, 1.5],
      [2, 1, 1, 2.5],
      [3, 2, 1, 3.5]
    ]
  )
  assert.ok(turns.every((t) => t.dispatchedAt && t.answeredAt))
})

test('a clean run lists no standing failures', opts, async () => {
  const id = await finishedRun([finalReply({ content: JSON.stringify(plan()) })])
  const got = await cli('get', id, '--out', path.join(dir, 'clean'))
  assert.match(got.out, /no failures standing/)
  assert.equal(readdirSync(path.join(dir, 'clean')).includes('failures-standing.txt'), false)
  assert.doesNotMatch((await cli('status', id)).out, /standing/)
})

test('a round that is not a plan exports its answer and the message sent back', () => {
  const run = {
    ...bare,
    brief: brief(),
    rounds: [
      {
        round: 0,
        state: 'not_a_plan',
        answer: 'sorry',
        plan: null,
        checkResult: null,
        failureList: NOT_A_PLAN_MESSAGE
      },
      {
        round: 1,
        state: 'checked',
        answer: '{}',
        plan: plan(),
        checkResult: { summary: {} },
        failureList: ''
      }
    ]
  }
  const files = Object.fromEntries(runFiles(run, []))
  assert.equal(files['answer-v1.txt'], 'sorry')
  assert.equal(files['failures-v1.txt'], NOT_A_PLAN_MESSAGE)
  assert.ok(files['plan-v2.json'])
  assert.equal(files['plan-v1.json'], undefined)
})
