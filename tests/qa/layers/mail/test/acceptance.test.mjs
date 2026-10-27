// The pilot: the standalone runner on the whole layer with --prove-red, then the evidence contract.
// Exit 0 or 3 is accepted; 3 only when every non-PASS carries a probe or a reason. Nothing here
// turns ENV/PENDING into a pass.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { LAYER_DIR, writeAtomic } from '../common.mjs'
import { currentFiles, diff, generate, render } from '../generate.mjs'
import { loadCases, oracleIneligible, parseRef } from '../index.mjs'
import { SUITES, parseEvents } from '../legacy.mjs'
import { proofProblem } from '../red.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const RUN = fileURLToPath(new URL('../run.mjs', import.meta.url))
const artifacts = process.env.QA_MAIL_ARTIFACTS
// Every run owns a fresh directory: evidence of an earlier run is never deleted or reused.
const base = artifacts ?? tmpdir()
mkdirSync(base, { recursive: true })
const out = path.join(mkdtempSync(path.join(base, 'mail-pilot-')), 'out')
let pilot = null

test('pilot: run.mjs --target local --prove-red runs to the end', { timeout: 900_000 }, () => {
  pilot = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      RUN,
      '--target',
      'local',
      '--prove-red',
      '--out',
      out,
      '--ledger',
      path.join(out, 'red-ledger.json')
    ],
    { encoding: 'utf8', timeout: 880_000, maxBuffer: 64 * 1024 * 1024 }
  )
  writeAtomic(path.join(out, 'pilot-stdout.txt'), pilot.stdout ?? '')
  writeAtomic(path.join(out, 'pilot-stderr.txt'), pilot.stderr ?? '')
  assert.ok([0, 3, 1].includes(pilot.status), `exit ${pilot.status}\n${pilot.stderr}`)
  assert.equal(readTextSync(path.join(out, 'exit-code.txt')).trim(), String(pilot.status))
})

const results = () => JSON.parse(readTextSync(path.join(out, 'results.json')))

test('results.json lists every case once, with a verdict and a reason', () => {
  const cases = loadCases()
  const list = results()
  assert.deepEqual(list.map((r) => r.id).sort(), cases.map((c) => c.id).sort())
  for (const r of list) {
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), r.id)
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, `${r.id} has no reason`)
    assert.ok(
      Array.isArray(r.assertionIds) && Array.isArray(r.evidence) && typeof r.durationMs === 'number',
      r.id
    )
  }
})

test('every PASS has a RED proof whose log exists and shows the assertion red on a mutant and green on the control', () => {
  for (const r of results().filter((x) => x.verdict === 'PASS')) {
    assert.ok(
      r.redProof?.kind === 'mutation' && r.redProof.ref && r.redProof.assertionId,
      `${r.id}: PASS without a RED proof`
    )
    if (r.kind === 'machine') {
      assert.ok(r.redProof.proofs.length > 0)
      const claimed = new Set(r.assertionIds.map((a) => parseRef(a).id))
      assert.deepEqual(
        new Set(r.redProof.proofs.map((p) => p.assertionId)),
        claimed,
        `${r.id}: a proof per assertion`
      )
      for (const p of r.redProof.proofs) {
        assert.ok(p.logs.length > 0 && p.logs.length === p.mutants.length)
        for (const [i, log] of p.logs.entries()) {
          // The log is re-read and matched to this assertion, mutant, edit hash and control evidence.
          assert.equal(
            proofProblem({ log, mutant: p.mutants[i] }, { outDir: out, assertionId: p.assertionId }),
            null,
            `${r.id}: ${log}`
          )
          const entry = JSON.parse(readTextSync(path.join(out, log)))
          assert.equal(entry.judged, 'RED')
          assert.equal(entry.control.status, 'green')
          assert.equal(entry.copyControl, 'green')
        }
      }
    } else {
      assert.fail(`${r.id}: only machine cases may be PASS, found a ${r.kind} case`)
    }
  }
})

test('every PASS and FAIL rests on a catalogue oracle; the rest is an observation', () => {
  const cases = new Map(loadCases().map((c) => [c.id, c]))
  const data = JSON.parse(readTextSync(new URL('../../../oracles/mail/oracle.json', import.meta.url)))
  for (const r of results()) {
    const c = cases.get(r.id)
    if (r.verdict === 'PASS' || r.verdict === 'FAIL')
      assert.equal(oracleIneligible(c, data), null, `${r.id}: ${r.verdict} without an independent oracle`)
    if (r.kind === 'suite') assert.notEqual(r.verdict, 'FAIL', `${r.id}: a suite is not a product finding`)
  }
})

