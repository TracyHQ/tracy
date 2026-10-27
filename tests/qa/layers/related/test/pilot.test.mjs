// Pilot of the related layer: the real standalone command against the real sibling clones (when a root is configured),
// with RED proofs for the chain cases. Keeps raw exit status and logs under QA_TASK_ARTIFACTS (or the OS temp folder).
//   node --test tests/qa/layers/related/test/pilot.test.mjs
// Where to find the clones: QA_RELATED_ROOT, or QA_RELATED_CONFIG, or <QA_TASK_ARTIFACTS>/related.config.json - the
// person's local config. With none of them every suite is ENV and the pilot says so rather than pretend.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { listCases } from '../index.mjs'
import { spawnBounded } from '../../cms/lib/kit.mjs'
import { assertEvidenceOutcome, assertKnownFinding, assertRedLog } from '../../cms/test/structured.mjs'
import { resolveRoot, snapshotClone } from '../lib/clone.mjs'
import { SUITES } from '../specs/suites.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../..')
const ART = process.env.QA_TASK_ARTIFACTS ?? path.join(os.tmpdir(), 'qa-related-pilot')
// A fresh folder per run: earlier outputs are evidence and are never deleted by the pilot.
const OUT = path.join(ART, `related-pilot-${new Date().toISOString().replace(/[-:.]/g, '')}-${process.pid}`)

test('standalone run reaches a verdict for every suite and chain case, with provenance and untouched clones', {
  timeout: 2_350_000
}, async () => {
  await fs.mkdir(ART, { recursive: true })
  const env = { ...process.env }
  const localConfig = path.join(ART, 'related.config.json')
  if (!env.QA_RELATED_ROOT && !env.QA_RELATED_CONFIG && existsSync(localConfig))
    env.QA_RELATED_CONFIG = localConfig
  const where = resolveRoot(env)
  const repos = [...new Set(SUITES.map((s) => s.repo))]
  const before = {}
  for (const repo of repos)
    before[repo] = where.root ? await snapshotClone(path.join(where.root, repo)) : { ok: false }

  const run = await spawnBounded({
    argv: ['node', path.join(HERE, '../run.mjs'), '--target', 'local', '--prove-red', '--out', OUT],
    cwd: REPO,
    env,
    timeoutMs: 2_300_000,
    maxBytes: 4_000_000
  })
  await fs.writeFile(
    path.join(ART, 'pilot-related-exit.json'),
    `${JSON.stringify({ exit: run.exit, signal: run.signal, timedOut: run.timedOut, durationMs: run.durationMs, configFrom: where.from, stderrTail: run.stderr.slice(-2000) }, null, 2)}\n`
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
  const expectedExit = results.some((r) => r.verdict === 'FAIL')
    ? 1
    : results.every((r) => r.verdict === 'PASS')
      ? 0
      : 3
  assert.equal(run.exit, expectedExit, 'the exit code does not follow the verdicts')
  const known = JSON.parse(
    await readTextAsync(path.join(HERE, '../../../oracles/related/known-product-findings.json'))
  )

  for (const r of results) {
    for (const rel of r.evidence)
      assert.ok(existsSync(path.join(OUT, rel)), `${r.id}: evidence ${rel} is missing`)
    if (r.verdict === 'PASS') {
      assert.ok(r.redProof, `${r.id}: PASS without a RED proof`)
      await assertRedLog(OUT, r)
      if (byCase.get(r.id).area !== 'suites') await assertEvidenceOutcome(OUT, r)
    } else assert.equal(r.redProof, null)
    if (r.verdict !== 'PASS') assert.ok(r.reason.length > 0, `${r.id}: ${r.verdict} without a reason`)
    if (r.verdict === 'ENV')
      assert.match(
        r.reason,
        /\[probe: [^\]]+\]|probe:|not installed|not a git clone|no sibling-repo root|root is not|does not exist|cannot be enforced|is not present/,
        `${r.id}: ENV names no probe`
      )
    if (r.verdict === 'FAIL') {
      assert.notEqual(
        byCase.get(r.id).area,
        'suites',
        `${r.id}: a sibling suite has no mapping from exit code to FAIL`
      )
      assert.ok(
        r.assertionIds.length > 0 && r.evidence.length > 0,
        `${r.id}: FAIL without an assertion and evidence`
      )
      assertKnownFinding(known, r.id)
      await assertEvidenceOutcome(OUT, r)
    }
  }

  const suites = results.filter((r) => byCase.get(r.id).area === 'suites')
  assert.equal(
    suites.length,
    SUITES.length,
    'every requested suite directory, and the PHP runner, has a case'
  )
  for (const r of suites) {
    assert.notEqual(r.verdict, 'PASS', `${r.id}: a sibling suite has no case-level oracle or RED proof`)
    if (!where.root) assert.equal(r.verdict, 'ENV', `${r.id}: no root configured`)
  }

  if (where.root) {
    // Provenance: every repo's commit is recorded, matches what is on disk now, and no clone was touched by the run.
    const provenance = JSON.parse(await readTextAsync(path.join(OUT, 'provenance.json')))
    for (const repo of repos) {
      const after = await snapshotClone(path.join(where.root, repo))
      if (!before[repo].ok) continue
      assert.equal(provenance.repos[repo].head, before[repo].head, `${repo}: recorded commit`)
      assert.equal(after.head, before[repo].head, `${repo}: HEAD moved during the run`)
      assert.equal(
        after.status,
        before[repo].status,
        `${repo}: the working tree (ignored files included) changed during the run`
      )
    }
    for (const r of suites) {
      const prov = r.evidence.find((e) => e.endsWith('.provenance.json'))
      if (!prov) continue
      const doc = JSON.parse(await readTextAsync(path.join(OUT, prov)))
      assert.match(doc.sha, /^[0-9a-f]{40}$/)
      assert.equal(doc.headBefore, doc.sha)
      if (doc.refusal) {
        assert.ok(r.verdict !== 'PASS' && r.reason.length > 0, `${r.id}: a refusal without a reason`)
        continue // a refusal ran nothing: its provenance names the commit and the reason, nothing more
      }
      assert.equal(doc.headBefore, doc.headAfter)
      assert.ok(
        doc.files.length > 0 && doc.files.every((f) => f.verdict && (f.argv === null || f.argv.length > 0))
      )
      assert.equal(doc.cloneUnchanged, true, `${r.id}: the clone changed while its suite ran`)
      assert.equal(doc.sourceUnchanged, true, `${r.id}: the read-only source copy changed during the run`)
      assert.ok(doc.policy?.backend, `${r.id}: no execution policy recorded`)
    }
  }

  const chain = results.filter((r) => byCase.get(r.id).area === 'chain')
  // A chain case is PASS only with its RED proof; when a clone or tool is missing it is ENV with its probe (checked above).
  for (const r of chain)
    assert.ok(r.verdict === 'PASS' || r.reason.length > 0, `${r.id}: ${r.verdict} without reason`)
  const coverage = JSON.parse(await readTextAsync(path.join(OUT, 'coverage.json')))
  assert.equal(coverage.complete, false)
  assert.equal(
    coverage.totals.obligations,
    coverage.totals.na + coverage.totals.open + coverage.totals.implemented
  )
  const counts = Object.fromEntries(
    ['PASS', 'FAIL', 'ENV', 'PENDING'].map((v) => [v, results.filter((r) => r.verdict === v).length])
  )
  await fs.writeFile(
    path.join(ART, 'pilot-related-counts.json'),
    `${JSON.stringify({ cases: results.length, ...counts, redProven: results.filter((r) => r.redProof).length, items: coverage.totals.items }, null, 2)}\n`
  )
})
