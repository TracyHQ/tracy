/**
 * Acceptance of the static layer: the standalone runner, `--target local --prove-red`, once over every
 * gate. Exit 1 (a gate red on the tree is a product FAIL, kept) or 3 is honest; 2 fails this test.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkCommon,
  redProofProblems,
  requiredGateProblems,
  runLayer
} from '../../../fixtures/static/acceptance.mjs'
import { listCases } from '../index.mjs'
import { REPO } from '../lib/common.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

test('static: standalone local run with RED proofs agrees with listCases, the manifests and the disk', async () => {
  const cases = await listCases({})
  const run = runLayer('static')
  checkCommon(run, cases)
  const by = Object.fromEntries(run.results.map((r) => [r.id, r]))
  const mutations = JSON.parse(readTextSync(join(REPO, 'tests/qa/oracles/static/mutations.json'))).mutations
  const readLog = (rel) => readTextSync(join(run.out, rel))
  // The three rules the plan names must each stand on their own gate with a real RED proof. A gate that is red on
  // the tree is a kept product FAIL (reported, with its log) and still does not satisfy this requirement.
  assert.deepEqual(requiredGateProblems(run.results, readLog, mutations), [], 'required gates with RED proof')
  for (const r of run.results.filter((x) => x.verdict === 'PASS'))
    assert.deepEqual(redProofProblems(r, readLog, mutations), [])
  for (const r of run.results.filter((x) => x.verdict === 'FAIL'))
    assert.ok(
      r.reason && (r.evidence?.length ?? 0) + (existsSync(join(run.out, 'logs', `${r.id}.log`)) ? 1 : 0) > 0,
      `${r.id}: FAIL keeps a reason and a log`
    )
  // The bundles gate runs locally now; it is never a PASS without a RED proof (checked above for every PASS)
  // and never a FAIL without a reason and a log (checked above for every FAIL): a stale committed bundle on
  // the tree under test is a real product finding, not a harness error.
  const bundles = by['QA-STATIC-bundles-happy']
  assert.ok(['PASS', 'FAIL', 'PENDING', 'ENV'].includes(bundles.verdict), bundles.verdict)
  if (bundles.verdict === 'PENDING') assert.ok(bundles.reason, 'a PENDING bundles case names its reason')
  // Gates the plan keeps out of a local run were not executed.
  for (const gate of ['tests', 'boot-graph'])
    assert.equal(
      existsSync(join(run.out, 'logs', `QA-STATIC-${gate}-happy.log`)),
      false,
      `${gate} was not executed`
    )
  for (const gate of ['tests', 'boot-graph'])
    assert.ok(['ENV', 'PENDING'].includes(by[`QA-STATIC-${gate}-happy`].verdict))
  assert.equal(by['QA-STATIC-rule-focus-halo-invalid'].verdict, 'PENDING')
  const check = spawnSync('node', [fileURLToPath(new URL('../generate.mjs', import.meta.url)), '--check'], {
    encoding: 'utf8'
  })
  assert.equal(check.status, 0, check.stderr)
})
