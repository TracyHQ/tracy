// The finisher's rounds and limits (#424, spec #418), driven through the step 9 bench's `finish` with a fake clock: a hard
// limit of time or cost stops new work at once and the run still ends with its final check and its log; a third round never
// starts; round two goes back only to pages with an undone repair; a kept repair the final site check blames for a new
// blocking failure is undone; the bench prints the time, cost and each stage's time. Fakes only, no real wait.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'
import { CLEAN, finding, RAW } from './_write-step-finisher.mjs'
import {
  cleanUp,
  everyRepairChecker,
  fakeClock,
  finishOn,
  scriptedDoor,
  slowDoor
} from './_write-step-finish-run.mjs'

after(cleanUp)

const fix = (over = {}) => ({ kind: 'fix-text', slot: 'block-2.1', text: CLEAN, ...over })
const twoFaults = () => ({
  faults: [
    ...finding().faults,
    ...finding('raw-markup', { slot: 'block-3.2', seen: 'prints ((span))' }).faults
  ]
})

test('a time overrun stops the finisher at once: no fixer is asked, faults are logged unrepaired, the run still ends', async () => {
  const clock = fakeClock()
  const fixer = scriptedDoor('Finisher fixer', [])
  const run = await finishOn({
    // Looking at the two pages side by side takes 7 minutes, past the 6 minutes new work may start in (8 minutes hard,
    // 2 kept for the final site check).
    finder: slowDoor(scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]), {
      clock,
      ms: 3.5 * 60_000
    }),
    fixer,
    checker: everyRepairChecker(),
    clock
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 0)
  assert.deepEqual(run.site.writes, [])
  const left = run.log.records.filter((r) => r.outcome === 'unrepaired')
  assert.equal(left.length, 2)
  for (const r of left)
    assert.match(
      r.reason,
      /^budget: the time limit for repairs of 360 s was reached \(480 s hard, 120 s kept/
    )
  assert.match(run.log.stoppedBy, /time limit for repairs/)
  assert.ok(run.log.finalCheck, 'the final site check still ran')
  assert.ok(existsSync(path.join(run.dir, 'site-check.json')))
  assert.ok(run.out.some((l) => l.startsWith('stopped: the time limit for repairs')))
})

test('a cost overrun stops the finisher at once, even mid page: no write starts once the limit is reached', async () => {
  const fixer = slowDoor(
    scriptedDoor('Finisher fixer', [fix(), fix({ slot: 'block-3.2', text: 'Showers and lockers' })]),
    {
      usd: 0.8
    }
  )
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]),
    fixer,
    checker: everyRepairChecker()
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  // Two fixer calls of 0.8 USD each pass the hard limit of 1.5 USD before anything is written.
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.log.counts.unrepaired, 2)
  assert.match(run.log.stoppedBy, /hard cost limit of 1.5 USD/)
  assert.ok(run.log.costUsd >= 1.5)
})

test('a model call still open when new work stops is let go, counted at its estimated cost, and its fault is logged unrepaired', async () => {
  // The fixer never answers; the hard limit's timer fires once the fixer has been asked.
  const fixer = scriptedDoor('Finisher fixer', [])
  let fire = null
  fixer.door.ask = (message) => {
    fixer.asked.push(message)
    setImmediate(() => fire?.())
    return new Promise(() => {})
  }
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer,
    checker: everyRepairChecker(),
    timer: (done) => {
      fire = done
      return () => {
        fire = null
      }
    }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(fixer.asked.length, 1)
  assert.deepEqual(run.site.writes, [])
  const [record] = run.log.records
  assert.equal(record.outcome, 'unrepaired')
  assert.match(
    record.reason,
    /^budget: the time limit for repairs of 360 s was reached .* while the call was open/
  )
  // Two finder calls at 0.01 USD, and the fixer call let go at its stage's estimate (0.02 USD): never counted as free.
  assert.equal(run.log.costUsd.toFixed(4), '0.0400')
  assert.ok(run.log.finalCheck, 'the final site check still ran')
})

