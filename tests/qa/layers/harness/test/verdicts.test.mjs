/**
 * The verdict contract, driven through the REAL runner with synthetic assertions (hooks), so every
 * rule of plan §2 is checked without a runtime: known-good → PASS only with a RED proof, injected
 * fault → FAIL, missing dependency → ENV, no RED → PENDING, target policy, live-model default.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { exitCodeOf, judge, run } from '../index.mjs'
import { probeLive, runLive } from '../live-model.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const base = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'verdicts-'))
after(() => fs.rmSync(base, { recursive: true, force: true }))

let counter = 0
const outDir = () => path.join(base, `out-${(counter += 1)}`)

const manifest = (id, extra = {}) => ({
  id: `QA-HARNESS-${id}`,
  itemIds: ['dispatcher:session-loop'],
  requirement: 'synthetic',
  oracle: { source: 'selftest', ref: 'selftest', invariant: 'the fixture file says GOOD' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: ['fixture'], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: [`harness.selftest.${id}`],
  redProof: null,
  legacyIds: [],
  ...extra
})

const good = path.join(base, 'good.txt')
const bad = path.join(base, 'bad.txt')
fs.writeFileSync(good, 'GOOD')
fs.writeFileSync(bad, 'BROKEN')

/** An assertion reading the fixture the mutant replaces: GOOD on the product, BROKEN on the mutant. */
const readsFixture = (behaviour = {}) => ({
  runtime: 'none',
  run: async ({ paths }) => ({
    controls:
      behaviour.control === false
        ? [{ id: 'boots', ok: false, detail: 'control broke' }]
        : [{ id: 'boots', ok: true, detail: '' }],
    checks: [
      {
        id: 'says-good',
        ok: readTextSync(paths.fixture ?? good) === 'GOOD',
        detail: 'fixture text'
      }
    ],
    evidence: {}
  })
})

const mutant = (id, { throws = false, keep = false } = {}) => ({
  id,
  title: `selftest mutant ${id}`,
  applies: () => true,
  prepare() {
    if (throws) throw new Error('the mutation anchor is gone')
    return { paths: keep ? {} : { fixture: bad }, changed: [{ file: bad, sha256: 'a'.repeat(64) }] }
  }
})

const hooks = (resolveMap, mutants = [], extra = {}) => ({
  resolve: (id) => resolveMap[id] ?? null,
  mutants,
  mutantsFor: () => mutants,
  probe: () => [],
  ...extra
})

test('known-good + RED proof → PASS with a proof log naming the failing assertion', async () => {
  const out = outDir()
  const results = await run({
    cases: [manifest('pass')],
    proveRed: true,
    outDir: out,
    hooks: hooks({ 'harness.selftest.pass': readsFixture() }, [mutant('flip')])
  })
  assert.equal(results[0].verdict, 'PASS', results[0].reason)
  assert.equal(results[0].redProof.kind, 'mutation')
  assert.equal(results[0].redProof.assertionId, 'says-good')
  const log = JSON.parse(readTextSync(path.join(out, results[0].redProof.log)))
  assert.equal(log.mutant.id, 'flip')
  assert.deepEqual(
    log.onMutant.failedChecks.map((c) => c.id),
    ['says-good']
  )
  assert.ok(log.positiveControl.controlsPassed.includes('boots'), 'the positive control is part of the proof')
  assert.equal(exitCodeOf(results), 0)
})

