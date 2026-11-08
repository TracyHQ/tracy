// A group that checked nothing is never green (ADR 0044, decision 27): it is unmeasured, or not applicable when it says why, and
// neither turns the verdict red. And the plugin's refusals for want of a contract slot are blamed once, on the template's contract
// (issue #369), never on the write step through read-back. Sites, kits, slots and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLines } from '../src/site-check/check-lines.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { readBackGroup } from '../src/site-check/read-back.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { WRITE_FINDING_GROUPS } from '../src/site-check/write-findings.js'
import { checkSite, report, written } from './_site-check.mjs'
import { fakeHost, pageRead, pagedSite, writtenReport } from './_site-check-pages.mjs'

const group = (check, name) => check.groups.find((g) => g.name === name)
const NO_SLOT = (slot) =>
  `${slot} is no slot of this site, so nothing can empty it; a new contract would need one (tracked as issue #369)`

test('a group that checked 0 with no reason is unmeasured, counted, and the verdict is not red', async () => {
  const silent = { name: 'quiet-measure', causingStep: 9, run: async () => ({ checked: 0, failures: [] }) }
  const check = await runSiteCheck({ door: checkSite({}).door, report: report([]), groups: [silent] })
  const g = group(check, 'quiet-measure')
  assert.equal(g.status, 'unmeasured')
  assert.match(g.reason, /0 checked|nothing was measured/i)
  assert.equal(check.counts.unmeasured, 1)
  assert.equal(check.status, 'unmeasured')
  assert.match(checkLines(check)[0], /^quiet-measure: unmeasured 0 checked/)
})

test('a group that checked 0 and says why is not applicable, printed with its reason, and keeps the verdict green', async () => {
  const idle = {
    name: 'idle-measure',
    causingStep: 9,
    run: async () => ({ checked: 0, notApplicable: 'the plan orders nothing of this kind', failures: [] })
  }
  const check = await runSiteCheck({ door: checkSite({}).door, report: report([]), groups: [idle] })
  const g = group(check, 'idle-measure')
  assert.equal(g.status, 'not-applicable')
  assert.equal(g.reason, 'the plan orders nothing of this kind')
  assert.equal(check.status, 'green')
  assert.equal(check.counts.unmeasured, 0)
  assert.equal(check.counts.notApplicable, 1)
  const lines = checkLines(check)
  assert.equal(lines[0], 'idle-measure: not-applicable 0 checked (the plan orders nothing of this kind)')
  assert.match(lines.at(-1), /1 not applicable\)$/)
})

test('a red group stays red at 0 checked, and a not applicable group does not stop the groups after it', async () => {
  const red = {
    name: 'red-at-zero',
    causingStep: 9,
    run: async () => ({ checked: 0, failures: [{ reason: 'the site answers another contract' }] })
  }
  const stopper = {
    name: 'stopper',
    causingStep: 9,
    stopsLaterWhenRed: true,
    run: async () => ({ checked: 0, notApplicable: 'nothing to compare', failures: [] })
  }
  const after = { name: 'after', causingStep: 9, run: async () => ({ checked: 1, failures: [] }) }
  const check = await runSiteCheck({
    door: checkSite({}).door,
    report: report([]),
    groups: [red, stopper, after]
  })
  assert.deepEqual(
    check.groups.map((g) => g.status),
    ['red', 'not-applicable', 'green']
  )
})

test('broken-sentence is not applicable when every slot of every sentence group is hidden by the plan or has no line', async () => {
  const kit = {
    tool: 'template-kit 3.1.0',
    blocks: [
      {
        id: 'block-40',
        sentences: [{ id: 's1', slots: ['block-40.1', 'block-40.2'], joins: [' '], pieces: ['a ', 'b'] }]
      },
      {
        id: 'block-41',
        sentences: [{ id: 's2', slots: ['block-41.1', 'block-41.2'], joins: [' '], pieces: ['c ', 'd'] }]
      }
    ]
  }
  const hidden = (slot, key) => ({
    slot,
    key,
    owner: 'plan',
    status: 'hidden',
    reason: 'the plan hides this slot'
  })
  const r = writtenReport()
  r.slots.push(hidden('block-40.1', 'module-40.1'), hidden('block-40.2', 'module-40.2'))
  const check = await runSiteCheck({
    door: pagedSite(1, { 'module-40.1': 'Join our', 'module-40.2': 'friendly crew' }).door,
    report: r,
    host: fakeHost({ '/': pageRead('/') }, { measures: () => [{ path: '/', width: 1440, shownText: 'x' }] })
      .host,
    groups: PAGE_CHECK_GROUPS.filter((g) => g.name === 'broken-sentence'),
    kit
  })
  const g = group(check, 'broken-sentence')
  assert.equal(g.status, 'not-applicable')
  assert.match(
    g.reason,
    /every slot of the 2 sentence groups is hidden by the plan or has no line in the write report/
  )
  assert.equal(check.status, 'green')
})

