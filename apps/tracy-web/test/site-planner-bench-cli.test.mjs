// The site planner bench CLI (ADR 0041, #301), run inside the tracy-web container: list kits, start a run from a
// brief file or a WO revision, read its state, download everything it produced, cancel it. No output carries a key.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/site-planner/bench-cli.js'
import { createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { API_KEY, assignPlannerDoor, KIT_REF, MODEL, readyKitImages, SECRET } from './_site-planner-bench.mjs'
import { brief, plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'site-planner-cli-'))
  writeFileSync(path.join(dir, 'hsc.json'), JSON.stringify(brief()))
})
after(() => dir && rmSync(dir, { recursive: true, force: true }))

/** Kit images whose zip does not match the kit: what a tampered or re-cut release looks like. */
const unusableKitImages = () => ({
  ensure: async () => ({
    ok: false,
    code: 'SITE_PLANNER_KIT_IMAGE_MISMATCH',
    reason: '3 image(s) in template-kit-ja-boxing-1.0.10.zip do not match the sha256 the kit lists'
  })
})

async function cli(...argv) {
  return cliWith(readyKitImages(), ...argv)
}

async function cliWith(kitImages, ...argv) {
  const out = []
  const err = []
  const code = await runCli(argv, {
    pool: db.pool,
    secret: SECRET,
    kitImages,
    cwd: dir,
    out: (line) => out.push(line),
    err: (line) => err.push(line)
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

const runCount = async () =>
  (await db.pool.query('select count(*)::int as n from site_planner_run')).rows[0].n

test('without a command it prints the usage', opts, async () => {
  const r = await cli()
  assert.equal(r.code, 2)
  assert.match(r.err, /usage/i)
  assert.match(r.err, /run --kit/)
})

test('kits lists the kits the server can read', opts, async () => {
  const r = await cli('kits')
  assert.equal(r.code, 0)
  assert.match(r.out, /ja-boxing\/j6\/1\.0\.10\s.*110 images  images ready/)
  const unusable = await cliWith(unusableKitImages(), 'kits')
  assert.equal(unusable.code, 0)
  assert.match(unusable.out, /110 images  images not usable: SITE_PLANNER_KIT_IMAGE_MISMATCH: 3 image\(s\)/)
})

test('run refuses a kit whose images are not usable, with the reason, and queues nothing', opts, async () => {
  await assignPlannerDoor(db.pool)
  const r = await cliWith(unusableKitImages(), 'run', '--brief-file', 'hsc.json', '--kit', KIT_REF)
  assert.equal(r.code, 1)
  assert.match(r.err, /^SITE_PLANNER_KIT_IMAGE_MISMATCH: 3 image\(s\) .* do not match/)
  assert.equal(await runCount(), 0)
})

test(
  'run queues a brief file and prints the run id; a second run is refused naming the first',
  opts,
  async () => {
    await assignPlannerDoor(db.pool)
    const first = await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF, '--by', 'bench-operator')
    assert.equal(first.code, 0, first.err)
    assert.match(first.out, /^[0-9a-f-]{36}$/)
    const row = (await db.pool.query('select started_by, brief_source from site_planner_run')).rows[0]
    assert.equal(row.started_by, 'cli:bench-operator')
    assert.deepEqual(row.brief_source, { kind: 'file', name: 'hsc.json' })
    const second = await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF)
    assert.equal(second.code, 1)
    assert.match(second.err, new RegExp(first.out))
  }
)

test('run refuses a bad brief, a bad kit or bad options, and queues nothing', opts, async () => {
  await assignPlannerDoor(db.pool)
  writeFileSync(path.join(dir, 'broken.json'), '{ not json')
  writeFileSync(path.join(dir, 'shape.json'), JSON.stringify({ facts: [] }))
  const notJson = await cli('run', '--brief-file', 'broken.json', '--kit', KIT_REF)
  assert.equal(notJson.code, 1)
  assert.match(notJson.err, /not JSON/)
  const shape = await cli('run', '--brief-file', 'shape.json', '--kit', KIT_REF)
  assert.match(shape.err, /facts must be a non-empty list/)
  assert.equal((await cli('run', '--brief-file', 'none.json', '--kit', KIT_REF)).code, 1)
  assert.match((await cli('run', '--brief-file', 'hsc.json', '--kit', 'x/y/1')).err, /No readable kit/)
  const unknown = await cli(
    'run',
    '--brief-revision',
    '00000000-0000-4000-8000-000000000000',
    '--kit',
    KIT_REF
  )
  assert.match(unknown.err, /No WO revision/)
  assert.equal((await cli('run', '--kit', KIT_REF)).code, 2)
  assert.equal(
    (await cli('run', '--brief-file', 'hsc.json', '--brief-revision', 'x', '--kit', KIT_REF)).code,
    2
  )
  assert.equal((await cli('run', '--brief-file', 'hsc.json')).code, 2)
  assert.equal((await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF, '--by', 'a b')).code, 2)
  assert.equal(await runCount(), 0)
})

