// The brand bench's command line (brand step trial bench, #320), each subcommand against a test database: kits, run
// (refusals with their reasons, a run id at once), list, status, cancel and get (the brand file, its images, every
// rejected attempt, the gate results per round, run meta, the turns log, the cost split). No key is ever printed.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/brand-step/brand-cli.js'
import { fileDb } from './_db.mjs'
import {
  API_KEY,
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  KIT_REF,
  runOnce,
  saveCall,
  SECRET
} from './_brand-bench.mjs'
import { readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

function cli(c, extra = {}) {
  const out = []
  const err = []
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-cli-'))
  return {
    out,
    err,
    dir,
    done: () => rmSync(dir, { recursive: true, force: true }),
    run: (argv) =>
      runCli(argv, {
        pool: db.pool,
        secret: SECRET,
        kitImages: readyKitImages(),
        wiring: fakeWiring({ files: c.files }),
        runDir: () => path.join(dir, 'run'),
        cwd: dir,
        out: (l) => out.push(l),
        err: (l) => err.push(l),
        ...extra
      })
  }
}

test('kits lists the kit and whether the brand step can run on it', opts, async () => {
  const k = cli(await brandCase())
  assert.equal(await k.run(['kits']), 0)
  assert.match(k.out.join('\n'), new RegExp(`${KIT_REF}.*images ready`))
  k.done()
})

test('run queues a run from a brief file and prints its id; refusals say why and exit 1', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const k = cli(c)
  writeFileSync(path.join(k.dir, 'brief.json'), JSON.stringify(c.brief))
  assert.equal(await k.run(['run', '--kit', KIT_REF, '--brief-file', 'brief.json']), 1)
  assert.match(k.err.join(' '), /BRAND_AGENT_DOOR_UNSET/)
  await assignBrandDoors(pool)
  assert.equal(await k.run(['run', '--kit', KIT_REF, '--brief-file', 'brief.json', '--by', 'tester']), 0)
  const id = k.out.at(-1)
  const row = (await pool.query('select started_by, brief_source from brand_run where id = $1', [id])).rows[0]
  assert.deepEqual([row.started_by, row.brief_source], ['cli:tester', { kind: 'file', name: 'brief.json' }])
  // A second run is refused while this one is active; the brief file's path is never stored.
  assert.equal(await k.run(['run', '--kit', KIT_REF, '--brief-file', 'brief.json']), 1)
  assert.match(k.err.at(-1), /BRAND_RUN_ACTIVE.*Only one brand run at a time/)
  writeFileSync(path.join(k.dir, 'bad.json'), '{not json')
  assert.equal(await k.run(['run', '--kit', KIT_REF, '--brief-file', 'bad.json']), 1)
  assert.equal(await k.run(['run', '--brief-file', 'brief.json']), 2)
  assert.equal(
    await k.run(['run', '--kit', KIT_REF, '--brief-file', 'brief.json', '--agent-model', 'x/y']),
    2
  )
  assert.equal(
    await k.run(['run', '--kit', KIT_REF, '--brief-file', 'brief.json', '--reviewer-model', 'x/y']),
    2,
    '--reviewer-model goes with --agent-model'
  )
  assert.equal(await k.run(['cancel', id]), 0)
  assert.match(k.out.at(-1), /cancelled/)
  k.done()
})

test(
  'list, status and get show a finished run: file, images, rejected attempts, gate results, meta, turns, cost',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const bad = { ...c.brand, name: { ...c.brand.name, value: 'Wrong Name' } }
    const { run } = await runOnce(pool, c, {
      agent: [saveCall(bad, 0.2), done(0.1), saveCall(c.brand, 0.2), done(0.1)]
    })
    assert.equal(run.outcome, 'brand-file')
    const k = cli(c)
    // The pictures the tools wrote sit in the run's folder; get copies them beside the brand file.
    mkdirSync(path.join(k.dir, 'run'), { recursive: true })
    for (const [name, bytes] of c.files.map) {
      mkdirSync(path.dirname(path.join(k.dir, 'run', name)), { recursive: true })
      writeFileSync(path.join(k.dir, 'run', name), bytes)
    }
    assert.equal(await k.run(['list']), 0)
    assert.match(k.out.join('\n'), /2 rounds\s+gate ok\s+no real-page check\s+\$0\.6000/)
    k.out.length = 0
    assert.equal(await k.run(['status', run.id]), 0)
    const status = k.out.join('\n')
    assert.match(status, /state succeeded, brand file accepted/)
    assert.match(status, /cost \$0\.6000 \(agent \$0\.6000, drawing \$0\.0000, reviewer \$0\.0000\)/)
    assert.match(status, /round 0: rejected, gate rejected 1 field, fault agent/)
    assert.match(status, /round 1: accepted, gate ok/)
    assert.match(status, /prompt sha256 cf88737d/)
    k.out.length = 0
    const outDir = path.join(k.dir, 'out')
    assert.equal(await k.run(['get', run.id, '--out', outDir]), 0)
    const files = readdirSync(outDir, { recursive: true }).map(String)
    for (const f of [
      'brand-file.json',
      'rejected/round-0.brand-file.json',
      'gate/round-0.json',
      'gate/round-1.json',
      'run.json',
      'turns.json',
      'calls.json',
      'cost.json'
    ])
      assert.ok(files.includes(f), f)
    assert.deepEqual(JSON.parse(readFileSync(path.join(outDir, 'brand-file.json'), 'utf8')), c.brand)
    assert.equal(
      JSON.parse(readFileSync(path.join(outDir, 'gate/round-0.json'), 'utf8')).sentBack[0].field,
      'name.value'
    )
    assert.equal(JSON.parse(readFileSync(path.join(outDir, 'cost.json'), 'utf8')).agent, 0.6)
    assert.ok(files.includes(c.brand.favicon.png32), 'the images the brand file names are written beside it')
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(outDir, 'turns.json'), 'utf8')).map((t) => t.toolCalls),
      [['save_brand_file'], [], ['save_brand_file'], []]
    )
    // No key anywhere in what the command line printed or wrote.
    const all = [
      ...k.out,
      ...files.filter((f) => f.endsWith('.json')).map((f) => readFileSync(path.join(outDir, f), 'utf8'))
    ]
    assert.ok(!all.join('\n').includes(API_KEY))
    assert.equal(await k.run(['status', '00000000-0000-4000-8000-000000000000']), 1)
    k.done()
  }
)
