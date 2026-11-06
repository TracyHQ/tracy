// The finisher's final site check (#424 review, spec #418): a kept repair is undone only for a new blocking failure on what
// it changed, never for a failure that names no slot or block; the check that runs again after the undos is compared with
// the first check too; the records of undone repairs are new records, never the kept ones changed; and the check runs in
// the time kept for it. The repairs, their undo and the site checks are fakes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finalCheck } from '../src/write-step/finisher/final-check.js'
import { finisherBudget } from '../src/write-step/finisher/run-limits.js'
import { placeLocks } from '../src/write-step/finisher/work-pool.js'

const green = {
  version: 'site-check/1',
  status: 'green',
  groups: [{ name: 'read-back', status: 'green', failures: [] }]
}
const red = (failures) => ({
  version: 'site-check/1',
  status: 'red',
  groups: [{ name: 'read-back', status: 'red', failures: failures.map((f) => ({ level: 'block', ...f })) }]
})

/** A kept words repair of one slot, whose undo is recorded in `undone`. */
const keptRepair = (slot, undone) => {
  const record = { page: '/', slot, outcome: 'kept', reason: 'better', applyId: `finisher-${slot}` }
  return {
    record,
    line: { slot, ordered: 'Clean words', applyId: record.applyId },
    repair: {
      number: 1,
      valid: { slot, block: null },
      steps: {
        place: () => 'contract',
        target: () => `slot ${slot}`,
        undo: async () => {
          undone.push(slot)
          return { ok: true }
        }
      }
    }
  }
}

const runOf = (over = {}) => ({
  budget: finisherBudget({ now: () => 0, ...over }),
  locks: placeLocks(),
  claimed: new Map()
})
const report = { slots: [{ slot: 'block-2.1', ordered: 'Raw words' }] }

/** A site check that answers the given checks in turn, and keeps the reports it measured. */
const checks = (...answers) => {
  const measured = []
  return {
    measured,
    siteCheck: async (r) => {
      measured.push(r)
      return answers.shift()
    }
  }
}

test('a new blocking failure that names no slot or block undoes no repair, and is logged as unblamed', async () => {
  const undone = []
  const kept = [keptRepair('block-2.1', undone)]
  const { siteCheck } = checks(red([{ page: '/', slot: null }]))
  const final = await finalCheck(runOf(), { report, kept, firstCheck: green, siteCheck })
  assert.deepEqual(undone, [])
  assert.equal(final.undone, 0)
  assert.deepEqual(
    final.unblamed.map((f) => [f.group, f.page, f.slot]),
    [['read-back', '/', null]]
  )
  assert.equal(final.report.slots[0].ordered, 'Clean words')
})

test('a blamed repair is undone under a new record, and what the check after the undo still gains is logged', async () => {
  const undone = []
  const kept = [keptRepair('block-2.1', undone)]
  const { siteCheck, measured } = checks(
    red([{ page: '/', slot: 'block-2.1' }]),
    red([{ page: '/', slot: 'block-2.1' }])
  )
  const final = await finalCheck(runOf(), { report, kept, firstCheck: green, siteCheck })
  assert.deepEqual(undone, ['block-2.1'])
  assert.equal(final.undone, 1)
  assert.equal(kept[0].record.outcome, 'kept', 'the kept record is never changed')
  const replaced = final.replaced.get(kept[0].record)
  assert.equal(replaced.outcome, 'undone')
  assert.match(replaced.reason, /final site check gained a blocking failure here \(read-back on block-2\.1\)/)
  assert.equal(measured.length, 2)
  assert.equal(
    measured[1].slots[0].ordered,
    'Raw words',
    'the second check measures the site without the repair'
  )
  assert.deepEqual(
    final.leftAfterUndo.map((f) => [f.group, f.slot]),
    [['read-back', 'block-2.1']]
  )
})

test('a final site check that does not end by the run’s deadline gives no check, and says why', async () => {
  const kept = [keptRepair('block-2.1', [])]
  let fire = null
  const timer = (done) => {
    fire = done
    return () => {}
  }
  const final = await finalCheck(runOf({ timer }), {
    report,
    kept,
    firstCheck: green,
    siteCheck: () => {
      setImmediate(() => fire?.())
      return new Promise(() => {})
    }
  })
  assert.equal(final.check, null)
  assert.match(
    final.missing,
    /^the final site check did not end in time: the call did not answer within 480 s/
  )
  assert.equal(final.report.slots[0].ordered, 'Clean words', 'the kept repair is still in the report')
})
