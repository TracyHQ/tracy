import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { after, test } from 'node:test'
import { exitCodeFor, main, reportMarkdown } from '../run.mjs'
import { listCases, run, scanArtifacts } from '../index.mjs'
import { layout } from '../stand.mjs'
import { startFakeStand } from './fake-stand.mjs'
import { tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const open = []
after(async () => {
  for (const s of open) await s.close()
})
const pick = async (...ids) => (await listCases()).filter((c) => ids.includes(c.id))
const byRef = async (ref) => (await listCases()).filter((c) => c.ref === ref && c.kind === 'scripted')
const verdictOf = (results, id) => results.find((r) => r.id === id)

async function standEnv() {
  const s = await startFakeStand()
  open.push(s)
  const out = tmpDir('stand-env')
  const l = layout(out)
  mkdirSync(l.src, { recursive: true })
  mkdirSync(l.root, { recursive: true })
  writeFileSync(l.info, '{}')
  return {
    s,
    env: { QA_STAND_URL: s.stand.origin, QA_STAND_SITE_DOMAIN: 'localhost', QA_STAND_INFO: l.info },
    l
  }
}
const h = (x) => createHash('sha256').update(x).digest('hex')

/** What proveMutation records for a mutant run: a real log under outDir with the lines the verifier reads. */
function writtenProof({
  outDir,
  m,
  targets,
  tamper = false,
  skipWrite = false,
  restored = true,
  restoredLine = true
}) {
  const evidence = {
    productSha256: h('product'),
    mutantSha256: h('mutant'),
    mutationSha256: h('mutation'),
    testSha256: h('test'),
    oracleSha256: h('oracle'),
    fixtureSha256: h('fixture')
  }
  const lines = [JSON.stringify(evidence), `T product source restored byte for byte: ${restoredLine}`]
  for (const t of targets) {
    lines.push(`T GREEN ${t.scenario}#${t.assertion}: ok`)
    lines.push(`T ${t.red ? 'RED' : 'NOT-RED'} ${t.scenario}#${t.assertion}`)
  }
  lines.push('T swap back → dev: exit 0, web answers: true')
  const text = `${lines.join('\n')}\n`
  const rel = `red/${m.id}.log`
  if (!skipWrite) {
    mkdirSync(path.join(outDir, 'red'), { recursive: true })
    writeFileSync(path.join(outDir, rel), tamper ? `${text}forged\n` : text)
  }
  return { log: rel, logSha256: h(text), applied: true, built: true, restored, evidence }
}

const pass = {
  outcome: 'PASS',
  reason: 'every assertion held',
  assertions: [{ name: 'otp-in-sink', ok: true }]
}

test('target policy: every case of this layer writes, so dev and prod report PENDING: target-policy before any side effect', async () => {
  const cases = await listCases({ area: 'signin-code' })
  let touched = false
  for (const target of ['dev', 'prod']) {
    const r = await run({
      cases,
      target,
      outDir: tmpDir('policy'),
      deps: {
        runScenario: async () => ((touched = true), pass),
        probeStand: async () => ((touched = true), { ok: true })
      }
    })
    assert.ok(r.every((x) => x.verdict === 'PENDING' && /target-policy/.test(x.reason)))
  }
  assert.equal(touched, false)
  await assert.rejects(() => run({ cases, target: 'moon', outDir: tmpDir('policy') }), /unknown target/)
})

test('pending cases are PENDING by name; import is ENV with its probe; nothing else is guessed', async () => {
  const cases = await listCases({ area: 'pending' })
  const r = await run({ cases, outDir: tmpDir('pending'), env: {} })
  const imp = verdictOf(r, 'QA-FLOWS-import-site-happy-import')
  assert.equal(imp.verdict, 'ENV')
  assert.match(imp.probe, /QA_FLOWS_IMPORT_SOURCE is not set/)
  for (const x of r.filter((y) => y !== imp)) assert.equal(x.verdict, 'PENDING')
  assert.ok(r.length === cases.length)
  // A source that is configured and answers is not a missing dependency: the case is PENDING by name.
  const { s } = await standEnv()
  const only = cases.filter((c) => c.id === imp.id)
  const reachable = await run({
    cases: only,
    outDir: tmpDir('pending2'),
    env: { QA_FLOWS_IMPORT_SOURCE: s.stand.origin }
  })
  assert.equal(reachable[0].verdict, 'PENDING')
  const dead = await run({
    cases: only,
    outDir: tmpDir('pending3'),
    env: { QA_FLOWS_IMPORT_SOURCE: 'http://127.0.0.1:1/' }
  })
  assert.equal(dead[0].verdict, 'ENV')
  assert.match(dead[0].probe, /unreachable/)
})

test('no stand → every live case is ENV with the probe, never PASS', async () => {
  const cases = (await listCases()).filter((c) => c.kind !== 'pending')
  const r = await run({ cases, outDir: tmpDir('nostand'), env: {} })
  assert.ok(r.every((x) => x.verdict === 'ENV' && /QA_STAND_URL is not set/.test(x.probe)))
  const unreachable = await run({
    cases: cases.slice(0, 2),
    outDir: tmpDir('nostand2'),
    env: { QA_STAND_URL: 'http://127.0.0.1:1' }
  })
  assert.ok(unreachable.every((x) => x.verdict === 'ENV' && /failed/.test(x.probe)))
})

test('known-good without --prove-red is PENDING (a PASS needs a red proof)', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-happy')
  const r = await run({ cases, outDir: tmpDir('nored'), env, deps: { runScenario: async () => pass } })
  assert.equal(r[0].verdict, 'PENDING')
  assert.match(r[0].reason, /no RED proof/)
})

