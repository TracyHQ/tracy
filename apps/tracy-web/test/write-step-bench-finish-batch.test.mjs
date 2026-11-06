// The finisher repairs a page's faults together and pages side by side (#424, spec #418), driven through the step 9 bench's
// `finish`: every repair of a page is written, the page is shot again once (only the tiles of the repaired blocks) and
// judged in one checker call, each repair kept or undone on its own; a repair that never changes a word is judged by code on
// the served page. One seam, fakes only; only what comes out is asserted.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { CLEAN, finding, judged, RAW } from './_write-step-finisher.mjs'
import { cleanUp, everyRepairChecker, finishOn, scriptedDoor, slowDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

const SHOWERS_RAW = 'Showers ((span))and((/span)) lockers'
const twoFaults = () => ({
  faults: [
    ...finding().faults,
    ...finding('raw-markup', { slot: 'block-3.2', seen: 'a line prints ((span))' }).faults
  ]
})
const fixes = () => [
  { kind: 'fix-text', slot: 'block-2.1', text: CLEAN },
  { kind: 'fix-text', slot: 'block-3.2', text: 'Showers and lockers' }
]

test('two repairs of one page are written, the page is shot again once, and one checker call judges each on its own', async () => {
  const checker = scriptedDoor('Finisher checker', [
    {
      verdicts: [
        { repair: 1, verdict: 'better', reason: 'the heading reads as words' },
        { repair: 2, verdict: 'not better', reason: 'the line lost its accent' }
      ]
    }
  ])
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', fixes()),
    checker,
    limits: { rounds: 1 }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.writes.length, 2)
  assert.equal(checker.asked.length, 1, 'one checker call for the page')
  const told = checker.asked[0].content.filter((c) => c.type === 'text').map((c) => c.text)
  assert.ok(told.some((t) => t.startsWith('Repair 1.')) && told.some((t) => t.startsWith('Repair 2.')))
  assert.deepEqual(run.shots.calls, [['/', '/about'], ['/']], 'the first shot, then the repaired page once')
  assert.equal(run.site.held['module-2.1'], CLEAN, 'kept')
  assert.equal(run.site.held['module-3.2'], SHOWERS_RAW, 'undone')
  assert.deepEqual(run.site.reverts, [run.site.writes[1].applyId], 'undone by its own apply id only')
  const outcome = (slot) => run.log.records.find((r) => r.slot === slot && r.outcome !== 'unrepaired')
  assert.equal(outcome('block-2.1').outcome, 'kept')
  assert.equal(outcome('block-3.2').outcome, 'undone')
  assert.match(outcome('block-3.2').reason, /lost its accent/)
})

test('the re-shoot asks the host only for the bands of the repaired blocks, at each width', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', fixes()),
    checker: everyRepairChecker()
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [first, again] = run.shots.layoutsAsked
  assert.ok(
    first.every((l) => !l.bands),
    'the first shot is whole'
  )
  const { bands } = again[0]
  // The fake host draws block-2.1 at y 120 and block-3.2 at y 520, each 90 px high.
  for (const viewport of ['desktop', 'phone']) {
    assert.equal(bands[viewport].length, 2)
    assert.ok(bands[viewport][0].y <= 120 && bands[viewport][0].y + bands[viewport][0].height >= 210)
    assert.ok(bands[viewport][1].y <= 520 && bands[viewport][1].y + bands[viewport][1].height >= 610)
  }
})

/** The home page as served: the heading and the line as the site holds them, codes printed raw (the fault itself). */
const servedRaw = (held) => (page) =>
  page === '/'
    ? `<html><body><h2>${held['module-2.1']}</h2><p>${held['module-3.2']}</p></body></html>`
    : '<html></html>'

test('a text repair is judged by code on the served page: no checker call and no re-shoot', async () => {
  const checker = everyRepairChecker()
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [fixes()[0]]),
    checker,
    served: servedRaw
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(checker.asked.length, 0)
  assert.equal(run.shots.calls.length, 1, 'only the first shot')
  const [record] = run.log.records
  assert.equal(record.outcome, 'kept')
  assert.equal(record.checkedBy, 'code')
})

test('a text repair the served page still prints with markup is undone by code', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [finding(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', [fixes()[0], fixes()[0]]),
    checker: everyRepairChecker(),
    // A page cache that keeps serving the words as they were.
    served: () => () => `<html><body><h2>${RAW}</h2></body></html>`,
    limits: { rounds: 1 }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.outcome, 'undone')
  assert.match(record.reason, /still prints \(\(span\)\)/)
  assert.equal(run.site.held['module-2.1'], RAW)
})

const aboutFault = () =>
  finding('raw-markup', { page: '/about', slot: 'block-4.1', seen: 'a line prints ((span))' })

test('pages are repaired side by side, up to the limit of pages at once', async () => {
  for (const [pages, most] of [
    [4, 2],
    [1, 1]
  ]) {
    const fixer = slowDoor(
      scriptedDoor('Finisher fixer', [
        { kind: 'fix-text', slot: 'block-2.1', text: CLEAN },
        { kind: 'fix-text', slot: 'block-4.1', text: 'Our story began in a garage' }
      ])
    )
    const run = await finishOn({
      finder: scriptedDoor('Finisher finder', [finding(), aboutFault()]),
      fixer,
      checker: everyRepairChecker(),
      limits: { pages }
    })
    assert.equal(run.code, 0, run.err.join('\n'))
    assert.equal(fixer.inFlight.max, most, `${pages} pages at once`)
    assert.equal(run.log.counts.kept, 2)
    assert.equal(run.site.held['module-4.1'], 'Our story began in a garage')
  }
})

test('the checker answer of a page names each repair by its number; a repair it does not name is not better', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [twoFaults(), { faults: [] }]),
    fixer: scriptedDoor('Finisher fixer', fixes()),
    checker: scriptedDoor('Finisher checker', [judged('better', 'reads as words', 2)]),
    limits: { rounds: 1 }
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const bySlot = (slot) => run.log.records.find((r) => r.slot === slot)
  assert.equal(bySlot('block-3.2').outcome, 'kept')
  assert.equal(bySlot('block-2.1').outcome, 'undone')
  assert.match(bySlot('block-2.1').reason, /no verdict/)
})
