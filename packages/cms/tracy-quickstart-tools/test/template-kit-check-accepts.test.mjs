// Check accepts (reach-accepts.json): a person's reason for a counted reach or row pair failure the template will not fix
// (a demo placeholder button, a technique chip). The counter still counts everything; an explained failure moves from
// `coverage.failures` to `checkAccepts.<check>`, and an entry that matches nothing is itself counted
// (`checkAcceptsUnmatched`). Fabricated studio kit.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { readCheckAccepts } from '../template-kit/lib/check-accepts.mjs'
import { reachChecks } from '../template-kit/lib/reach-checks.mjs'
import { rowPairChecks } from '../template-kit/lib/row-pairs.mjs'

const chip = (n) => ({
  id: `block-31.link-${n}`,
  label: `Drill ${n}`,
  target: null,
  action: 'page-control'
})

const studio = () => ({
  checks: {},
  coverage: { parts: {}, failures: [{ part: 'slotsMissing', where: 'x', reason: 'kept' }] },
  site: { settingSlots: [], contactBlocks: [] },
  blocks: [
    {
      id: 'block-20',
      links: [
        { id: 'block-20.link-1', label: 'Pick a plan', target: null, action: 'page-control' },
        { id: 'block-20.link-2', label: 'Sign in to buy', target: null, action: 'page-control' },
        { id: 'block-20.link-3', label: 'Book a round', target: null, action: 'page-control' }
      ]
    },
    { id: 'block-31', links: [1, 2, 3, 4].map(chip) },
    {
      id: 'block-7',
      lists: [
        {
          id: 'block-7.clip',
          rows: [
            { index: 1, printsIn: 'block', pairedSlots: [] },
            { index: 2, printsIn: 'DIV.card', pairedSlots: [] }
          ]
        }
      ]
    }
  ]
})

const accepts = [
  {
    check: 'deadControls',
    where: 'links[block-20.link-1]',
    reason: 'demo pricing placeholder',
    by: 'tester'
  },
  { check: 'deadControls', where: 'links[block-20.link-2]', reason: 'demo pricing placeholder' },
  { check: 'deadControls', where: 'links[block-31.link-*]', reason: 'technique chips are demo labels' }
]

test('explained failures keep their count, leave coverage.failures and are recorded with their reason', () => {
  const kit = studio()
  const counts = reachChecks(kit, { accepts })
  assert.equal(counts.deadControls, 7, 'the counter still counts everything')
  assert.equal(kit.checks.deadControls, 7)
  assert.deepEqual(
    kit.coverage.failures.filter((f) => f.part === 'deadControls').map((f) => f.where),
    ['links[block-20.link-3]']
  )
  const explained = kit.checkAccepts.deadControls
  assert.equal(explained.length, 6)
  assert.deepEqual(explained[0], {
    where: 'links[block-20.link-1]',
    reason: 'demo pricing placeholder',
    by: 'tester'
  })
  assert.deepEqual(explained[5], {
    where: 'links[block-31.link-4]',
    reason: 'technique chips are demo labels',
    by: null
  })
  assert.equal(kit.checks.checkAcceptsUnmatched, 0)
  assert.ok(
    kit.coverage.failures.some((f) => f.part === 'slotsMissing'),
    'other parts are kept'
  )
})

test('an accept that matches nothing is counted and named, so a stale reason cannot hide', () => {
  const kit = studio()
  reachChecks(kit, {
    accepts: [...accepts, { check: 'phoneNotCallable', where: 'slots[contact-9.2]', reason: 'gone' }]
  })
  assert.equal(kit.checks.checkAcceptsUnmatched, 1)
  const stale = kit.coverage.failures.filter((f) => f.part === 'checkAcceptsUnmatched')
  assert.deepEqual(
    stale.map((f) => [f.check, f.where]),
    [['phoneNotCallable', 'slots[contact-9.2]']]
  )
  // Counted again: the same stale entry once, and gone once the entry is removed.
  reachChecks(kit, {
    accepts: [...accepts, { check: 'phoneNotCallable', where: 'slots[contact-9.2]', reason: 'gone' }]
  })
  assert.equal(kit.coverage.failures.filter((f) => f.part === 'checkAcceptsUnmatched').length, 1)
  reachChecks(kit, { accepts })
  assert.equal(kit.checks.checkAcceptsUnmatched, 0)
  assert.equal(kit.coverage.failures.filter((f) => f.part === 'checkAcceptsUnmatched').length, 0)
})

test('no accepts: nothing explained, every failure named as before', () => {
  const kit = studio()
  reachChecks(kit)
  assert.equal(kit.coverage.failures.filter((f) => f.part === 'deadControls').length, 7)
  assert.deepEqual(kit.checkAccepts?.deadControls ?? [], [])
})

test('row pair accepts are settled by rowPairChecks; one module never marks the other module accepts stale', () => {
  const kit = studio()
  const all = [
    ...accepts,
    { check: 'rowPartsUnpaired', where: 'lists[block-7.clip]', reason: 'the intro clip sits above the cards' }
  ]
  reachChecks(kit, { accepts: all })
  rowPairChecks(kit, { accepts: all })
  assert.equal(kit.checks.rowPartsUnpaired, 1)
  assert.equal(kit.coverage.failures.filter((f) => f.part === 'rowPartsUnpaired').length, 0)
  assert.deepEqual(kit.checkAccepts.rowPartsUnpaired, [
    { where: 'lists[block-7.clip]', reason: 'the intro clip sits above the cards', by: null }
  ])
  assert.equal(kit.checkAccepts.deadControls.length, 6, 'reach accepts are kept')
  assert.equal(kit.checks.checkAcceptsUnmatched, 0)
})

test('the accept file: a list of {check, where, reason}; a wrong entry or an unknown check is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-accepts-'))
  try {
    const file = join(dir, 'reach-accepts.json')
    assert.deepEqual(readCheckAccepts(file), [], 'no file, no accepts')
    writeFileSync(file, JSON.stringify(accepts))
    assert.equal(readCheckAccepts(file).length, 3)
    writeFileSync(file, JSON.stringify([{ check: 'deadControls', where: 'links[a]', reason: ' ' }]))
    assert.throws(() => readCheckAccepts(file), /reason/)
    writeFileSync(file, JSON.stringify([{ check: 'orphanTexts', where: 'x', reason: 'not acceptable' }]))
    assert.throws(() => readCheckAccepts(file), /orphanTexts/)
    writeFileSync(file, JSON.stringify({ deadControls: [] }))
    assert.throws(() => readCheckAccepts(file), /list/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