test('--prove-red: PASS only when every named assertion went red on the mutant; otherwise PENDING with the reason', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-wrong-code')
  const deps = (targets, extra = {}, proofOpts = {}) => ({
    runScenario: async () => pass,
    proveMutation: async ({ m, outDir }) => ({
      id: m.id,
      targets,
      ...writtenProof({ outDir, m, targets, ...proofOpts }),
      ...extra
    })
  })
  const t = (assertion, red, why = 'stayed green') => ({ scenario: 'signin-wrong-code', assertion, red, why })
  const out = tmpDir('red')
  const green = await run({
    cases,
    proveRed: true,
    outDir: out,
    env,
    deps: deps([t('wrong-code-sets-no-session', true), t('wrong-code-not-2xx', true)])
  })
  assert.equal(green[0].verdict, 'PASS')
  assert.equal(green[0].redProof.kind, 'mutation')
  assert.match(green[0].redProof.assertionId, /^signin-wrong-code#/)
  assert.equal(green[0].redProof.log, 'red/M-verify-skips-code-check.log')
  const half = await run({
    cases,
    proveRed: true,
    outDir: tmpDir('red2'),
    env,
    deps: deps([t('wrong-code-sets-no-session', true), t('wrong-code-not-2xx', false)])
  })
  assert.equal(half[0].verdict, 'PENDING', 'one named assertion stayed green: no proof')
  assert.match(half[0].reason, /stayed green/)
  const unbuilt = await run({
    cases,
    proveRed: true,
    outDir: tmpDir('red3'),
    env,
    deps: deps([], { built: false, reason: 'the mutant image did not build (not a red proof)' })
  })
  assert.equal(unbuilt[0].verdict, 'PENDING')
  assert.match(unbuilt[0].reason, /did not build/)
  const inapplicable = await run({
    cases,
    proveRed: true,
    outDir: tmpDir('red4'),
    env,
    deps: deps([], { applied: false, reason: 'occurs 0 time(s)' })
  })
  assert.equal(inapplicable[0].verdict, 'PENDING')
  const both = [t('wrong-code-sets-no-session', true), t('wrong-code-not-2xx', true)]
  for (const [label, proofOpts, why] of [
    ['a log that was never written', { skipWrite: true }, /unreadable/],
    ['a log changed after it was hashed', { tamper: true }, /recorded hash/],
    ['a GREEN product that was not restored', { restored: false }, /not restored/],
    ['a log without the restored-source line', { restoredLine: false }, /restored source/]
  ]) {
    const r = await run({
      cases,
      proveRed: true,
      outDir: tmpDir('red-forged'),
      env,
      deps: deps(both, {}, proofOpts)
    })
    assert.equal(r[0].verdict, 'PENDING', label)
    assert.match(r[0].reason, why, label)
    assert.equal(r[0].redProof, null, label)
  }
  const outside = tmpDir('red-outside')
  const elsewhere = tmpDir('red-elsewhere')
  const linked = await run({
    cases,
    proveRed: true,
    outDir: outside,
    env,
    deps: {
      runScenario: async () => pass,
      proveMutation: async ({ m, outDir }) => {
        const p = writtenProof({ outDir: elsewhere, m, targets: both })
        mkdirSync(path.join(outDir, 'red'), { recursive: true })
        symlinkSync(path.join(elsewhere, p.log), path.join(outDir, p.log))
        return { id: m.id, targets: both, ...p }
      }
    }
  })
  assert.equal(linked[0].verdict, 'PENDING', 'a symlinked proof log is not a regular file inside outDir')
})