test('a third round never starts, and round two does not write an order undone in round one again', async () => {
  const finder = scriptedDoor('Finisher finder', [finding(), { faults: [] }])
  const fixer = scriptedDoor('Finisher fixer', [
    fix(),
    fix(),
    fix({ text: 'Strength coaching  for every level' })
  ])
  const run = await finishOn({ finder, fixer, checker: everyRepairChecker('not better', 'still wrong') })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.log.rounds, 2)
  assert.equal(finder.asked.length, 2, 'each page once: round two never asks the finder again')
  // Round two retries the undone repair: the order tried before is named to the fixer, and given again it is dropped.
  assert.match(fixer.asked[1].content[0].text, /"tried"/)
  assert.equal(fixer.asked.length, 2)
  assert.equal(run.site.writes.length, 1, 'the same order is never written twice')
  const outcomes = run.log.records.filter((r) => r.slot === 'block-2.1').map((r) => r.outcome)
  assert.deepEqual(outcomes, ['undone', 'dropped'])
  assert.equal(run.site.held['module-2.1'], RAW)
})

test('round two retries only the repair the checker rejected: no page is shot again whole and the finder is not asked again', async () => {
  const about = finding('raw-markup', { page: '/about', slot: 'block-4.1', seen: 'prints ((span))' })
  const checker = {
    asked: [],
    door: {
      ...everyRepairChecker().door,
      // Better on the home page, not better on the about page.
      async ask(message) {
        const home = message.content.some((c) => c.type === 'text' && c.text.includes('heading prints'))
        const repair = Number(/^Repair (\d+)\./.exec(message.content[0].text)[1])
        const verdict = home ? 'better' : 'not better'
        return { text: JSON.stringify({ verdicts: [{ repair, verdict, reason: 'x' }] }), costUsd: 0.01 }
      }
    }
  }
  const finder = scriptedDoor('Finisher finder', [finding(), about])
  const fixer = scriptedDoor('Finisher fixer', [
    fix(),
    fix({ slot: 'block-4.1', text: 'Our story began in a garage' }),
    fix({ slot: 'block-4.1', text: 'Our story began in a small garage' })
  ])
  const run = await finishOn({ finder, fixer, checker, limits: { rounds: 2 } })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(finder.asked.length, 2)
  const whole = run.shots.layoutsAsked.filter((layouts) => layouts.every((l) => !l.bands))
  assert.equal(whole.length, 1, 'the pages are shot whole once; a re-shoot asks only for the repaired bands')
  // Only the about page's rejected repair is tried again, with the order tried before named to the fixer.
  assert.equal(fixer.asked.length, 3)
  assert.match(fixer.asked[2].content[0].text, /"slot":"block-4\.1".*"tried"/)
  assert.equal(run.site.held['module-2.1'], CLEAN)
})

test('a kept repair the final site check blames for a new blocking failure is undone, and the check runs again', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [fix()]),
    checker: everyRepairChecker(),
    // The site writes something else than ordered on the repaired slot: read-back goes red there.
    sideEffect: { key: 'module-2.1', value: 'Closed' },
    first: { groups: [{ name: 'read-back', status: 'green', checked: 4, failures: [] }] }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.outcome, 'undone')
  assert.match(record.reason, /final site check gained a blocking failure here \(read-back on block-2\.1\)/)
  assert.deepEqual(run.site.reverts, [record.applyId])
  assert.equal(run.log.undoneByFinalCheck, 1)
  assert.deepEqual(run.log.finalCheck.newBlocking, [], 'the check that ran again has no new blocking failure')
  assert.equal(run.runs.rows[0].report.siteCheck.groups.find((g) => g.name === 'read-back').status, 'green')
})

test('with no fault the finisher writes nothing, and the bench prints its time, cost and every stage', async () => {
  const clock = fakeClock()
  const run = await finishOn({
    finder: slowDoor(scriptedDoor('Finisher finder', [{ faults: [] }, { faults: [] }]), { clock, ms: 1500 }),
    fixer: scriptedDoor('Finisher fixer', []),
    checker: everyRepairChecker(),
    clock,
    // One page at a time, so the fake clock adds each finder call once.
    limits: { pages: 1 }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.deepEqual(run.site.writes, [])
  assert.deepEqual(run.site.reverts, [])
  assert.equal(run.log.ms, 3000)
  assert.equal(run.log.timings.find, 3000)
  assert.deepEqual(Object.keys(run.log.timings), ['find', 'fix', 'write', 'shoot', 'judge', 'finalCheck'])
  assert.ok(
    run.out.some((l) =>
      /^repair log: repair-log\.json, 3\.0 s \(target 300\.0 s, hard 480\.0 s\), 0\.0200 USD \(target 1, hard 1\.5\), 0 rounds$/.test(
        l
      )
    ),
    run.out.join('\n')
  )
  assert.ok(
    run.out.some((l) =>
      l.startsWith('stages: find 3.0 s, fix 0.0 s, write 0.0 s, shoot 0.0 s, judge 0.0 s, finalCheck 0.0 s')
    )
  )
})
