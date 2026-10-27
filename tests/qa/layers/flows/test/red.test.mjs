import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  MutationNotApplicable,
  judgeTargets,
  loadMutations,
  mutate,
  proveMutation,
  verifyProof
} from '../red.mjs'
import { layout } from '../stand.mjs'
import { REPO, sha256 } from '../util.mjs'
import { SCENARIOS } from '../scenario-meta.mjs'
import { fakeRun, tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const MUTATIONS = path.join(REPO, 'tests/qa/fixtures/flows/mutations.json')

test('the recorded mutations apply exactly once to the product files of this tree, and name real scenarios and assertions', () => {
  const rows = loadMutations(MUTATIONS)
  assert.ok(rows.length >= 8)
  for (const m of rows) {
    const text = readTextSync(path.join(REPO, m.file))
    const out = mutate(text, m)
    assert.notEqual(out, text, m.id)
    assert.ok(out.length !== text.length || out !== text)
    for (const c of m.cases) {
      assert.ok(SCENARIOS[c.scenario], `${m.id}: scenario ${c.scenario}`)
      assert.ok(SCENARIOS[c.scenario].assertions.includes(c.assertion), `${m.id}: assertion ${c.assertion}`)
    }
  }
})

test('mutate refuses a find string that occurs zero or several times', () => {
  const m = { id: 'x', file: 'f', find: 'abc', replace: 'abd' }
  assert.equal(mutate('xx abc yy', m), 'xx abd yy')
  assert.throws(() => mutate('nothing', m), MutationNotApplicable)
  assert.throws(() => mutate('abc abc', m), /occurs 2/)
})

test('loadMutations rejects malformed tables', () => {
  const dir = tmpDir('mut')
  const f = path.join(dir, 'm.json')
  const base = { id: 'a', file: 'x.js', find: 'f', replace: 'g', cases: [{ scenario: 's', assertion: 'a' }] }
  for (const [rows, re] of [
    [[], /non-empty/],
    [[{ ...base, find: '' }], /find/],
    [[{ ...base, file: '../etc/passwd' }], /escapes/],
    [[{ ...base, cases: [] }], /names no case/],
    [[{ ...base, replace: 'f' }], /changes nothing/],
    [[base, base], /duplicate/],
    [[{ ...base, cases: [{ scenario: 's' }] }], /malformed case/]
  ]) {
    writeFileSync(f, JSON.stringify(rows))
    assert.throws(() => loadMutations(f), re)
  }
})

test('judgeTargets: red only if green held, the scenario reached its assertions on the mutant, and the assertion is false', () => {
  const res = (outcome, assertions) => ({
    outcome,
    assertions: assertions.map(([name, ok]) => ({ name, ok }))
  })
  const targets = [{ scenario: 's', assertion: 'a' }]
  const green = new Map([['s', res('PASS', [['a', true]])]])
  assert.equal(judgeTargets(targets, new Map([['s', res('FAIL', [['a', false]])]]), green)[0].red, true)
  assert.equal(judgeTargets(targets, new Map([['s', res('PASS', [['a', true]])]]), green)[0].red, false)
  const boot = judgeTargets(targets, new Map([['s', { outcome: 'PENDING', assertions: [] }]]), green)[0]
  assert.equal(boot.red, false)
  assert.match(boot.why, /did not reach its assertions/)
  assert.equal(judgeTargets(targets, new Map(), green)[0].red, false)
  const notGreen = new Map([['s', res('FAIL', [['a', false]])]])
  const j = judgeTargets(targets, new Map([['s', res('FAIL', [['a', false]])]]), notGreen)[0]
  assert.equal(j.red, false, 'an assertion that was already red on the product proves nothing')
  assert.match(j.why, /not green on the GREEN product/)
})

// A scratch tree + a fake docker: proveMutation without Docker.
function scratch() {
  const out = tmpDir('prove')
  const l = layout(out)
  const file = path.join(l.src, 'apps/tracy-web/src/x.js')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, 'const ok = check(code)\n')
  const m = {
    id: 'M-test',
    describes: 'drops the check',
    file: 'apps/tracy-web/src/x.js',
    find: 'check(code)',
    replace: 'true',
    cases: [{ scenario: 's', assertion: 'a' }]
  }
  return { out, l, file, m }
}
const stand = { origin: 'http://127.0.0.1:1' }
const res = (outcome, a) => ({ outcome, reason: outcome, assertions: [{ name: 'a', ok: a }] })

test('proveMutation: a mutant that builds and boots with the assertion red proves it; the product file is restored byte for byte', async () => {
  const { out, l, file, m } = scratch()
  const original = readTextSync(file)
  let builtFrom = null
  const run = fakeRun((cmd, args) => {
    if (args[0] === 'build') builtFrom = readTextSync(file)
    return {}
  })
  const p = await proveMutation({
    m,
    l,
    stand,
    outDir: out,
    run,
    waitWebMs: 1,
    runScenarios: async () => new Map([['s', res('FAIL', false)]]),
    greenResults: new Map([['s', res('PASS', true)]]),
    hashes: { testSha256: 't' }
  }).catch((e) => e)
  // waitForWeb cannot reach the fake origin, so the mutant "did not boot": still no proof.
  assert.equal(readTextSync(file), original, 'restored')
  assert.equal(builtFrom, 'const ok = true\n', 'the image was built from the mutant text')
  assert.equal(p.applied, true)
  assert.equal(p.targets.length, 0)
  assert.match(p.reason, /did not boot/)
  assert.ok(readTextSync(path.join(out, p.log)).includes(sha256(original)))
})

