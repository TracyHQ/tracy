/**
 * Acceptance of the unit layer: the standalone runner, `--target local --prove-red`, once over every
 * area suite and regression case. The runner runs once over the whole layer (suites by area inside it); the groups are then checked on that one report.
Exit 1 (product FAILs kept with evidence) or 3 (ENV/PENDING remain) is the honest outcome; 2 fails this test.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkCommon, checkObservedAgainstLog, runLayer } from '../../../fixtures/static/acceptance.mjs'
import { listCases } from '../index.mjs'
import { parseTap, REPO } from '../../static/lib/common.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

/** Cases of the areas a run was asked for, as `listCases` returns them. */
async function casesOf(areas) {
  const seen = new Map()
  for (const area of areas) for (const c of await listCases({ area })) seen.set(c.id, c)
  return [...seen.values()]
}

test('unit: one whole-layer run; area suites are judged by exit code and TAP counts, regression cases carry RED proofs, no-run cases stay PENDING with an owner', async () => {
  const all = await listCases({})
  const run = runLayer('unit')
  checkCommon(run, all)
  const by = Object.fromEntries(run.results.map((r) => [r.id, r]))
  const suites = await casesOf(['suites'])
  assert.ok(suites.some((c) => c.kind === 'suite'))
  // Area suites: executed, judged by exit code and TAP counts, and never PASS.
  for (const c of suites.filter((x) => x.kind === 'suite')) {
    const r = by[c.id]
    assert.notEqual(r.verdict, 'PASS', c.id)
    checkObservedAgainstLog(run.out, r, parseTap)
    // The tooling is judged, not the product: a red suite is a FAIL with evidence (a finding) or an ENV naming
    // what this machine lacks; either is accepted. Counts must agree with the verdict.
    if (r.verdict === 'FAIL') {
      assert.ok(r.evidence.length > 0, `${c.id}: a FAIL carries evidence`)
      assert.ok(readTextSync(join(run.out, r.evidence[0])).length > 0, `${c.id}: the evidence is readable`)
    } else if (r.verdict === 'ENV') {
      assert.match(r.reason, /\S{4,}/, `${c.id}: an ENV names the missing thing`)
      assert.ok(r.evidence.length > 0, `${c.id}: an ENV carries evidence`)
    } else if (r.observed) {
      // PENDING: green counts, or skips that stop it being a pass; never red tests.
      assert.ok(r.observed.tests > 0 && r.observed.fail === 0, `${c.id}: PENDING shows no red test`)
      if (r.observed.skipped > 0) assert.match(r.reason, /skipped/, `${c.id}: skips are named in the reason`)
    }
  }
  const cases = await casesOf(['regression', 'regression-no-run'])
  // Every case of the layer is in exactly one group.
  assert.equal(cases.length + suites.length, all.length)
  // Counts are checked against the log for every result that carries them, not only the suites.
  for (const r of run.results) checkObservedAgainstLog(run.out, r, parseTap)
  // The regression fallback contract case: when it is PASS its RED proof is on its own pre-fix commit; any other
  // verdict is accepted here (it is judged by the common checks: evidence, counts, finding in the report).
  const reg020 = by['QA-UNIT-REG-020-happy']
  if (reg020.verdict === 'PASS') {
    assert.equal(reg020.redProof.kind, 'commit')
    assert.match(
      readTextSync(join(run.out, reg020.redProof.log)),
      /not ok \d+ - a UI patch release falls back to the nearest LOWER profile/
    )
  } else assert.ok(reg020.reason.length > 0, 'REG-020 carries a reason')
  // Every case without a deterministic run is listed PENDING with an owner; flaky_model cases go to the harness.
  for (const c of cases.filter((x) => x.kind === 'no-run')) {
    assert.equal(by[c.id].verdict, 'PENDING')
    assert.match(
      by[c.id].reason,
      c.flakyModel ? /harness live set/ : new RegExp(`owner layer ${c.ownerLayer}`)
    )
  }
  // A PASS regression case is proven on a commit its own PR produced; the proof names the restored product files.
  for (const r of run.results.filter((x) => x.verdict === 'PASS')) {
    assert.ok(r.redProof.ref && r.redProof.fixCommit && r.redProof.restored.length > 0, r.id)
    assert.ok(r.redProof.assertionId.length > 0, r.id)
  }
  const check = spawnSync('node', [fileURLToPath(new URL('../generate.mjs', import.meta.url)), '--check'], {
    encoding: 'utf8',
    cwd: REPO
  })
  assert.equal(check.status, 0, check.stderr)
})