test('broken-sentence with a written sentence slot that no page was found printing is unmeasured, not green', async () => {
  const kit = {
    tool: 'template-kit 3.1.0',
    blocks: [
      {
        id: 'block-40',
        sentences: [{ id: 's1', slots: ['block-40.1', 'block-40.2'], joins: [' '], pieces: ['a ', 'b'] }]
      }
    ]
  }
  const r = writtenReport()
  r.slots.push(
    written('block-40.1', 'module-40.1', 'Join our'),
    written('block-40.2', 'module-40.2', 'friendly crew')
  )
  const check = await runSiteCheck({
    door: pagedSite(1, { 'module-40.1': 'Join our', 'module-40.2': 'friendly crew' }).door,
    report: r,
    host: fakeHost({ '/': pageRead('/') }, { measures: () => [{ path: '/', width: 1440, shownText: 'x' }] })
      .host,
    groups: PAGE_CHECK_GROUPS.filter((g) => g.name === 'broken-sentence'),
    kit
  })
  assert.equal(group(check, 'broken-sentence').status, 'unmeasured')
})

test('unaddressable-items lists each slot the plugin refused for want of a contract slot, on the contract (step 0, issue #369)', async () => {
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
        }
      ],
      noWayOut: [
        { slot: 'header.link-7', reason: NO_SLOT('header.link-7') },
        { slot: 'block-30.cta', reason: NO_SLOT('module-30.cta') }
      ]
    })
  })
  const g = group(check, 'unaddressable-items')
  assert.equal(g.status, 'red')
  assert.equal(g.checked, 3)
  assert.deepEqual(
    g.failures.map((f) => [f.slot, f.causingStep]),
    [
      ['block-9.1', 6],
      ['header.link-7', 0],
      ['block-30.cta', 0]
    ]
  )
  assert.match(g.failures[1].reason, /contract.*issue #369/)
})

test('a report that left nothing out and was refused nothing is not applicable, not green', async () => {
  const check = await runSiteCheck({
    door: checkSite({}).door,
    groups: WRITE_FINDING_GROUPS,
    report: report([], { noWayOut: [] })
  })
  assert.deepEqual(
    check.groups.map((g) => g.status),
    ['not-applicable', 'not-applicable', 'not-applicable', 'not-applicable']
  )
  assert.equal(check.status, 'green')
})

test('read-back does not blame step 9 for a slot the plugin refused for want of a contract slot', async () => {
  const refusal = NO_SLOT('module-30.cta')
  const lines = [
    written('block-2.1', 'module-2.1', 'Own words'),
    {
      slot: 'block-30.cta',
      key: 'module-30.cta',
      owner: 'plan',
      status: 'failed',
      reason: refusal,
      readBack: null
    }
  ]
  const check = await runSiteCheck({
    door: checkSite({ 'module-2.1': 'Own words' }).door,
    groups: [...WRITE_FINDING_GROUPS, readBackGroup],
    report: report(lines, { noWayOut: [{ slot: 'block-30.cta', reason: refusal }] })
  })
  const back = group(check, 'read-back')
  assert.equal(back.status, 'green')
  assert.equal(back.checked, 1)
  assert.deepEqual(back.failures, [])
  const items = group(check, 'unaddressable-items')
  assert.deepEqual(
    items.failures.map((f) => [f.slot, f.causingStep]),
    [['block-30.cta', 0]]
  )
})
