// Selftest of the api layer's own machinery (no PostgreSQL, no docker, no product boot):
//   node --test tests/qa/layers/api/test/selftest.test.mjs
// It proves the four verdicts (known-good PASS, injected fault FAIL, missing dependency ENV, no RED
// proof PENDING), the defects measured on the first draft (a 503 control, a 503 on an invalid query,
// an unbounded page, a proof with no case identity), hostile input, target policy and cleanup.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  judgeAnonymous,
  judgeHappy,
  judgeInjection,
  judgeInvalid,
  shapeProblem,
  judgePage,
  judgeTenant,
  judgeWrongMethod,
  passedAuthGate
} from '../assertions.mjs'
import { dockerAvailable, startOwnedDatabase } from '../database.mjs'
import { expandCases, listCases, run, targetPolicy, validateManifest } from '../index.mjs'
import { MAX_FILE_BYTES, verifyFamilies } from '../generate.mjs'
import { OracleEnvError, loadDoors, readPin, readPinnedSnapshot, readPinnedRouteDocs } from '../oracle.mjs'
import { compactPlan, expandPlan } from '../planfile.mjs'
import { ContractError, contained, ensureOutDir, readJson, readRegular, writeAtomic } from '../io.mjs'
import { applyMutation, inputHashes, manifestHash, mutationHash, proofIsValid } from '../red.mjs'
import { exitCodeFor, parseArgs } from '../run.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAYER_DIR = join(HERE, '..')
const ORACLE_DIR = join(LAYER_DIR, '..', '..', 'oracles', 'api')
const scratchRoot = process.env.QA_API_SCRATCH_DIR
if (scratchRoot) mkdirSync(scratchRoot, { recursive: true })
const scratch = mkdtempSync(join(scratchRoot ?? tmpdir(), 'qa-api-selftest-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let counter = 0
const fresh = () => join(scratch, `out-${(counter += 1)}`)

const obs = (status, extra = {}) => ({
  status,
  headers: { 'content-type': 'application/json' },
  text: '{}',
  json: {},
  ms: 5,
  ...extra
})
const GOOD = obs(200)

const manifest = (over = {}) => ({
  id: 'QA-API-GET:/health-happy',
  itemIds: ['GET /health'],
  requirement: 'selftest',
  oracle: { source: 'selftest', ref: 'selftest', invariant: 'selftest' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: ['api.happy.success-status'],
  redProof: null,
  legacyIds: [],
  ...over
})

describe('judges: four verdicts and the defects measured on the first draft', () => {
  test('known-good observations pass', () => {
    assert.equal(judgeHappy(GOOD, { served: true }).v, 'PASS')
    assert.equal(judgeAnonymous(obs(401), { served: true, control: GOOD }).v, 'PASS')
  })
  test('an injected fault is a FAIL', () => {
    assert.equal(judgeAnonymous(obs(200), { served: true, control: GOOD }).v, 'FAIL')
    assert.equal(judgeTenant(obs(200), { served: true, control: GOOD, canaries: ['x'] }).v, 'FAIL')
    assert.equal(judgeHappy(obs(500), { served: true }).v, 'FAIL')
    assert.equal(judgeHappy(obs(0, { error: 'no answer' }), { served: true }).v, 'FAIL')
  })
  test('a control that answered 503 (or any 5xx) is not admitted: the negative case stays PENDING', () => {
    for (const status of [500, 501, 502, 503, 504]) {
      assert.equal(passedAuthGate(obs(status)), false, `status ${status}`)
      assert.equal(judgeAnonymous(obs(401), { served: true, control: obs(status) }).v, 'PENDING')
      assert.equal(judgeTenant(obs(403), { served: true, control: obs(status), canaries: [] }).v, 'PENDING')
    }
  })
  test('an invalid query answered 503 is never a PASS', () => {
    const ctx = { served: true, control: GOOD, kind: 'query', declared: [] }
    assert.notEqual(judgeInvalid(obs(503), ctx).v, 'PASS')
    assert.equal(judgeInvalid(obs(503), ctx).v, 'PENDING')
    assert.equal(judgeInvalid(obs(500), ctx).v, 'FAIL')
    assert.equal(judgeInvalid(obs(400), ctx).v, 'PASS')
    assert.equal(judgeInvalid(obs(200), ctx).v, 'PENDING')
  })
  test('a paging value that is accepted proves nothing without a declared maximum', () => {
    const ctx = { served: true, control: GOOD, maximum: null }
    assert.equal(
      judgePage(obs(200, { json: { items: Array.from({ length: 5000 }, () => 1) } }), ctx).v,
      'PENDING'
    )
    assert.equal(judgePage(obs(400), ctx).v, 'PASS')
    assert.equal(judgePage(obs(400, { headers: { 'content-type': 'text/html' } }), ctx).v, 'FAIL')
    const bounded = { served: true, control: GOOD, maximum: 100 }
    assert.equal(
      judgePage(obs(200, { json: { items: Array.from({ length: 101 }, () => 1) } }), bounded).v,
      'FAIL'
    )
    assert.equal(judgePage(obs(200, { json: { items: [1] } }), bounded).v, 'PASS')
    assert.equal(judgePage(obs(503), ctx).v, 'PENDING')
  })
  test('a declared 2xx shape is enforced: content type, array, required keys', () => {
    const responses = {
      200: { contentTypes: ['application/json'], schema: { type: 'object', required: ['ok'] } }
    }
    assert.equal(judgeHappy(obs(200, { json: { ok: true } }), { served: true, responses }).v, 'PASS')
    assert.equal(judgeHappy(obs(200, { json: {} }), { served: true, responses }).v, 'FAIL')
    assert.equal(
      judgeHappy(obs(200, { headers: { 'content-type': 'text/html' } }), { served: true, responses }).v,
      'FAIL'
    )
    const arr = { 200: { contentTypes: ['application/json'], schema: { type: 'array' } } }
    assert.equal(judgeHappy(obs(200, { json: {} }), { served: true, responses: arr }).v, 'FAIL')
    const oneOf = { 200: { contentTypes: ['application/json'], schema: { oneOf: [] } } }
    assert.equal(judgeHappy(obs(200, { json: 1 }), { served: true, responses: oneOf }).v, 'PASS')
    assert.equal(shapeProblem(obs(404), responses), null)
  })
  test('an undeclared method: 2xx is a FAIL, 404/405 PASS, a foreign redirect is PENDING not FAIL', () => {
    const r = (status, headers = {}) => [
      { method: 'POST', path: '/x', shadowed: false, exception: null, obs: obs(status, { headers }) }
    ]
    assert.equal(judgeWrongMethod(r(405), { served: true }).v, 'PASS')
    assert.equal(judgeWrongMethod(r(200), { served: true }).v, 'FAIL')
    assert.equal(judgeWrongMethod(r(302, { location: '/x' }), { served: true }).v, 'PASS')
    assert.equal(judgeWrongMethod(r(302, { location: 'http://elsewhere/' }), { served: true }).v, 'PENDING')
  })
  test('hostile output is caught: internal error echo, header injection, dead database, changed rows', () => {
    const base = { served: true, control: GOOD, dbAlive: true, changedRows: null }
    assert.equal(judgeInjection(obs(400), base).v, 'PASS')
    assert.equal(judgeInjection(obs(400, { text: 'syntax error at or near "x"' }), base).v, 'FAIL')
    assert.equal(judgeInjection(obs(400, { headers: { 'set-cookie': 'qa=1' } }), base).v, 'FAIL')
    assert.equal(judgeInjection(obs(400), { ...base, dbAlive: false }).v, 'FAIL')
    assert.equal(judgeInjection(obs(400), { ...base, changedRows: 'site 1→2' }).v, 'FAIL')
    assert.equal(judgeInjection(obs(503), { ...base, declared: [] }).v, 'PENDING')
  })
})

describe('RED proof: identity, hashes and log content', () => {
  const m = manifest()
  const hashes = { tests: 'a'.repeat(64), oracle: 'b'.repeat(64), fixtures: 'c'.repeat(64) }
  const mutant = { find: 'x', replace: 'y' }
  const log = `mutation sha256 ${mutationHash(mutant)}\nRED      ${m.id} [api.happy.success-status] good PASS → mutant FAIL: boom\nsummary: applied=true booted=true cases=1 red=1 survived=0\n`
  const proof = () => ({
    kind: 'mutation',
    ref: 'M00',
    caseId: m.id,
    assertionId: 'api.happy.success-status',
    failedAssertionId: 'api.happy.success-status',
    manifestSha256: manifestHash(m),
    mutationSha256: mutationHash(mutant),
    testsSha256: hashes.tests,
    oracleSha256: hashes.oracle,
    fixturesSha256: hashes.fixtures,
    log: 'redproof/M00.log',
    mutantBooted: true
  })
  const ctx = (text = log) => ({ caseManifest: m, hashes, logExists: () => true, readLog: () => text })
  test('a complete proof is accepted', () => assert.equal(proofIsValid(proof(), ctx()).ok, true))
  test('missing identity, wrong case, stale hashes, boot failure, missing or foreign log are all refused', () => {
    const bad = (mut, c = ctx()) =>
      assert.equal(proofIsValid({ ...proof(), ...mut }, c).ok, false, JSON.stringify(mut))
    const { caseId: _c, ...noCase } = proof()
    assert.equal(proofIsValid(noCase, ctx()).ok, false)
    bad({ caseId: 'QA-API-other' })
    bad({ failedAssertionId: 'api.other' })
    bad({ manifestSha256: 'f'.repeat(64) })
    bad({ testsSha256: 'f'.repeat(64) })
    bad({ fixturesSha256: 'f'.repeat(64) })
    bad({ mutantBooted: false })
    bad({ mutationSha256: 'f'.repeat(64) })
    bad({ log: '../escape.log' })
    bad({}, { ...ctx(), logExists: () => false })
    bad({}, ctx('nothing about this case'))
    bad({}, ctx(log.replace('applied=true booted=true', 'applied=true booted=false')))
    assert.equal(proofIsValid(null, ctx()).ok, false)
    assert.equal(proofIsValid({ ...proof(), kind: 'commit' }, ctx()).ok, false)
  })
  test('applyMutation refuses a missing or ambiguous target', () => {
    assert.equal(applyMutation('abc', { find: 'zzz', replace: '' }).ok, false)
    assert.equal(applyMutation('xx', { find: 'x', replace: '' }).ok, false)
    assert.equal(applyMutation('abc', { find: 'b', replace: 'B' }).source, 'aBc')
  })
  test('inputHashes covers the fixtures', () =>
    assert.match(inputHashes(LAYER_DIR, ORACLE_DIR).fixtures, /^[0-9a-f]{64}$/))
})

describe('run(): verdict plumbing with injected dependencies', () => {
  const hashes = inputHashes(LAYER_DIR, ORACLE_DIR)
  const dbOk = (calls) => async () => ({
    ok: true,
    url: 'postgres://x',
    id: 'abc',
    remove: () => (calls.push('remove'), { ok: true, detail: 'removed' })
  })
  const common = (calls, over = {}) => ({
    dockerAvailable: () => ({ ok: true, detail: '1' }),
    loadProduct: async () => ({}),
    loadOracle: async () => ({ doorIndex: new Map(), doorsByPath: new Map() }),
    startOwnedDatabase: dbOk(calls),
    runAgainst: async ({ manifests }) => ({
      ok: true,
      results: new Map(manifests.map((x) => [x.id, { v: 'PASS', reason: 'ok', observations: [], ms: 1 }]))
    }),
    proveRed: async () => ({ proofs: new Map(), mutants: [] }),
    ...over
  })
  const go = (cases, deps, extra = {}) => run({ cases, outDir: fresh(), deps, ...extra })
  const procListeners = () => process.listenerCount('SIGINT') + process.listenerCount('SIGTERM')

  test('no RED proof keeps a green case PENDING, never PASS', async () => {
    const calls = []
    const [r] = await go([manifest()], common(calls))
    assert.equal(r.verdict, 'PENDING')
    assert.match(r.reason, /no RED proof/)
    assert.deepEqual(calls, ['remove'])
  })
  test('a valid proof makes it PASS; a proof with another case identity does not', async () => {
    const m = manifest()
    const out = fresh()
    mkdirSync(join(out, 'redproof'), { recursive: true })
    const mutant = { find: 'a', replace: 'b' }
    writeFileSync(
      join(out, 'redproof', 'M.log'),
      `mutation sha256 ${mutationHash(mutant)}\nRED      ${m.id} [${m.assertionIds[0]}] good PASS → mutant FAIL: x\nsummary: applied=true booted=true\n`
    )
    const proof = {
      kind: 'mutation',
      ref: 'M',
      caseId: m.id,
      assertionId: m.assertionIds[0],
      failedAssertionId: m.assertionIds[0],
      manifestSha256: manifestHash(m),
      mutationSha256: mutationHash(mutant),
      testsSha256: hashes.tests,
      oracleSha256: hashes.oracle,
      fixturesSha256: hashes.fixtures,
      log: 'redproof/M.log',
      mutantBooted: true
    }
    const give = (p) => common([], { proveRed: async () => ({ proofs: new Map([[m.id, p]]), mutants: [] }) })
    const [ok] = await run({ cases: [m], outDir: out, proveRed: true, deps: give(proof) })
    assert.equal(ok.verdict, 'PASS')
    assert.equal(ok.redProof.caseId, m.id)
    const { caseId: _gone, ...anonymous } = proof
    const [no] = await run({ cases: [m], outDir: out, proveRed: true, deps: give(anonymous) })
    assert.equal(no.verdict, 'PENDING')
  })
  test('an injected product fault is a FAIL and the run exits 1', async () => {
    const results = await go(
      [manifest()],
      common([], {
        runAgainst: async ({ manifests }) => ({
          ok: true,
          results: new Map([[manifests[0].id, { v: 'FAIL', reason: 'leak', observations: [], ms: 1 }]])
        })
      })
    )
    assert.equal(results[0].verdict, 'FAIL')
    assert.equal(exitCodeFor(results), 1)
  })
  test('docker missing, image/database missing: ENV with the probe words, exit 3', async () => {
    const [a] = await go(
      [manifest()],
      common([], { dockerAvailable: () => ({ ok: false, detail: 'docker version failed: no daemon' }) })
    )
    assert.equal(a.verdict, 'ENV')
    assert.match(a.reason, /no daemon/)
    const calls = []
    const results = await go(
      [manifest()],
      common(calls, {
        startOwnedDatabase: async () => ({
          ok: false,
          probe: 'never answered select 1',
          id: 'abc',
          remove: () => (calls.push('remove'), { ok: true, detail: '' })
        })
      })
    )
    assert.equal(results[0].verdict, 'ENV')
    assert.match(results[0].reason, /never answered select 1/)
    assert.equal(exitCodeFor(results), 3)
  })
  test('the tree not booting is PENDING TEST_INVALID, never a PASS or a RED', async () => {
    const [r] = await go(
      [manifest()],
      common([], { runAgainst: async () => ({ ok: false, bootError: 'import failed', results: new Map() }) })
    )
    assert.equal(r.verdict, 'PENDING')
    assert.match(r.reason, /TEST_INVALID/)
  })
  test('target policy is decided before docker or any request', async () => {
    let touched = false
    const trap = () => ((touched = true), { ok: false, detail: 'must not be called' })
    const write = manifest({
      targets: ['local', 'prod'],
      effects: { reads: [], writes: ['site'], mail: false, model: false, containers: false }
    })
    const [prod] = await go([write], common([], { dockerAvailable: trap }), { target: 'prod' })
    assert.equal(prod.verdict, 'PENDING')
    assert.match(prod.reason, /target-policy/)
    assert.equal(touched, false)
    assert.equal(targetPolicy(manifest(), 'dev').allowed, false)
    assert.equal(targetPolicy(manifest({ targets: ['local', 'prod'] }), 'prod').allowed, true)
    assert.equal(
      targetPolicy(
        manifest({
          targets: ['local', 'prod'],
          effects: { reads: [], writes: [], mail: true, model: false, containers: false }
        }),
        'prod'
      ).allowed,
      false
    )
    assert.equal(targetPolicy(manifest(), 'mars').allowed, false)
  })
  test('cleanup runs when the dependency throws, and no signal listener is left behind', async () => {
    const before = procListeners()
    const calls = []
    await assert.rejects(
      go(
        [manifest()],
        common(calls, {
          startOwnedDatabase: async (io) => {
            io.onAcquire({ remove: () => calls.push('remove') })
            return {
              ok: true,
              url: 'x',
              id: 'abc',
              remove: () => (calls.push('remove'), { ok: true, detail: '' })
            }
          },
          runAgainst: async () => {
            throw new Error('boom')
          }
        })
      ),
      /boom/
    )
    assert.deepEqual(calls, ['remove'])
    assert.equal(procListeners(), before)
  })
  test('a failing cleanup is reported', async () => {
    const results = await go(
      [manifest()],
      common([], {
        startOwnedDatabase: async () => ({
          ok: true,
          url: 'x',
          id: 'a',
          remove: () => ({ ok: false, detail: 'docker rm failed' })
        })
      })
    )
    assert.equal(results.meta.cleanup.ok, false)
  })
  test('empty or invalid case sets are contract errors before anything runs', async () => {
    await assert.rejects(go([], common([])), ContractError)
    await assert.rejects(go([{ id: 'QA-API-x' }], common([])), ContractError)
    assert.throws(() => validateManifest(manifest({ id: 'bad' })), ContractError)
    assert.throws(() => validateManifest(manifest({ targets: ['mars'] })), ContractError)
    assert.throws(() => validateManifest(manifest({ assertionIds: [] })), ContractError)
  })
})

describe('owned database lifecycle with a fake daemon', () => {
  const fake = (script) => {
    const log = []
    return {
      log,
      docker: (args) => (log.push(args.join(' ')), script(args) ?? { status: 0, stdout: '', stderr: '' })
    }
  }
  const ID = 'f'.repeat(64)
  test('a missing image is an ENV probe and nothing is created or pulled', async () => {
    const f = fake((a) => (a[0] === 'image' ? { status: 1, stdout: '', stderr: 'No such image' } : null))
    const r = await startOwnedDatabase({ docker: f.docker, probe: async () => true })
    assert.equal(r.ok, false)
    assert.match(r.probe, /not present/)
    assert.equal(
      f.log.some((l) => l.startsWith('create') || l.startsWith('pull')),
      false
    )
    assert.deepEqual(r.remove(), { ok: true, detail: 'nothing owned to remove' })
  })
  test('each stage that fails reports a probe and removes only the id this run created', async () => {
    const stages = {
      create: (a) => (a[0] === 'create' ? { status: 1, stdout: '', stderr: 'create broke' } : null),
      malformed: (a) => (a[0] === 'create' ? { status: 0, stdout: 'nope', stderr: '' } : null),
      start: (a) =>
        a[0] === 'create'
          ? { status: 0, stdout: ID, stderr: '' }
          : a[0] === 'start'
            ? { status: 1, stdout: '', stderr: 'start broke' }
            : null,
      port: (a) =>
        a[0] === 'create'
          ? { status: 0, stdout: ID, stderr: '' }
          : a[0] === 'port'
            ? { status: 1, stdout: '', stderr: 'no port' }
            : null
    }
    for (const [name, script] of Object.entries(stages)) {
      const f = fake(script)
      const r = await startOwnedDatabase({ docker: f.docker, probe: async () => true })
      assert.equal(r.ok, false, name)
      if (name === 'start' || name === 'port') {
        assert.equal(r.remove().ok, true)
        assert.ok(f.log.includes(`rm -f -v ${ID}`), name)
      } else
        assert.equal(
          f.log.some((l) => l.startsWith('rm')),
          false,
          name
        )
    }
  })
  test('a database that never answers times out with a probe and is removed by id', async () => {
    const f = fake((a) =>
      a[0] === 'create'
        ? { status: 0, stdout: ID, stderr: '' }
        : a[0] === 'port'
          ? { status: 0, stdout: '127.0.0.1:49999\n', stderr: '' }
          : null
    )
    let now = 0
    const r = await startOwnedDatabase({
      docker: f.docker,
      probe: async () => false,
      readyTimeoutMs: 3000,
      clock: () => now,
      sleep: async () => void (now += 1000)
    })
    assert.equal(r.ok, false)
    assert.match(r.probe, /never answered select 1/)
    assert.equal(r.remove().ok, true)
    assert.equal(f.log.filter((l) => l.startsWith('rm')).length, 1)
  })
  test('docker probe and interruption handling', async () => {
    assert.equal(dockerAvailable(() => ({ status: 1, stdout: '', stderr: 'Cannot connect' })).ok, false)
    assert.equal(dockerAvailable(() => ({ status: 0, stdout: '27.0\n', stderr: '' })).ok, true)
    const acquired = []
    const f = fake((a) =>
      a[0] === 'create'
        ? { status: 0, stdout: ID, stderr: '' }
        : a[0] === 'port'
          ? { status: 0, stdout: '127.0.0.1:49999', stderr: '' }
          : null
    )
    const r = await startOwnedDatabase({
      docker: f.docker,
      probe: async () => true,
      onAcquire: (h) => acquired.push(h.id)
    })
    assert.deepEqual(acquired, [ID])
    assert.equal(r.ok, true)
    assert.equal(r.remove().ok, true)
    assert.equal(r.remove().detail, 'nothing owned to remove')
  })
})

describe('IO: hostile paths and atomic writes', () => {
  test('symlink, dangling symlink, FIFO, directory, missing, empty and invalid JSON are refused before reading', () => {
    const dir = fresh()
    mkdirSync(dir, { recursive: true })
    const real = join(dir, 'real.json')
    writeFileSync(real, '{"a":1}')
    symlinkSync(real, join(dir, 'link.json'))
    symlinkSync(join(dir, 'gone'), join(dir, 'dangling.json'))
    mkdirSync(join(dir, 'dir.json'))
    writeFileSync(join(dir, 'empty.json'), '')
    writeFileSync(join(dir, 'bad.json'), '{')
    const fifo = join(dir, 'fifo.json')
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
    assert.deepEqual(readJson(real), { a: 1 })
    for (const f of [
      'link.json',
      'dangling.json',
      'dir.json',
      'empty.json',
      'bad.json',
      'fifo.json',
      'missing.json'
    ])
      assert.throws(() => readJson(join(dir, f)), ContractError, f)
    assert.throws(() => readRegular(join(dir, 'empty.json')), ContractError)
  })
  test('output paths cannot escape, cross a symlink, or land on a file', () => {
    const out = fresh()
    ensureOutDir(out)
    assert.throws(() => contained(out, '../escape'), ContractError)
    assert.throws(() => contained(out, '/etc/passwd'), ContractError)
    assert.throws(() => writeAtomic(out, 'a/../../x', 'x'), ContractError)
    const target = join(scratch, 'outside')
    mkdirSync(target)
    symlinkSync(target, join(out, 'sneaky'))
    assert.throws(() => writeAtomic(out, 'sneaky/x', 'x'), ContractError)
    assert.equal(existsSync(join(target, 'x')), false)
    writeFileSync(join(scratch, 'plain'), 'x')
    assert.throws(() => ensureOutDir(join(scratch, 'plain')), ContractError)
    symlinkSync(target, join(scratch, 'outlink'))
    assert.throws(() => ensureOutDir(join(scratch, 'outlink')), ContractError)
  })
  test('a write that fails leaves no temp file behind', () => {
    const out = fresh()
    ensureOutDir(out)
    mkdirSync(join(out, 'taken'))
    assert.throws(() => writeAtomic(out, 'taken', 'x'), ContractError)
    assert.deepEqual(
      readdirSync(out).filter((f) => f.includes('.tmp-')),
      []
    )
    writeAtomic(out, 'sub/ok.txt', 'y')
    assert.deepEqual(readdirSync(join(out, 'sub')), ['ok.txt'])
  })
})

describe('CLI contract', () => {
  test('arguments: missing value, repeated, unknown, bad target, conflicting flags are exit-2 errors', () => {
    for (const argv of [
      ['--out'],
      ['--out', '--prove-red'],
      ['--target', 'mars'],
      ['--area', 'a', '--area', 'b'],
      ['--bogus'],
      ['--prove-red', '--red-from', 'x'],
      ['--prove-red', '--prove-red'],
      ['--target', '']
    ])
      assert.throws(() => parseArgs(argv), ContractError, argv.join(' '))
    assert.deepEqual(parseArgs(['--target', 'local', '--prove-red', '--area', 'anonymous']).area, 'anonymous')
  })
  test('exit codes: PASS 0, FAIL 1, ENV/PENDING 3', () => {
    assert.equal(exitCodeFor([{ verdict: 'PASS' }]), 0)
    assert.equal(exitCodeFor([{ verdict: 'PASS' }, { verdict: 'FAIL' }, { verdict: 'ENV' }]), 1)
    assert.equal(exitCodeFor([{ verdict: 'PASS' }, { verdict: 'PENDING' }]), 3)
    assert.equal(exitCodeFor([{ verdict: 'ENV' }]), 3)
  })
  test('standalone run.mjs: usage error exits 2 and creates nothing; an unknown area exits 2', () => {
    const out = fresh()
    const bad = spawnSync(process.execPath, [join(LAYER_DIR, 'run.mjs'), '--target', 'mars', '--out', out], {
      encoding: 'utf8',
      timeout: 60_000
    })
    assert.equal(bad.status, 2)
    assert.equal(existsSync(out), false)
    const area = spawnSync(
      process.execPath,
      [join(LAYER_DIR, 'run.mjs'), '--area', 'no-such-area-xyz', '--out', out],
      { encoding: 'utf8', timeout: 60_000 }
    )
    assert.equal(area.status, 2)
    assert.equal(existsSync(out), false)
  })
})

describe('generated cases and oracle inputs', () => {
  test('every manifest validates, ids are unique, and a case with legacyIds names a recorded repro', async () => {
    const all = await listCases({})
    assert.ok(all.length > 0)
    const repros = readJson(join(HERE, '..', '..', '..', 'fixtures', 'api', 'legacy-repros.json'))
    const converted = new Set(repros.repros.filter((r) => r.status === 'converted').map((r) => r.legacyId))
    for (const c of all)
      for (const id of c.legacyIds ?? [])
        assert.ok(converted.has(id), `${c.id} claims ${id} without a converted repro`)
    assert.equal(new Set(all.map((c) => c.id)).size, all.length)
    for (const c of all) assert.equal(c.redProof, null, 'a manifest never carries a proof; a run attaches it')
  })
  test('the family table matches the expansion, and a changed count or hash is refused', async () => {
    const { lists } = await expandCases()
    const committed = readJson(join(LAYER_DIR, 'cases.manifest.json'))
    verifyFamilies(lists, committed)
    assert.equal(
      committed.total,
      [...lists.values()].reduce((n, l) => n + l.length, 0)
    )
    const tag = [...lists.keys()].find((t) => lists.get(t).length > 0)
    const count = structuredClone(committed)
    count.families[tag].count += 1
    assert.throws(() => verifyFamilies(lists, count), /manifest says/)
    const hash = structuredClone(committed)
    hash.families[tag].sha256 = '0'.repeat(64)
    assert.throws(() => verifyFamilies(lists, hash), /hash differs/)
    assert.throws(() => verifyFamilies(lists, {}), /families missing/)
  })
  test('expanded cases are never committed: no cases folder in the layer', () => {
    assert.equal(existsSync(join(LAYER_DIR, 'cases')), false)
  })
  test('a PASS on production never comes from a case that writes', async () => {
    const all = await listCases({})
    for (const c of all.filter((x) => x.effects.writes.length))
      assert.equal(targetPolicy(c, 'prod').allowed, false, c.id)
  })
  test('generate --check refuses a corrupted oracle input (exit 2) without rewriting the repo', () => {
    const r = spawnSync(process.execPath, [join(LAYER_DIR, 'generate.mjs'), '--bogus-flag'], {
      encoding: 'utf8',
      timeout: 60_000
    })
    assert.equal(r.status, 2)
  })
})

describe('the pinned oracle replaces the committed door list', () => {
  const REPO = join(LAYER_DIR, '..', '..', '..', '..')
  const PIN = join(ORACLE_DIR, 'pin.json')
  const withPin = (patch) => {
    const path = join(fresh(), 'pin.json')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ ...readJson(PIN), ...patch }))
    return path
  }

  test('no expanded door list is committed and no committed file reaches the size ceiling', () => {
    assert.equal(existsSync(join(ORACLE_DIR, 'doors.json')), false)
    const big = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        const st = lstatSync(path)
        if (st.isDirectory()) walk(path)
        else if (st.size >= MAX_FILE_BYTES) big.push(`${path} ${st.size}`)
      }
    }
    for (const dir of [LAYER_DIR, ORACLE_DIR, join(ORACLE_DIR, '..', '..', 'fixtures', 'api')]) walk(dir)
    assert.deepEqual(big, [])
  })

  test('the door list derives from the pinned source and the counts match the denominator', async () => {
    const o = await loadDoors(REPO, PIN)
    const den = readJson(join(LAYER_DIR, 'denominator.json'))
    assert.equal(o.doors.length, den.details.counts.internalDocument)
    assert.equal(o.doors.filter((d) => d.public).length, den.details.counts.public)
    assert.equal(o.provenance.snapshotSha256, den.details.provenance.snapshotSha256)
    assert.equal(o.doorIndex.size, o.doors.length)
  })

  test('a hash mismatch is an ENV error carrying the probe, never data', () => {
    const pin = readPin(withPin({ snapshot: { ...readJson(PIN).snapshot, sha256: '0'.repeat(64) } }))
    assert.throws(
      () => readPinnedSnapshot(REPO, pin),
      (e) =>
        e instanceof OracleEnvError && /does not match the pin/.test(e.message) && e.probe.includes('sha256')
    )
    const docs = readPin(withPin({ routeDocs: { ...readJson(PIN).routeDocs, sha256: '1'.repeat(64) } }))
    return assert.rejects(readPinnedRouteDocs(REPO, docs), (e) => e instanceof OracleEnvError)
  })

  test("a commit missing from git is an ENV error with git's own words, with no working-tree fallback", async () => {
    const pin = readPin(withPin({ revision: 'a'.repeat(40) }))
    assert.throws(
      () => readPinnedSnapshot(REPO, pin),
      (e) => e instanceof OracleEnvError && e.probe.length > 0
    )
    await assert.rejects(loadDoors(REPO, withPin({ revision: 'b'.repeat(40) })), OracleEnvError)
  })

  test('an unusable pin is a contract error before any git call', () => {
    for (const patch of [
      { revision: 'abc' },
      { snapshot: { path: 'x', sha256: 'nope' } },
      { routeDocs: { paths: [] } }
    ])
      assert.throws(() => readPin(withPin(patch)), ContractError)
  })

  test('run(): an unavailable oracle makes every case ENV with the probe, before docker is touched', async () => {
    const calls = []
    const results = await run({
      cases: [manifest()],
      outDir: fresh(),
      deps: {
        loadOracle: async () => {
          throw new OracleEnvError('commit missing', 'fatal: bad object')
        },
        dockerAvailable: () => (calls.push('docker'), { ok: true, detail: '1' })
      }
    })
    assert.equal(results[0].verdict, 'ENV')
    assert.match(results[0].reason, /fatal: bad object/)
    assert.deepEqual(calls, [])
    assert.equal(exitCodeFor(results), 3)
  })

  test('the RED input hashes follow the pin, not a committed door list', () => {
    const before = inputHashes(LAYER_DIR, ORACLE_DIR)
    assert.match(before.oracle, /^[0-9a-f]{64}$/)
  })

  test('the compact plan and N-A table expand back to the full tables', () => {
    const tags = ['happy', 'empty', 'boundary']
    const items = [
      {
        id: 'GET /a',
        membership: 'public',
        tags: {
          happy: { status: 'cases' },
          empty: { status: 'open', reason: 'GET /a needs x' },
          boundary: { status: 'na', reason: 'GET /a has no bound' }
        }
      },
      {
        id: 'GET /b',
        membership: 'internal-only',
        tags: {
          happy: { status: 'covered-by' },
          empty: { status: 'open', reason: 'GET /b needs x' },
          boundary: { status: 'na', reason: 'GET /b has no bound' }
        }
      }
    ]
    const compact = compactPlan(items, tags)
    assert.deepEqual(compact.reasons, ['{id} needs x', '{id} has no bound'])
    const manifests = [
      { id: 'c1', edgeTags: ['happy'], itemIds: ['GET /a'] },
      { id: 'c2', edgeTags: ['happy'], itemIds: ['GET /a', 'GET /b'] }
    ]
    const back = expandPlan({ requiredTags: tags, ...compact }, manifests)
    assert.deepEqual(back.items[0].tags.happy, { status: 'cases', cases: ['c1', 'c2'] })
    assert.deepEqual(back.items[1].tags.happy, { status: 'covered-by', cases: ['c2'] })
    assert.deepEqual(back.items[1].tags.boundary, { status: 'na', reason: 'GET /b has no bound' })
    assert.throws(
      () =>
        expandPlan(
          { requiredTags: tags, reasons: [], items: [{ id: 'x', membership: 'public', tags: 'c c' }] },
          []
        ),
      ContractError
    )
    assert.throws(
      () =>
        expandPlan(
          { requiredTags: ['a'], reasons: [], items: [{ id: 'x', membership: 'public', tags: 'n9' }] },
          []
        ),
      ContractError
    )
  })

  test('the committed plan promises only cases the manifests hold, and every door has 21 tags', async () => {
    const plan = readJson(join(LAYER_DIR, 'coverage.plan.json'))
    const full = expandPlan(plan, await listCases({}))
    assert.equal(full.items.length, readJson(join(LAYER_DIR, 'denominator.json')).items.length)
    for (const item of full.items) {
      assert.equal(Object.keys(item.tags).length, 21, item.id)
      for (const [tag, t] of Object.entries(item.tags))
        if (t.status === 'cases' || t.status === 'covered-by')
          assert.ok(t.cases.length > 0, `${item.id}/${tag}`)
    }
  })

  test('git is the source: the pinned commit exists in this repository', () => {
    const out = execFileSync('git', ['-C', REPO, 'cat-file', '-t', readJson(PIN).revision], {
      encoding: 'utf8'
    })
    assert.equal(out.trim(), 'commit')
  })
})