test('status, list and get show a finished run, and nothing written carries a key', opts, async () => {
  await assignPlannerDoor(db.pool)
  const id = (await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF)).out
  const model = scriptedModel([
    toolCallReply({
      calls: [['read_kit_part', { id: 'contents' }]],
      usage: usageOf({ cost: 0.5, cached: 900 })
    }),
    finalReply({ content: JSON.stringify(plan()), usage: usageOf({ cost: 1.25 }) })
  ])
  await createSitePlannerQueue({
    pool: db.pool,
    secret: SECRET,
    kitImages: readyKitImages(),
    fetchImpl: model.fetchImpl,
    log: quiet
  }).drain()

  const status = await cli('status', id)
  assert.equal(status.code, 0)
  assert.match(status.out, /state\s+succeeded/)
  assert.match(status.out, /turns\s+2/)
  assert.match(status.out, /cost\s+\$1\.7500/)
  assert.match(status.out, /checker\s+site-plan-check\/\d+: \d+ pass, \d+ fail, \d+ skip/)
  assert.match((await cli('list')).out, new RegExp(`${id}\\s+succeeded`))

  const out = path.join(dir, 'export')
  const got = await cli('get', id, '--out', out)
  assert.equal(got.code, 0, got.err)
  const files = readdirSync(out).sort()
  assert.deepEqual(files, [
    'brief.json',
    'check-v1.json',
    'failures-v1.txt',
    'plan-v1.json',
    'run.json',
    'turns.jsonl'
  ])
  const read = (name) => readFileSync(path.join(out, name), 'utf8')
  assert.deepEqual(JSON.parse(read('plan-v1.json')), plan())
  const meta = JSON.parse(read('run.json'))
  assert.match(meta.promptSha256, /^[0-9a-f]{64}$/)
  assert.equal(meta.checkerVersion, 'site-plan-check/4')
  assert.equal(meta.door.model, MODEL)
  assert.equal(meta.harness.effort, 'medium')
  const turns = read('turns.jsonl').trim().split('\n').map(JSON.parse)
  assert.equal(turns.length, 2)
  assert.deepEqual(turns[0].toolCalls, [{ name: 'read_kit_part', arguments: '{"id":"contents"}' }])
  assert.equal(turns[0].usage.cachedTokens, 900)
  for (const name of files) assert.equal(read(name).includes(API_KEY), false, name)
  assert.equal(status.out.includes(API_KEY), false)
})

test('cancel ends a waiting run; a second cancel is refused', opts, async () => {
  await assignPlannerDoor(db.pool)
  const id = (await cli('run', '--brief-file', 'hsc.json', '--kit', KIT_REF)).out
  const cancelled = await cli('cancel', id)
  assert.equal(cancelled.code, 0)
  assert.match(cancelled.out, /cancelled/)
  assert.equal((await cli('cancel', id)).code, 1)
  assert.equal((await cli('status', 'not-a-run')).code, 1)
})