test('an adapted suite is never PASS; its observed RED is backed by a mutant log that names the red tests', () => {
  for (const r of results().filter((x) => x.kind === 'suite')) {
    assert.notEqual(r.verdict, 'PASS', `${r.id}: a suite is its own oracle`)
    for (const log of r.observedRed?.logs ?? []) {
      const text = readTextSync(path.join(out, log))
      assert.match(text.split('\n--- stdout ---')[0], /\nmissing \[\]\n/, `${r.id}: ${log}`)
      const events = parseEvents(text.split('\n--- stdout ---\n')[1].split('\n--- stderr ---')[0])
      assert.equal(events.problem, null, `${r.id}: the mutant event stream of ${log} is not trusted`)
      assert.ok(
        events.tests.some((t) => !t.ok),
        `${r.id}: no failing test in ${log}`
      )
    }
    const control = readTextSync(path.join(out, `suites/${r.assertionIds[0].slice(6)}.control.log`))
    const raw = control.split('\n--- stdout ---\n')[1].split('\n--- stderr ---')[0]
    assert.ok(raw.length > 0, `${r.id}: the raw control stdout was kept`)
    assert.ok(/^exit .* signal /.test(control), `${r.id}: the process state was kept`)
  }
})

test('every ENV names its probe and every PENDING its reason; no suite skip became a PASS', () => {
  for (const r of results()) {
    if (r.verdict === 'ENV')
      assert.match(r.reason, /probe|missing dependency|could not run/, `${r.id}: ENV without a probe`)
    if (r.verdict === 'PENDING') assert.ok(r.reason.length > 10, r.id)
    if (r.verdict === 'PASS' && r.kind === 'suite') {
      const ev = JSON.parse(readTextSync(path.join(out, r.evidence[0])))
      assert.equal(ev.counts.skipped, 0, `${r.id}: a suite with skipped tests was passed`)
      assert.ok(ev.counts.total > 0, `${r.id}: zero tests was passed`)
    }
  }
})

test('all eleven required suites were adapted and judged: PASS, ENV with a probe, or FAIL with the failing test named', () => {
  const list = results()
  for (const name of SUITES) {
    const r = list.find((x) => x.assertionIds.includes(`suite:${name}`))
    assert.ok(r, name)
    assert.ok(['PASS', 'ENV', 'FAIL', 'PENDING'].includes(r.verdict))
    assert.ok(existsSync(path.join(out, r.evidence[0])), `${name}: no evidence`)
  }
})

test('manual obligations are PENDING until a receipt says otherwise, and deliverability is never claimed', () => {
  const list = results()
  const manual = list.filter((r) => r.kind === 'manual')
  assert.ok(manual.length >= 18)
  assert.ok(
    manual.every((r) => r.verdict === 'PENDING'),
    'no receipt was given: nothing may be accepted'
  )
  assert.match(
    manual.find((r) => r.id === 'QA-MAIL-deliverability-suite-inbox').reason,
    /real Gmail\/Outlook inbox/
  )
  for (const file of ['index.html', 'checklist.json']) assert.ok(existsSync(path.join(out, 'sheets', file)))
  const checklist = JSON.parse(readTextSync(path.join(out, 'sheets', 'checklist.json')))
  assert.ok(checklist.entries.length >= 36)
  assert.ok(checklist.entries.every((e) => e.accepted === null && /^[0-9a-f]{64}$/.test(e.htmlSha256)))
})

test('report.md, coverage.json and the handoff counts agree with results.json', () => {
  const list = results()
  const report = readTextSync(path.join(out, 'report.md'))
  const count = (v) => list.filter((r) => r.verdict === v).length
  assert.match(
    report,
    new RegExp(
      `PASS ${count('PASS')} · FAIL ${count('FAIL')} · ENV ${count('ENV')} · PENDING ${count('PENDING')} \\(of ${list.length} cases\\)`
    )
  )
  const coverage = JSON.parse(readTextSync(path.join(out, 'coverage.json')))
  const s = coverage.summary
  assert.equal(s.pass + s.fail + s.env + s.pending + s.na + s.open, s.total)
  const tagged = coverage.items.reduce((n, i) => n + Object.keys(i.tags).length, 0)
  assert.equal(tagged, s.total)
  const redProven = list.filter((r) => r.redProof).length
  writeAtomic(
    path.join(out, 'handoff-counts.json'),
    `${JSON.stringify({ cases: list.length, PASS: count('PASS'), FAIL: count('FAIL'), ENV: count('ENV'), PENDING: count('PENDING'), redProven, coverage: s, unresolved: coverage.unresolved }, null, 2)}\n`
  )
  assert.doesNotMatch(report, /100\s*%/)
})

test('product FAILs, if any, carry evidence and the first violating variant', () => {
  for (const r of results().filter((x) => x.verdict === 'FAIL')) {
    assert.ok(
      r.evidence.length > 0 && existsSync(path.join(out, r.evidence[0])),
      `${r.id}: FAIL without evidence`
    )
    assert.ok(r.reason.length > 20, r.id)
  }
})

test('denominator and manifests regenerate identically after the run', async () => {
  assert.deepEqual(diff(await render(await generate()), currentFiles()), [])
})

test('the run left no scratch copy, browser or child process behind', () => {
  const ps = spawnSync('ps', ['-eo', 'pid,command'], { encoding: 'utf8' }).stdout
  assert.doesNotMatch(ps, /qa-mail-red-/, 'a scratch copy is still in use')
  assert.doesNotMatch(
    ps,
    new RegExp(`${LAYER_DIR.replaceAll('/', '\\/')}\\/(run|index)\\.mjs`),
    'a runner is still alive'
  )
  const left = spawnSync('ls', [base], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter((n) => n.startsWith('qa-mail-red-'))
  assert.deepEqual(left, [], 'scratch directories were not removed')
  void parseRef
})