test('a PASS can never leave the layer without a red proof log (finalize downgrades it)', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-replay')
  const r = await run({
    cases,
    proveRed: true,
    outDir: tmpDir('nolog'),
    env,
    deps: {
      runScenario: async () => pass,
      proveMutation: async ({ m }) => ({
        id: m.id,
        log: '',
        applied: true,
        built: true,
        targets: [{ scenario: 'signin-replay', assertion: 'used-code-refused', red: true }],
        evidence: {}
      })
    }
  })
  assert.notEqual(r[0].verdict, 'PASS')
})

test('a product FAIL carries the earliest observed divergence; FAIL is never softened by --prove-red', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-replay')
  const r = await run({
    cases,
    proveRed: true,
    outDir: tmpDir('fail'),
    env,
    deps: {
      runScenario: async () => ({
        outcome: 'FAIL',
        reason: 'signin-replay: used-code-refused — observed HTTP 200; expected 401',
        assertions: []
      }),
      proveMutation: async () => assert.fail('no mutant for a failing case')
    }
  })
  assert.equal(r[0].verdict, 'FAIL')
  assert.match(r[0].reason, /observed HTTP 200/)
})

test('legacy: a candidate is PENDING (no red proof), a FAIL stays FAIL, a missing record is TEST_INVALID, the whole run is one invocation', async () => {
  const { env } = await standEnv()
  const cases = await pick(
    'QA-FLOWS-team-invite-happy-legacy-team',
    'QA-FLOWS-two-seats-happy-legacy-rights',
    'QA-FLOWS-inbox-happy-two-people'
  )
  let invocations = 0
  const r = await run({
    cases,
    outDir: tmpDir('legacy-run'),
    env,
    deps: {
      runLegacy: async ({ journeys }) => {
        invocations++
        assert.deepEqual([...journeys].sort(), ['J11', 'J6', 'J7'])
        return {
          problem: null,
          byJourney: new Map([
            [
              'J6',
              {
                verdict: 'PASS',
                candidate: true,
                reason: 'legacy journey passed',
                evidence: ['legacy/x.json'],
                notes: []
              }
            ],
            [
              'J11',
              {
                verdict: 'FAIL',
                candidate: false,
                reason: 'J11: editor deleted the site',
                evidence: ['legacy/y.json'],
                notes: []
              }
            ]
          ])
        }
      }
    }
  })
  assert.equal(invocations, 1)
  assert.equal(verdictOf(r, 'QA-FLOWS-team-invite-happy-legacy-team').verdict, 'PENDING')
  assert.match(verdictOf(r, 'QA-FLOWS-team-invite-happy-legacy-team').reason, /no RED proof/)
  assert.equal(verdictOf(r, 'QA-FLOWS-two-seats-happy-legacy-rights').verdict, 'FAIL')
  assert.match(verdictOf(r, 'QA-FLOWS-inbox-happy-two-people').reason, /TEST_INVALID/)
})

test('the pilot has no stubs and no approved oracle here: PENDING with that reason', async () => {
  const { env } = await standEnv()
  const r = await run({ cases: await pick('QA-FLOWS-publish-happy-pilot'), outDir: tmpDir('pilot'), env })
  assert.equal(r[0].verdict, 'PENDING')
  assert.match(r[0].reason, /stubs/)
})

