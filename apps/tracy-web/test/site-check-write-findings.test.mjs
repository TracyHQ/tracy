// The site check's measures of what the write step found and left out (ADR 0044, decision 26): the write goes on, and step 11
// blocks on each finding and each item with nothing to write to, naming the cell and the step that owns the value. The site,
// kit and words are the invented ones of the write step fixtures (Quay Fitness Studio, demo-gym); nothing here is real.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck, SITE_CHECK_GROUPS } from '../src/site-check/site-check.js'
import { WRITE_FINDING_GROUPS } from '../src/site-check/write-findings.js'
import { checkSite, report } from './_site-check.mjs'
import { copy, runStep } from './_write-step-run.mjs'

const group = (check, name) => check.groups.find((g) => g.name === name)
const blocks = (g) => g.failures.map((f) => [f.slot, f.causingStep, f.level])

test('both measures run before read-back, so a red read-back never hides them', () => {
  const names = SITE_CHECK_GROUPS.map((g) => g.name)
  assert.ok(names.indexOf('look-guard-findings') < names.indexOf('read-back'))
  assert.ok(names.indexOf('unaddressable-items') < names.indexOf('read-back'))
})

test('each look guard finding blocks, naming the cell and the step that owns the value', async () => {
  const check = await runSiteCheck({
    door: checkSite({}).door,
    groups: WRITE_FINDING_GROUPS,
    report: report([], {
      guard: {
        findings: [
          {
            step: 6,
            stepName: 'copy',
            what: 'module-4.2',
            reason: 'removes the class div.list-social',
            sent: true
          },
          { step: 8, stepName: 'pictures', what: 'module-4.7', reason: 'the icon is heavier', sent: true },
          { step: 9, stepName: 'write', what: 'template.fonts', reason: 'not open', sent: false }
        ],
        refused: []
      }
    })
  })
  const g = group(check, 'look-guard-findings')
  assert.equal(g.status, 'red')
  assert.deepEqual(blocks(g), [
    ['module-4.2', 6, 'block'],
    ['module-4.7', 8, 'block'],
    ['template.fonts', 9, 'block']
  ])
  assert.match(g.failures[0].reason, /div\.list-social.*written all the same/)
  assert.match(g.failures[2].reason, /not sent/)
  assert.equal(check.status, 'red')
})

test('each item left out blocks on its owning step, with the cell', async () => {
  const check = await runSiteCheck({
    door: checkSite({}).door,
    groups: WRITE_FINDING_GROUPS,
    report: report([], {
      unaddressable: [
        {
          slot: 'block-9.1',
          key: 'module-9.1',
          owner: 'writer',
          step: 6,
          reason: 'copy: the kit has no slot block-9.1'
        },
        {
          slot: 'block-2.lost',
          key: null,
          owner: 'picture',
          step: 8,
          reason: 'pictures: the kit has no image slot'
        },
        {
          slot: 'block-1.1',
          key: 'module-1.1',
          owner: 'plan-label',
          step: 3,
          reason: 'the site does not have it'
        }
      ]
    })
  })
  const g = group(check, 'unaddressable-items')
  assert.equal(g.status, 'red')
  assert.deepEqual(blocks(g), [
    ['block-9.1', 6, 'block'],
    ['block-2.lost', 8, 'block'],
    ['block-1.1', 3, 'block']
  ])
  assert.match(g.failures[1].reason, /Nothing to write it to: pictures/)
})

test('a report with nothing found and nothing left out is not applicable, never green; one written before they were kept is unmeasured', async () => {
  const clean = await runSiteCheck({
    door: checkSite({}).door,
    groups: WRITE_FINDING_GROUPS,
    report: report([])
  })
  assert.deepEqual(
    clean.groups.map((g) => g.status),
    ['not-applicable', 'not-applicable']
  )
  assert.equal(clean.status, 'green')
  const older = report([])
  delete older.guard
  delete older.unaddressable
  const old = await runSiteCheck({ door: checkSite({}).door, groups: WRITE_FINDING_GROUPS, report: older })
  assert.deepEqual(
    old.groups.map((g) => g.status),
    ['unmeasured', 'unmeasured']
  )
  assert.equal(old.status, 'unmeasured')
})

test('read-back leaves an item left out to its own measure, so it is blamed once and on its step', async () => {
  const line = {
    slot: 'block-9.1',
    key: 'module-9.1',
    owner: 'writer',
    status: 'refused',
    reason: 'copy: the kit has no slot block-9.1',
    readBack: null,
    unaddressable: { step: 6, stepName: 'copy' }
  }
  const check = await runSiteCheck({
    door: checkSite({}).door,
    report: report([line], {
      unaddressable: [{ slot: 'block-9.1', key: 'module-9.1', owner: 'writer', step: 6, reason: line.reason }]
    })
  })
  assert.deepEqual(
    group(check, 'read-back').failures.filter((f) => f.level === 'block'),
    []
  )
  assert.equal(group(check, 'read-back').checked, 0, 'the line is not compared')
  assert.deepEqual(blocks(group(check, 'unaddressable-items')), [['block-9.1', 6, 'block']])
})

test('through a real run: a guard finding and a stray copy slot are written around, and the check names both cells and steps', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-99.1', owner: 'writer', text: 'Words for a slot nobody has', factIds: [] })
  const contentMap = {
    slots: [{ key: 'module-5.1', type: 'text', sample: '((div class="list-social"))((/div))' }]
  }
  const { report: written } = await runStep({ copy: c }, {}, { contentMap })
  assert.equal(written.status, 'done', JSON.stringify(written.cause))
  const check = await runSiteCheck({
    door: checkSite({}).door,
    groups: WRITE_FINDING_GROUPS,
    report: written
  })
  assert.deepEqual(blocks(group(check, 'look-guard-findings')), [['module-5.1', 6, 'block']])
  assert.deepEqual(blocks(group(check, 'unaddressable-items')), [['block-99.1', 6, 'block']])
})
