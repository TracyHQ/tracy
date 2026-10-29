import assert from 'node:assert/strict'
import { test } from 'node:test'
import { engineReportOf, handoffEngine, keepEngineReport } from '../src/opportunities-build/engine-report.js'

for (const trade of ['bakery', 'dental clinic']) {
  test(`${trade}: drawing inside the write clock remains an error finding in the build receipt and handoff`, async () => {
    const timings = {
      drawingDuringApplyMs: 120,
      visionDuringApplyMs: 20,
      pictureCallsDuringApply: 2,
      findings: [
        {
          code: 'PICTURE_MODEL_DURING_APPLY',
          severity: 'error',
          message: 'Picture generation or analysis ran during site writes.'
        }
      ]
    }
    const row = { state: 'applied', error: null, timings }
    const db = {
      async query(sql, args) {
        if (sql.includes('from site_brief')) return { rows: [row] }
        return { rows: [{ id: args[0], receipt: { engine: JSON.parse(args[1]) } }] }
      }
    }
    const build = await keepEngineReport(db, { id: 'fictional-build', site_key: 'example.test' })
    for (const report of [engineReportOf(row), build.receipt.engine, handoffEngine(build.receipt.engine)]) {
      assert.deepEqual(report.findings, timings.findings)
      assert.equal(report.drawingDuringApplyMs, 120)
      assert.equal(report.visionDuringApplyMs, 20)
      assert.equal(report.pictureCallsDuringApply, 2)
    }
  })
}

test('a measured clean build retains explicit zero drawing and vision times', () => {
  const report = engineReportOf({
    state: 'applied',
    timings: { drawingDuringApplyMs: 0, visionDuringApplyMs: 0, pictureCallsDuringApply: 0, findings: [] }
  })
  assert.equal(report.drawingDuringApplyMs, 0)
  assert.equal(report.visionDuringApplyMs, 0)
  assert.equal(report.pictureCallsDuringApply, 0)
  assert.deepEqual(report.findings, [])
})
