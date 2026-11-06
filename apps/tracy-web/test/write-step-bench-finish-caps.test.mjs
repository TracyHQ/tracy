// The finisher's hard caps and half-done work (#424 review, spec #418), driven through the step 9 bench's `finish` with
// fakes: a model call reserves its estimated cost before it starts, a site call that never answers is let go, a page whose
// judging throws has every repair it wrote undone and logged, and a slot two pages share is repaired once.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'
import { CLEAN, finding, RAW } from './_write-step-finisher.mjs'
import { cleanUp, everyRepairChecker, finishOn, scriptedDoor, slowDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

const fix = (over = {}) => ({ kind: 'fix-text', slot: 'block-2.1', text: CLEAN, ...over })
const twoFaults = () => ({
  faults: [
    ...finding().faults,
    ...finding('raw-markup', { slot: 'block-3.2', seen: 'prints ((span))' }).faults
  ]
})

test('a model call whose estimated cost does not fit in what is left of the hard cost limit is never started', async () => {
  const fixer = scriptedDoor('Finisher fixer', [
    fix(),
    fix({ slot: 'block-3.2', text: 'Showers and lockers' })
  ])
  const run = await finishOn({
    // Looking at the two pages costs 0.9 USD; a fixer call is estimated at 0.35 USD, so one fits and a second does not.
    finder: slowDoor(scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]), { usd: 0.45 }),
    fixer,
    checker: everyRepairChecker(),
    limits: { callUsd: { fix: 0.35 } }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 1)
  assert.equal(run.site.writes.length, 1)
  const left = run.log.records.find((r) => r.outcome === 'unrepaired')
  assert.match(
    left.reason,
    /^budget: fix call estimated at 0\.35 USD does not fit .* hard cost limit of 1\.5 USD/
  )
  assert.ok(run.log.costUsd <= 1.5, `${run.log.costUsd}`)
})

test('a site write that never answers is let go at its own time limit, and the repair is logged, never left unsaid', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [fix()]),
    checker: everyRepairChecker(),
    limits: { siteCallMs: 50 },
    // Only the site calls are bounded by 50 ms: those timers fire at once, every longer one never does.
    timer: (fire, ms) => {
      if (ms <= 50) setImmediate(fire)
      return () => {}
    },
    wrapDoor: (door) => ({
      apply: (call) => (call.params?.operation === 'apply' ? new Promise(() => {}) : door.apply(call))
    })
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.outcome, 'failed')
  assert.match(record.reason, /did not answer within 0\.05 s/)
  assert.ok(run.log.finalCheck.status, 'the final site check still ran')
})

test('a page whose judging throws has every repair it wrote undone and logged as not proven', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [fix()]),
    checker: everyRepairChecker(),
    // A file where the crops folder goes: keeping the first crop throws while the page is judged.
    prepare: (dir) => writeFileSync(path.join(dir, 'crops'), '')
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.outcome, 'undone')
  assert.match(record.reason, /could not be judged .* so it is not proven/)
  assert.deepEqual(run.site.reverts, [record.applyId])
  assert.equal(run.site.held['module-2.1'], RAW)
})

test('a slot two pages show is repaired once: the second page finds it held by the first page’s repair', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), finding('raw-markup', { page: '/about' })]),
    fixer: scriptedDoor('Finisher fixer', [fix(), fix()]),
    checker: everyRepairChecker(),
    shared: true
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.writes.length, 1)
  const outcomes = run.log.records.filter((r) => r.slot === 'block-2.1').map((r) => r.outcome)
  assert.deepEqual(outcomes.sort(), ['dropped', 'kept'])
  const dropped = run.log.records.find((r) => r.outcome === 'dropped')
  assert.match(dropped.reason, /holds slot block-2\.1 already|changed after its order was checked/)
  assert.equal(run.site.held['module-2.1'], CLEAN)
})