test('known-good without --prove-red is PENDING, never PASS', async () => {
  const results = await run({
    cases: [manifest('nored')],
    proveRed: false,
    outDir: outDir(),
    hooks: hooks({ 'harness.selftest.nored': readsFixture() }, [mutant('flip')])
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /no RED proof/)
  assert.equal(results[0].redProof, null)
  assert.equal(exitCodeOf(results), 3)
})

test('a case with no applicable mutation stays PENDING and says why', async () => {
  const results = await run({
    cases: [manifest('nomut')],
    proveRed: true,
    outDir: outDir(),
    hooks: hooks({ 'harness.selftest.nomut': readsFixture() }, [])
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /no RED proof/)
})

test('a surviving mutant is not a RED proof', async () => {
  const results = await run({
    cases: [manifest('survive')],
    proveRed: true,
    outDir: outDir(),
    hooks: hooks({ 'harness.selftest.survive': readsFixture() }, [mutant('noop', { keep: true })])
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /noop survived/)
})

test('a mutation that cannot be applied or does not boot is not a RED proof', async () => {
  const results = await run({
    cases: [manifest('anchor')],
    proveRed: true,
    outDir: outDir(),
    hooks: hooks({ 'harness.selftest.anchor': readsFixture() }, [mutant('gone', { throws: true })])
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /not-applicable/)
  const broken = hooks(
    {
      'harness.selftest.boot': {
        runtime: 'none',
        run: async ({ paths }) => ({
          controls: [{ id: 'boots', ok: paths.fixture === undefined, detail: 'mutant does not boot' }],
          checks: [{ id: 'says-good', ok: true, detail: '' }]
        })
      }
    },
    [mutant('noboot')]
  )
  const r2 = await run({ cases: [manifest('boot')], proveRed: true, outDir: outDir(), hooks: broken })
  assert.equal(r2[0].verdict, 'PENDING')
  assert.match(r2[0].reason, /invalid-mutant/)
})

test('an injected fault is a FAIL carrying the first failing check', async () => {
  const results = await run({
    cases: [manifest('fault')],
    proveRed: true,
    outDir: outDir(),
    hooks: hooks({
      'harness.selftest.fault': {
        runtime: 'none',
        run: async () => ({
          controls: [],
          checks: [{ id: 'canary-unchanged', ok: false, detail: 'hash moved' }]
        })
      }
    })
  })
  assert.equal(results[0].verdict, 'FAIL')
  assert.match(results[0].reason, /canary-unchanged: hash moved/)
  assert.equal(exitCodeOf(results), 1)
})

test('a failing positive control is TEST_INVALID (PENDING), not a product FAIL', async () => {
  const results = await run({
    cases: [manifest('control')],
    proveRed: true,
    outDir: outDir(),
    hooks: hooks({ 'harness.selftest.control': readsFixture({ control: false }) })
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /TEST_INVALID: positive control failed/)
})

test('a throwing scenario is TEST_INVALID, an unregistered assertion too — never a PASS', async () => {
  const results = await run({
    cases: [manifest('throws'), manifest('unregistered')],
    outDir: outDir(),
    hooks: hooks({
      'harness.selftest.throws': {
        runtime: 'none',
        run: async () => {
          throw new Error('scenario blew up')
        }
      }
    })
  })
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[0].reason, /TEST_INVALID: scenario threw/)
  assert.equal(results[1].verdict, 'PENDING')
  assert.match(results[1].reason, /no assertion registered/)
})

test('a missing build output proven by the probe is ENV and names the probe', async () => {
  const results = await run({
    cases: [manifest('env', { prerequisites: ['dsh-built-submodule'] })],
    outDir: outDir(),
    hooks: hooks(
      { 'harness.selftest.env': { runtime: 'shared', run: async () => assert.fail('must not run') } },
      [],
      { probe: () => ['/x/vendor/dsh/lib/index.js'] }
    )
  })
  assert.equal(results[0].verdict, 'ENV')
  assert.match(
    results[0].reason,
    /prerequisite probe failed — missing built output: \/x\/vendor\/dsh\/lib\/index.js/
  )
})

test('target selection: dev and prod are refused before any output is made; local runs', async () => {
  for (const target of ['dev', 'prod']) {
    const out = outDir()
    await assert.rejects(
      run({
        cases: [manifest('reads', { targets: ['local', target] })],
        target,
        outDir: out,
        hooks: hooks({})
      }),
      /refused/
    )
    assert.equal(fs.existsSync(out), false, `${target}: nothing written`)
  }
})

test('live-model cases are never run by default; with the flag but no credentials they are ENV with the probe', async () => {
  const live = manifest('live', {
    assertionIds: ['harness.live.wordpress.content-edit'],
    effects: { reads: [], writes: [], mail: false, model: true, containers: true }
  })
  let called = 0
  const spy = async (m) => ((called += 1), runLive(m, { env: {} }))
  const off = await run({ cases: [live], outDir: outDir(), hooks: hooks({}, [], { live: spy }) })
  assert.equal(off[0].verdict, 'PENDING')
  assert.match(off[0].reason, /live-model: not requested/)
  assert.equal(called, 0, 'no live call without --live-model')
  const on = await run({
    cases: [live],
    liveModel: true,
    outDir: outDir(),
    hooks: hooks({}, [], { live: spy })
  })
  assert.equal(on[0].verdict, 'ENV')
  assert.match(on[0].reason, /probe: one of DEEPSEEK_API_KEY \/ OPENROUTER_API_KEY; QA_STAND_URL/)
  assert.equal(called, 1)
})

test('live: a stand that cannot be reached is ENV with the probe; a reachable one without an adapter stays PENDING; the record names what was not measured', async () => {
  const live = manifest('live2', { assertionIds: ['harness.live.joomla.file-edit'] })
  const env = { DEEPSEEK_API_KEY: 'k', QA_STAND_URL: 'http://stand.invalid' }
  const down = await runLive(live, {
    env,
    fetchImpl: async () => {
      throw Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })
    }
  })
  assert.equal(down.verdict, 'ENV')
  assert.match(down.reason, /stand is not reachable.*ECONNREFUSED/)
  assert.equal(down.evidence.record.latencyMs, 'not-measured')
  assert.equal(down.evidence.record.provider, 'deepseek')
  const up = await runLive(live, { env, fetchImpl: async () => ({ status: 200 }) })
  assert.equal(up.verdict, 'PENDING')
  assert.match(up.reason, /driver is not connected/)
  const bad = await runLive(live, { env: { ...env, QA_STAND_URL: 'not a url' } })
  assert.equal(bad.verdict, 'ENV')
})

test('probeLive reads the environment it is given and nothing else', () => {
  assert.equal(probeLive({}).ok, false)
  assert.deepEqual(probeLive({ DEEPSEEK_API_KEY: 'k', QA_STAND_URL: 'http://stand' }).missing, [])
  assert.deepEqual(probeLive({ DEEPSEEK_API_KEY: 'k' }).missing, ['QA_STAND_URL'])
})

test('report counts equal the results and the report never claims completeness', async () => {
  const out = outDir()
  const results = await run({
    cases: [manifest('a'), manifest('b'), manifest('c')],
    proveRed: true,
    outDir: out,
    hooks: hooks(
      {
        'harness.selftest.a': readsFixture(),
        'harness.selftest.b': {
          runtime: 'none',
          run: async () => ({ controls: [], checks: [{ id: 'x', ok: false, detail: 'broken' }] })
        }
      },
      [mutant('flip')]
    )
  })
  const text = readTextSync(path.join(out, 'report.md'))
  const count = (v) => results.filter((r) => r.verdict === v).length
  assert.match(
    text,
    new RegExp(
      `PASS ${count('PASS')}  ·  FAIL ${count('FAIL')}  ·  ENV ${count('ENV')}  ·  PENDING ${count('PENDING')}  ·  RED-proven ${results.filter((r) => r.redProof).length}`
    )
  )
  assert.doesNotMatch(text, /100\s*%/)
  assert.deepEqual(
    JSON.parse(readTextSync(path.join(out, 'results.json'))).map((r) => r.id),
    results.map((r) => r.id)
  )
})

test('a run leaves no scratch folder and no half-written file behind', async () => {
  const out = outDir()
  await run({
    cases: [manifest('clean')],
    proveRed: true,
    outDir: out,
    hooks: hooks({ 'harness.selftest.clean': readsFixture() }, [mutant('flip')])
  })
  assert.equal(fs.existsSync(path.join(out, 'scratch')), false)
  const stray = fs.readdirSync(out, { recursive: true }).filter((n) => String(n).includes('.tmp-'))
  assert.deepEqual(stray, [])
})

test('judge: controls before checks', () => {
  assert.equal(judge({ controls: [{ ok: false }], checks: [{ ok: false }] }).kind, 'invalid')
  assert.equal(judge({ controls: [{ ok: true }], checks: [{ ok: false }] }).kind, 'fail')
  assert.equal(judge({ controls: [], checks: [] }).kind, 'green')
})

test('no scenario grants itself a pass: no constant ok, no `|| true`, and a positive control that does not fire fails the case', () => {
  for (const file of ['scenarios.mjs', 'fence.mjs', 'staticchecks.mjs']) {
    const text = readTextSync(new URL(`../${file}`, import.meta.url))
    assert.doesNotMatch(text, /\bok:\s*true\b/, `${file}: a check or control with a constant ok`)
    assert.doesNotMatch(text, /\|\|\s*true\b/, `${file}: \`|| true\` makes a condition vacuous`)
  }
  // a control that is false (the effect was never produced) is never a green result
  assert.equal(
    judge({ controls: [{ id: 'fired', ok: false }], checks: [{ id: 'x', ok: true }] }).kind,
    'invalid'
  )
  assert.equal(
    judge({ controls: [{ id: 'fired', ok: true }], checks: [{ id: 'x', ok: false }] }).kind,
    'fail'
  )
})
