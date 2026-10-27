// Pilot of the cms layer: the real standalone command, end to end, with RED proofs and the wrapped legacy suites.
//   node --test tests/qa/layers/cms/test/pilot.test.mjs
// It keeps the raw exit status and logs under QA_TASK_ARTIFACTS (or the OS temp folder), and fails on anything that is
// not an honest result: an invalid contract (exit 2), a missing or empty evidence file, a PASS without a RED log that
// names its assertion, a legacy suite counted as PASS, an ENV without a probe, a FAIL nobody has recorded as a finding.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { listCases } from '../index.mjs'
import { spawnBounded } from '../lib/kit.mjs'
import { assertEvidenceOutcome, assertKnownFinding, assertRedLog } from './structured.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../..')
const ART = process.env.QA_TASK_ARTIFACTS ?? path.join(os.tmpdir(), 'qa-cms-pilot')
// A fresh folder per run: earlier outputs are evidence and are never deleted by the pilot.
const OUT = path.join(ART, `cms-pilot-${new Date().toISOString().replace(/[-:.]/g, '')}-${process.pid}`)

test('standalone run --target local --prove-red reaches a verdict for every case, with evidence a person can follow', {
  timeout: 1_150_000
}, async () => {
  await fs.mkdir(ART, { recursive: true })
  const run = await spawnBounded({
    argv: ['node', path.join(HERE, '../run.mjs'), '--target', 'local', '--prove-red', '--out', OUT],
    cwd: REPO,
    env: process.env,
    timeoutMs: 1_100_000,
    maxBytes: 4_000_000
  })
  await fs.writeFile(
    path.join(ART, 'pilot-cms-exit.json'),
    `${JSON.stringify({ exit: run.exit, signal: run.signal, timedOut: run.timedOut, durationMs: run.durationMs, stderrTail: run.stderr.slice(-2000) }, null, 2)}\n`
  )
  assert.equal(run.timedOut, false, 'the pilot run timed out')
  assert.ok(
    [0, 1, 3].includes(run.exit),
    `exit ${run.exit} (2 = invalid usage or contract): ${run.stderr.slice(-800)}`
  )

  const results = JSON.parse(await readTextAsync(path.join(OUT, 'results.json')))
  const cases = await listCases({})
  assert.deepEqual(
    results.map((r) => r.id).sort(),
    cases.map((c) => c.id).sort(),
    'every case has exactly one result'
  )
  const byCase = new Map(cases.map((c) => [c.id, c]))
  // The exit code follows the results: 0 all PASS, 1 any FAIL, 3 only ENV/PENDING besides PASS.
  const expectedExit = results.some((r) => r.verdict === 'FAIL')
    ? 1
    : results.every((r) => r.verdict === 'PASS')
      ? 0
      : 3
  assert.equal(run.exit, expectedExit, 'the exit code does not follow the verdicts')
  const known = JSON.parse(
    await readTextAsync(path.join(HERE, '../../../oracles/cms/known-product-findings.json'))
  )
  const env = process.env

  for (const r of results) {
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), `${r.id}: verdict ${r.verdict}`)
    for (const rel of r.evidence)
      assert.ok(existsSync(path.join(OUT, rel)), `${r.id}: evidence ${rel} is missing`)
    if (r.verdict === 'PASS') {
      assert.ok(r.redProof, `${r.id}: PASS without a RED proof`)
      await assertRedLog(OUT, r)
      if (byCase.get(r.id).area !== 'suites') await assertEvidenceOutcome(OUT, r)
    } else assert.equal(r.redProof, null, `${r.id}: only a PASS carries a RED proof`)
    if (r.verdict !== 'PASS') assert.ok(r.reason.length > 0, `${r.id}: ${r.verdict} without a reason`)
    if (r.verdict === 'ENV')
      assert.match(
        r.reason,
        /\[probe: [^\]]+\]|probe:|not installed|not reachable|is unset|not set/,
        `${r.id}: ENV names no probe`
      )
    if (r.verdict === 'FAIL') {
      // A finding is a machine case whose invariant failed, with a recorded oracle and reproduction; a wrapped suite never FAILs.
      assert.notEqual(
        byCase.get(r.id).area,
        'legacy',
        `${r.id}: a wrapped suite has no mapping from exit code to FAIL`
      )
      assert.ok(
        r.assertionIds.length > 0 && r.evidence.length > 0,
        `${r.id}: FAIL without an assertion and evidence`
      )
      assert.ok(byCase.get(r.id).oracle?.invariant, `${r.id}: FAIL without an oracle invariant`)
    }
    if (r.verdict === 'FAIL') {
      assertKnownFinding(known, r.id)
      await assertEvidenceOutcome(OUT, r)
    }
  }

  // The wrapped suites: all eleven are accounted for, none counts as a pass, database-backed ones say so when there is no database.
  const legacy = results.filter((r) => byCase.get(r.id).area === 'legacy')
  assert.equal(legacy.length, cases.filter((c) => c.area === 'legacy').length)
  assert.ok(legacy.length >= 11)
  for (const r of legacy) {
    assert.notEqual(r.verdict, 'PASS', `${r.id}: a legacy suite has no case-level oracle or RED proof`)
    if (byCase.get(r.id).prerequisites.includes('db:test-database') && !env.TEST_DATABASE_URL)
      assert.equal(r.verdict, 'ENV', `${r.id}: database-backed suite without a database`)
    else
      assert.equal(
        r.verdict,
        'PENDING',
        `${r.id}: a wrapped suite is PENDING or ENV by a declared prerequisite, got ${r.verdict}`
      )
  }
  for (const name of [
    'quickstart-releases',
    'release-assets',
    'local-releases',
    'contracts',
    'build-questions',
    'quickstart-jpa'
  ])
    assert.ok(
      legacy.some((r) => r.id.includes(name)),
      `${name} suite is wrapped`
    )

  // The matrix and the live cases are never green without their dependency.
  for (const r of results.filter((x) => ['matrix', 'live'].includes(byCase.get(x.id).area))) {
    if (!env.QA_STAND_URL && byCase.get(r.id).area === 'matrix') assert.equal(r.verdict, 'ENV')
    assert.notEqual(r.verdict, 'PASS', `${r.id}: needs a stand or GitHub credentials the pilot does not have`)
  }

  const coverage = JSON.parse(await readTextAsync(path.join(OUT, 'coverage.json')))
  assert.equal(coverage.complete, false, 'unresolved sources keep the inventory incomplete')
  assert.equal(
    coverage.totals.obligations,
    coverage.totals.na + coverage.totals.open + coverage.totals.implemented
  )
  assert.ok(existsSync(path.join(OUT, 'report.md')))
  const counts = Object.fromEntries(
    ['PASS', 'FAIL', 'ENV', 'PENDING'].map((v) => [v, results.filter((r) => r.verdict === v).length])
  )
  await fs.writeFile(
    path.join(ART, 'pilot-cms-counts.json'),
    `${JSON.stringify({ cases: results.length, ...counts, redProven: results.filter((r) => r.redProof).length, items: coverage.totals.items }, null, 2)}\n`
  )
})