test('cancellation: an aborted signal leaves the remaining cases PENDING and still cleans the fixtures', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-happy')
  const ac = new AbortController()
  ac.abort()
  const out = tmpDir('abort')
  const r = await run({
    cases,
    outDir: out,
    env,
    signal: ac.signal,
    deps: { runScenario: async () => assert.fail('must not start') }
  })
  assert.match(r[0].reason, /interrupted/)
  assert.ok(existsSync(path.join(out, 'fixtures-cleanup.json')))
})

test('a crash inside a scenario still runs the fixture cleanup (finally) and leaves the partial results on disk', async () => {
  const { env } = await standEnv()
  const cases = await byRef('signin-happy')
  const out = tmpDir('crash')
  await assert.rejects(
    () =>
      run({
        cases,
        outDir: out,
        env,
        deps: {
          runScenario: async () => {
            throw new Error('boom')
          }
        }
      }),
    /boom/
  )
  assert.ok(existsSync(path.join(out, 'fixtures-cleanup.json')))
})

test('secrets in artifacts are detected and reported as a FAIL; evidence written by the layer is redacted', async () => {
  const out = tmpDir('leak')
  mkdirSync(path.join(out, 'legacy'), { recursive: true })
  writeFileSync(
    path.join(out, 'legacy', 'run.log'),
    'cookie: tracy_sess=abcdefghijklmnopqrstuvwxyz0123 and [mail] to=a@example.test subject="123456 code"'
  )
  assert.deepEqual(scanArtifacts(out)[0].kinds.sort(), ['otp', 'session-cookie'])
  const r = await run({ cases: await pick('QA-FLOWS-brand-inspiration-happy-brand'), outDir: out, env: {} })
  const leak = r.find((x) => x.id === 'QA-FLOWS-artifacts-no-secret-leak')
  assert.equal(leak.verdict, 'FAIL')
  assert.equal(exitCodeFor(r), 1)
})

test('every entry that is not a directory or regular file is unscannable and fails the layer, a symlinked directory included', async () => {
  const out = tmpDir('unscannable')
  const elsewhere = tmpDir('unscannable-target')
  writeFileSync(path.join(elsewhere, 'x.log'), 'nothing here')
  symlinkSync(elsewhere, path.join(out, 'evidence'))
  symlinkSync(path.join(elsewhere, 'x.log'), path.join(out, 'noextension'))
  const fifo = path.join(out, 'pipe')
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0, 'mkfifo')
  const hits = scanArtifacts(out)
  for (const name of ['evidence', 'noextension', 'pipe'])
    assert.ok(
      hits.some((x) => x.file === name && x.kinds.every((k) => k.startsWith('unscannable'))),
      `${name} not reported: ${JSON.stringify(hits)}`
    )
  assert.deepEqual(scanArtifacts(elsewhere), [], 'a plain tree is clean')
  const r = await run({ cases: await pick('QA-FLOWS-brand-inspiration-happy-brand'), outDir: out, env: {} })
  const leak = r.find((x) => x.id === 'QA-FLOWS-artifacts-no-secret-leak')
  assert.equal(leak?.verdict, 'FAIL', 'finalize must fail on an unscanned tree')
  assert.equal(exitCodeFor(r), 1)
  const top = tmpDir('unscannable-top')
  symlinkSync(elsewhere, path.join(top, 'link'))
  assert.equal(scanArtifacts(path.join(top, 'link'))[0].kinds[0], 'unscannable: symlink')
})

test('exit codes: 0 all PASS, 1 any FAIL, 3 ENV/PENDING only', () => {
  const v = (verdict) => ({ verdict })
  assert.equal(exitCodeFor([v('PASS'), v('PASS')]), 0)
  assert.equal(exitCodeFor([v('PASS'), v('ENV'), v('PENDING')]), 3)
  assert.equal(exitCodeFor([v('PASS'), v('FAIL'), v('ENV')]), 1)
})

