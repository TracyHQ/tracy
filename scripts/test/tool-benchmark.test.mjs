import assert from 'node:assert/strict'
import test from 'node:test'
import { compareToolRuns } from '../measure/tool-benchmark.mjs'

const turn = (run) => ({
  preset: 'designer-wordpress',
  requests: [{ provider: 'fixed', model: 'fixed', reasoningEffort: 'low' }],
  usageComplete: true,
  seconds: run.arm === 'baseline' ? 10 : 7,
  steps: 2,
  calls: 3,
  resultChars: 400,
  input: 10,
  output: 10,
  cacheRead: 100
})
const fixture = () => ({
  schemaVersion: 1,
  minimumPairs: 3,
  boundariesVerified: true,
  baseline: { revision: 'before', image: 'before-image' },
  candidate: { revision: 'after', image: 'after-image' },
  runs: Array.from({ length: 3 }, (_, i) =>
    ['baseline', 'candidate'].map((arm) => ({
      pair: `task-${i}`,
      arm,
      cms: 'wp',
      fixture: 'snapshot-1',
      cache: 'cold',
      costUsd: arm === 'baseline' ? 1 : 0.7,
      verification: { success: true, evidence: 'independent persisted-state verifier' }
    }))
  ).flat()
})

test('matched verified tasks compare all-attempt cost and customer latency', () => {
  const report = compareToolRuns(fixture(), turn)
  assert.equal(report.verdict, 'meets-target')
  assert.equal(report.baseline.costPerSuccessUsd, 1)
  assert.ok(report.costImprovement > 0.29)
})
test('unknown cost, different model, missing pair and unfinished tasks cannot prove a win', () => {
  for (const change of [
    (m) => {
      m.runs[1].costUsd = null
    },
    (m) => {
      m.runs.pop()
    },
    (m) => {
      m.runs[1].fixture = 'different'
    },
    (m) => {
      m.boundariesVerified = false
    }
  ]) {
    const m = fixture()
    change(m)
    assert.equal(compareToolRuns(m, turn).verdict, 'inconclusive')
  }
  assert.equal(
    compareToolRuns(fixture(), (r) => ({ ...turn(r), seconds: r.arm === 'candidate' ? null : 10 })).verdict,
    'inconclusive'
  )
  assert.equal(
    compareToolRuns(fixture(), (r) => ({ ...turn(r), requests: [{ provider: 'fixed', model: r.arm }] }))
      .verdict,
    'inconclusive'
  )
})
test('failed task spend stays in cost per success and a quality regression blocks acceptance', () => {
  const m = fixture()
  m.runs[1].verification.success = false
  const report = compareToolRuns(m, turn)
  assert.equal(report.verdict, 'inconclusive')
  assert.ok(report.candidate.costPerSuccessUsd > 1)
  assert.match(report.reasons.join(), /success regressed/)
})
test('missing verification, missing settlement and duplicate arms are rejected', () => {
  for (const change of [
    (m) => {
      m.runs[0].verification = null
    },
    (m) => {
      delete m.runs[0].costUsd
    },
    (m) => {
      m.runs.push(m.runs[0])
    }
  ]) {
    const m = fixture()
    change(m)
    assert.throws(() => compareToolRuns(m, turn))
  }
})
