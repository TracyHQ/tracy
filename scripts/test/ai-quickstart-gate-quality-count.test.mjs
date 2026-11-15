// What template quality counts (ticket #586, review round 3): the same failure read on both theme sides, the same
// element in the same colours, is one problem with both sides named, never two (V3); and a measurement in which no
// group measured anything (every group not applicable) is no pass (V5). Invented failures.
import assert from 'node:assert/strict'
import test from 'node:test'
import { QUALITY_GROUPS, qualityOf } from '../ai-quickstart/gate/quality.mjs'
import { detailProblems } from '../ai-quickstart/gate/record-detail.mjs'

const band = (side, measured = 'a.text-primary "Call" rgb(31, 111, 92) on rgb(31, 30, 30) reads 2.76:1') => ({
  group: 'band-contrast',
  page: '/contact',
  width: 1440,
  level: 'block',
  reason: `The brand style makes these words read under 3:1 in the ${side} theme.`,
  measured,
  selector: 'a.text-primary'
})
const seo = { status: 'passed', pages: 3, missing: [], unchecked: [] }

test('V3: one failure read the same on both theme sides is one regression naming both sides', () => {
  const marker = {
    groups: [
      {
        name: 'band-contrast',
        status: 'red',
        failures: [
          band('dark'),
          band('light'),
          band('dark', 'a.btn "Map" rgb(31, 111, 92) on rgb(24, 23, 23)')
        ]
      }
    ]
  }
  const control = { from: 'measured', groups: [{ name: 'band-contrast', status: 'green', failures: [] }] }
  const q = qualityOf({ marker, control, seo })
  assert.equal(q.status, 'failed')
  assert.equal(q.regressions.length, 2, JSON.stringify(q.regressions))
  assert.deepEqual(q.regressions[0].themes, ['dark', 'light'])
  assert.deepEqual(q.regressions[1].themes, ['dark'])
})

test('V3: the same element in other colours on the two sides stays two regressions', () => {
  const marker = {
    groups: [
      {
        name: 'band-contrast',
        status: 'red',
        failures: [
          band('dark'),
          band('light', 'a.text-primary "Call" rgb(31, 111, 92) on rgb(250, 250, 250)')
        ]
      }
    ]
  }
  const control = { from: 'measured', groups: [{ name: 'band-contrast', status: 'green', failures: [] }] }
  assert.equal(qualityOf({ marker, control, seo }).regressions.length, 2)
})

test('V5: every group not applicable on the marker site is no pass, and a record saying passed is refused', () => {
  const na = { groups: QUALITY_GROUPS.map((name) => ({ name, status: 'not-applicable', failures: [] })) }
  const q = qualityOf({ marker: na, control: { from: 'measured', ...na }, seo })
  assert.equal(q.status, 'incomplete')
  assert.ok(q.unmeasured.some((u) => u.reason === 'no_group_measured'))
  const forged = {
    ...q,
    status: 'passed',
    unmeasured: [],
    seo: { ...seo, blocking: [], same: [], uncompared: [] }
  }
  const problems = detailProblems({ measurements: { quality: forged } })
  assert.ok(
    problems.some((p) => /no group measured/.test(JSON.stringify(p))),
    JSON.stringify(problems)
  )
})