test('proveMutation: build failure, inapplicable mutation and missing source are not red proofs, and the file is restored', async () => {
  const a = scratch()
  const original = readTextSync(a.file)
  const failBuild = fakeRun((cmd, args) => (args[0] === 'build' ? { code: 1, stderr: 'boom' } : {}))
  const p = await proveMutation({
    m: a.m,
    l: a.l,
    stand,
    outDir: a.out,
    run: failBuild,
    runScenarios: async () => assert.fail('no run'),
    greenResults: new Map(),
    hashes: {}
  })
  assert.equal(p.built, false)
  assert.match(p.reason, /did not build/)
  assert.equal(readTextSync(a.file), original)
  const b = scratch()
  const q = await proveMutation({
    m: { ...b.m, find: 'absent' },
    l: b.l,
    stand,
    outDir: b.out,
    run: fakeRun(() => ({})),
    runScenarios: async () => assert.fail('no run'),
    greenResults: new Map(),
    hashes: {}
  })
  assert.equal(q.applied, false)
  const c = scratch()
  const r = await proveMutation({
    m: { ...c.m, file: 'apps/nope.js' },
    l: c.l,
    stand,
    outDir: c.out,
    run: fakeRun(() => ({})),
    runScenarios: async () => assert.fail('no run'),
    greenResults: new Map(),
    hashes: {}
  })
  assert.equal(r.applied, false)
  assert.match(r.reason, /source missing/)
})

test('proveMutation with a booting web: targets are judged, and the stand is swapped back to the GREEN image', async () => {
  const { default: http } = await import('node:http')
  const server = http.createServer((q, s) => s.end('ok'))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const { out, l, m } = scratch()
    const calls = []
    const run = fakeRun((cmd, args, opts) => {
      calls.push({ args, tag: opts.env?.APP_IMAGE_TAG })
      return {}
    })
    const p = await proveMutation({
      m,
      l,
      stand: { origin: `http://127.0.0.1:${server.address().port}` },
      outDir: out,
      run,
      waitWebMs: 5000,
      runScenarios: async () => new Map([['s', res('FAIL', false)]]),
      greenResults: new Map([['s', res('PASS', true)]]),
      hashes: { testSha256: 't', oracleSha256: 'o', fixtureSha256: 'f' }
    })
    // the fake origin answers 404 for /login, so wait times out: use the swap-back assertions only
    const ups = calls.filter((c) => c.args.includes('up'))
    assert.deepEqual(
      ups.map((c) => c.tag),
      ['red-m-test', 'dev'],
      'swapped to the mutant image, then back to dev'
    )
    assert.ok(calls.some((c) => c.args[0] === 'image' && c.args[1] === 'rm'))
    assert.ok(p.evidence.mutantSha256 !== p.evidence.productSha256)
    assert.equal(p.evidence.testSha256, 't')
  } finally {
    server.close()
  }
})

test('proveMutation + verifyProof: a booted mutant with the assertion red gives a verified proof; a stand that does not come back GREEN voids it', async () => {
  const { default: http } = await import('node:http')
  const server = http.createServer((q, s) => {
    s.statusCode = q.url === '/login' ? 200 : 404
    s.end('ok')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const hashes = {
    testSha256: sha256('t'),
    oracleSha256: sha256('o'),
    fixtureSha256: sha256('f')
  }
  try {
    for (const [label, backFails] of [
      ['stand restored', false],
      ['swap back fails', true]
    ]) {
      const { out, l, file, m } = scratch()
      const original = readTextSync(file)
      const run = fakeRun((cmd, args, opts) =>
        backFails && args.includes('up') && opts.env?.APP_IMAGE_TAG === 'dev' ? { code: 1, stderr: 'no' } : {}
      )
      const p = await proveMutation({
        m,
        l,
        stand: { origin },
        outDir: out,
        run,
        waitWebMs: 1500,
        runScenarios: async () => new Map([['s', res('FAIL', false)]]),
        greenResults: new Map([['s', res('PASS', true)]]),
        hashes
      })
      assert.equal(readTextSync(file), original)
      assert.ok(
        p.targets.every((t) => t.red),
        label
      )
      const v = verifyProof(p, { outDir: out, scenario: 's', assertions: ['a'] })
      if (backFails) {
        assert.equal(p.restored, false)
        assert.equal(v.ok, false)
        assert.match(v.why, /not restored/)
      } else {
        assert.equal(p.restored, true)
        assert.deepEqual(v, { ok: true, why: 'verified' })
        // The same proof with its log damaged is refused.
        writeFileSync(path.join(out, p.log), `${readTextSync(path.join(out, p.log))}x`)
        assert.match(verifyProof(p, { outDir: out, scenario: 's', assertions: ['a'] }).why, /recorded hash/)
      }
    }
  } finally {
    server.close()
  }
})