test('CLI: unknown area, target or flag is exit 2 and nothing runs; a good invocation writes every report file', async () => {
  const quiet = { runImpl: async () => assert.fail('must not run') }
  const out = tmpDir('cli')
  assert.equal(await main(['--area', 'nope', '--out', out], quiet), 2)
  assert.equal(await main(['--target', 'moon', '--out', out], quiet), 2)
  assert.equal(await main(['--wat'], quiet), 2)
  assert.equal(await main(['stray'], quiet), 2)
  const code = await main(['--area', 'brand-inspiration', '--out', out], { env: {} })
  assert.equal(code, 3)
  for (const f of ['results.json', 'report.md', 'coverage.json', 'provenance.json', 'checklist.json'])
    assert.ok(existsSync(path.join(out, f)), f)
  const results = JSON.parse(readTextSync(path.join(out, 'results.json')))
  assert.ok(
    results.every(
      (r) =>
        ['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict) &&
        Array.isArray(r.evidence) &&
        'durationMs' in r &&
        'redProof' in r
    )
  )
  const md = readTextSync(path.join(out, 'report.md'))
  assert.match(md, /PASS 0 · FAIL 0/)
  assert.match(md, /incomplete/)
  assert.ok(!/100\s?%/.test(md))
  const bad = await main(['--out', out], { runImpl: async () => [{ id: 'x', verdict: 'MAYBE' }], env: {} })
  assert.equal(bad, 2, 'an unknown verdict is a contract error')
})

test('the report names every non-PASS case with its reason, and says coverage is not a percentage', async () => {
  const md = reportMarkdown({
    results: [
      { id: 'a', verdict: 'FAIL', reason: 'r1' },
      { id: 'b', verdict: 'ENV', reason: 'r2' },
      { id: 'c', verdict: 'PASS', reason: '', redProof: { log: 'x' } }
    ],
    args: { target: 'local', proveRed: true },
    coverage: {
      totals: { obligations: 1, na: 0, naWithoutReason: 0, open: 1, implemented: 0, executed: 0, proven: 0 },
      incompleteBecause: 'x',
      unresolved: []
    },
    startedAt: 't',
    outDir: '/x/y'
  })
  assert.match(md, /FAIL 1 · ENV 1|PASS 1 · FAIL 1 · ENV 1 · PENDING 0/)
  assert.match(md, /\*\*FAIL\*\* `a` — r1/)
  assert.match(md, /Not a percentage|not a percentage/)
})

test('model credentials: an empty MODEL_API_KEY in the stand env is ENV with the file named; a key present stays PENDING', async () => {
  const { env, l } = await standEnv()
  const model = (await listCases()).filter((c) => c.id.includes('no-model-credentials'))
  assert.ok(model.length > 0)
  mkdirSync(l.gen, { recursive: true })
  writeFileSync(path.join(l.gen, '.env'), 'MODEL_API_KEY=\n')
  const none = await run({ cases: model, outDir: tmpDir('model1'), env })
  assert.equal(none[0].verdict, 'ENV')
  assert.match(none[0].probe, /MODEL_API_KEY is empty/)
  writeFileSync(path.join(l.gen, '.env'), 'MODEL_API_KEY=present-value\n')
  const some = await run({ cases: model, outDir: tmpDir('model2'), env })
  assert.equal(some[0].verdict, 'PENDING')
  const unprobed = await run({ cases: model, outDir: tmpDir('model3'), env: {} })
  assert.equal(unprobed[0].verdict, 'PENDING', 'not probed means not proven missing')
})

test('a stand that did not bootstrap: ENV only for a proven missing dependency; a build failure is PENDING with its log, never ENV', async () => {
  const cases = (await listCases()).filter((c) => c.kind !== 'pending').slice(0, 3)
  const bootstrap = (b) => ({ QA_STAND_BOOTSTRAP: JSON.stringify(b) })
  const build = await run({
    cases,
    outDir: tmpDir('boot1'),
    env: bootstrap({ kind: 'build', detail: 'dsh image check failed', logFile: '/x/001-docker.log' })
  })
  assert.equal(build.length, cases.length)
  for (const x of build) {
    assert.equal(x.verdict, 'PENDING')
    assert.match(x.reason, /stand-bootstrap-build/)
    assert.match(x.reason, /001-docker\.log/)
  }
  const missing = await run({
    cases,
    outDir: tmpDir('boot2'),
    env: bootstrap({ kind: 'env', detail: 'Docker is not reachable', probe: 'docker info: denied' })
  })
  for (const x of missing) {
    assert.equal(x.verdict, 'ENV')
    assert.match(x.probe, /docker info: denied/)
  }
})
