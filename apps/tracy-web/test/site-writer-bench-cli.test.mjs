// The site writer bench CLI (#329), run inside the tracy-web container: start a run from a plan file, a brief file and
// a kit, read its state, download everything it produced (every copy version, corrections, checks, failure lists,
// turns, the final site-copy.json and its contract mapping), cancel it. No output carries a key. The model is a fake.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/site-writer/bench-cli.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  API_KEY,
  assignWriterDoor,
  balances,
  brief,
  drain,
  KIT_REF,
  kitIndex,
  plan,
  reply,
  SECRET,
  writerAnswer
} from './_site-writer-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)
let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'site-writer-cli-'))
  writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan()))
  writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief()))
  writeFileSync(path.join(dir, 'broken.json'), '{ not json')
})
after(() => dir && rmSync(dir, { recursive: true, force: true }))

async function cli(...argv) {
  const out = []
  const err = []
  const code = await runCli(argv, {
    pool: db.pool,
    secret: SECRET,
    index: kits.index,
    cwd: dir,
    out: (line) => out.push(line),
    err: (line) => err.push(line)
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

const runCount = async () => (await db.pool.query('select count(*)::int as n from site_writer_run')).rows[0].n
const START = ['run', '--plan-file', 'plan.json', '--kit', KIT_REF, '--brief-file', 'brief.json']

test('wrong usage prints the usage, exits 2 and queues nothing', opts, async () => {
  await assignWriterDoor(db.pool)
  const cases = [
    [[], /usage/i],
    [['nope'], /unknown command "nope"/],
    [['run', '--kit', KIT_REF, '--brief-file', 'brief.json'], /run needs --plan-file/],
    [['run', '--plan-file', 'plan.json', '--brief-file', 'brief.json'], /run needs --kit/],
    [
      ['run', '--plan-file', 'plan.json', '--kit', KIT_REF],
      /exactly one of --brief-file and --brief-revision/
    ],
    [[...START, '--brief-revision', 'x'], /exactly one of --brief-file and --brief-revision/],
    [[...START, '--by', 'two words'], /--by takes letters/],
    [['status'], /status needs a run id/],
    [['get', '00000000-0000-0000-0000-000000000000'], /get needs --out/],
    [['run', '--bogus'], /Unknown option/],
    [[...START, '--pages-per-turn', 'two'], /--pages-per-turn takes a positive whole number or "all"/],
    [[...START, '--pages-per-turn', '0'], /--pages-per-turn takes a positive whole number or "all"/]
  ]
  for (const [argv, message] of cases) {
    const r = await cli(...argv)
    assert.equal(r.code, 2, argv.join(' '))
    assert.match(r.err, message, argv.join(' '))
    assert.match(r.err, /usage: node scripts\/site-writer-bench\.mjs/)
  }
  assert.equal(await runCount(), 0)
})

test('run refuses unreadable files, an unknown kit and an unset door, with the reason', opts, async () => {
  const unset = await cli(...START)
  assert.equal(unset.code, 1)
  assert.match(unset.err, /^SITE_WRITER_DOOR_UNSET: /)
  await assignWriterDoor(db.pool)
  const missing = await cli('run', '--plan-file', 'gone.json', '--kit', KIT_REF, '--brief-file', 'brief.json')
  assert.equal(missing.code, 1)
  assert.equal(missing.err, 'Cannot read the plan file gone.json (ENOENT).')
  const broken = await cli('run', '--plan-file', 'plan.json', '--kit', KIT_REF, '--brief-file', 'broken.json')
  assert.equal(broken.err, 'The brief file broken.json is not JSON.')
  const kit = await cli(
    'run',
    '--plan-file',
    'plan.json',
    '--kit',
    'other/j6/1.0.0',
    '--brief-file',
    'brief.json'
  )
  assert.match(
    kit.err,
    /^SITE_WRITER_KIT_UNKNOWN: No readable kit "other\/j6\/1\.0\.0"\. Readable kits: demo-gym/
  )
  const revision = await cli(
    'run',
    '--plan-file',
    'plan.json',
    '--kit',
    KIT_REF,
    '--brief-revision',
    'not-a-uuid'
  )
  assert.equal(revision.err, 'No WO revision not-a-uuid.')
  assert.equal(await runCount(), 0)
})

test('run, list, status and get: a finished run is downloaded with every file', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await cli(...START, '--by', 'tester')
  assert.equal(started.code, 0, started.err)
  const runId = started.out
  assert.match(runId, /^[0-9a-f-]{36}$/)
  const queued = await cli('status', runId)
  assert.match(queued.out, /state\s+queued \(waiting\)/)

  const failing = writerAnswer()
  failing.slots.find((s) => s.slot === 'block-2.1').text = 'Train with a coach who knows you and your goals'
  const model = scriptedModel([
    reply(failing),
    reply({ slots: [{ slot: 'block-2.1', text: 'Train with a coach who knows you' }] })
  ])
  await drain(pool, {
    fetchImpl: model.fetchImpl,
    index: kits.index,
    balanceFetch: balances(['5.00', '4.98']).fetchImpl
  })

  const list = await cli('list')
  assert.match(list.out, new RegExp(`^${runId}  succeeded  done .* ${KIT_REF}  cli:tester `))
  const status = await cli('status', runId)
  assert.match(status.out, /state\s+succeeded \(after round 1\)/)
  assert.match(status.out, /model\s+deepseek-flash/)
  assert.match(status.out, /balance\s+before 5\.00 USD, after 4\.98 USD/)
  assert.match(status.out, /checker\s+site-copy-check\/3: 11 pass, 0 fail/)

  const got = await cli('get', runId, '--out', 'files')
  assert.equal(got.code, 0, got.err)
  assert.match(got.out, /no failures standing/)
  const files = readdirSync(path.join(dir, 'files')).sort()
  assert.deepEqual(files, [
    'brief.json',
    'changes-v2.json',
    'check-v1.json',
    'check-v2.json',
    'copy-v1.json',
    'copy-v2.json',
    'failures-v1.txt',
    'failures-v2.txt',
    'mapping.json',
    'plan.json',
    'run.json',
    'site-copy.json',
    'turns.jsonl'
  ])
  const read = (name) => readFileSync(path.join(dir, 'files', name), 'utf8')
  const final = JSON.parse(read('site-copy.json'))
  assert.deepEqual(final, JSON.parse(read('copy-v2.json')))
  assert.equal(final.slots.find((s) => s.slot === 'block-2.1').text, 'Train with a coach who knows you')
  assert.deepEqual(JSON.parse(read('changes-v2.json')), [
    { in: 'slots', slot: 'block-2.1', text: 'Train with a coach who knows you' }
  ])
  assert.match(read('failures-v1.txt'), /^W03 \|.*block-2\.1/)
  assert.equal(read('failures-v2.txt'), '')
  const mapping = JSON.parse(read('mapping.json'))
  assert.equal(mapping.mapping.contract, KIT_REF)
  assert.equal(mapping.mapping.changes['module-1.1'], 'Join us')
  assert.equal(mapping.mapping.changes['module-2.1'], 'Train with a coach who knows you')
  assert.deepEqual(mapping.problems, [])
  assert.equal(mapping.extras.alts['block-2.f1'], final.alts[0].text)
  assert.deepEqual(JSON.parse(read('plan.json')).kit, plan().kit)
  const meta = JSON.parse(read('run.json'))
  assert.equal(meta.planSource.name, 'plan.json')
  assert.match(meta.planSha256, /^[0-9a-f]{64}$/)
  assert.equal(meta.rounds.length, 2)
  const turns = read('turns.jsonl').trim().split('\n').map(JSON.parse)
  assert.equal(turns.length, 2)
  for (const t of turns) {
    assert.ok(t.costUsd > 0, 'each call has its cost')
    assert.ok(t.dispatchedAt && t.answeredAt, 'each call has its time')
  }
  const everything = files.map(read).join('\n') + status.out + got.out
  assert.ok(!everything.includes(API_KEY), 'no file or line carries the key')
})

test('cancel ends a run nobody holds, and refuses one that has ended', opts, async () => {
  await assignWriterDoor(db.pool)
  const runId = (await cli(...START)).out
  const cancelled = await cli('cancel', runId)
  assert.equal(cancelled.code, 0)
  assert.equal(cancelled.out, `${runId} cancelled`)
  const again = await cli('cancel', runId)
  assert.equal(again.code, 1)
  assert.match(again.err, /has already ended \(cancelled\)/)
  const none = await cli('status', '00000000-0000-0000-0000-000000000000')
  assert.equal(none.code, 1)
})

test(
  'run --pages-per-turn freezes pages per turn on the run; without it the whole site is one turn',
  opts,
  async () => {
    await assignWriterDoor(db.pool)
    const two = await cli(...START, '--pages-per-turn', '2')
    assert.equal(two.code, 0, two.err)
    const harnessOf = async (id) =>
      (await db.pool.query('select harness from site_writer_run where id = $1', [id])).rows[0].harness
    assert.equal((await harnessOf(two.out)).pagesPerTurn, 2)
    await cli('cancel', two.out)
    const all = await cli(...START)
    assert.equal(all.code, 0, all.err)
    assert.equal((await harnessOf(all.out)).pagesPerTurn, 'all')
  }
)
