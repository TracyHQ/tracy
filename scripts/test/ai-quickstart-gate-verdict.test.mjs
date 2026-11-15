// The verdict of the check record (ticket #585): passed only when the real write finished, every written marker is
// seen or carries a declared reason, no leak, no unexplained place, no demo in the browser's read nor in the raw HTML,
// every page answered as it should, the demo scan saw demo on the untouched human quickstart, the order had no problem
// and the measurements of the next ticket ran. The blank control is recorded, never judged. Invented values only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { declareNotSeen } from '../ai-quickstart/gate/not-seen.mjs'
import { checkRecord } from '../ai-quickstart/gate/record.mjs'
import { blankControlOf, verdictOf } from '../ai-quickstart/gate/verdict.mjs'

const clean = () => ({
  real: { status: 'done' },
  accounting: {
    counts: { universe: 3, written: 3, declared_not_written: 0, skipped_by_writer: 0, unexplained: 0 }
  },
  findings: [],
  notSeen: [],
  demo: { browser: [], html: [] },
  renders: [{ status: 200, expected: 200 }],
  controls: { human: { status: 'run', findings: 40, failed: 0 } },
  orderProblems: [],
  measurements: { minItems: { status: 'passed' }, linkCheck: { status: 'passed' } }
})

test('a clean run passes: the verdict can be true', () => {
  const v = verdictOf(clean())
  assert.equal(v.pass, true)
  assert.deepEqual(v.failing, [])
})

test('a write that stopped fails the verdict, even with nothing printed and nothing found', () => {
  const v = verdictOf({ ...clean(), real: { status: 'stopped', code: 'write_failed' } })
  assert.equal(v.pass, false)
  assert.equal(v.write, 'stopped')
  assert.ok(v.failing.includes('write'))
  assert.equal(verdictOf({ ...clean(), real: null }).pass, false)
})

test('a written marker no page shows fails unless the kit or the write gives a declared reason', () => {
  const unexplained = verdictOf({ ...clean(), notSeen: [{ code: 'QxAAB', reason: 'block_not_printed' }] })
  assert.equal(unexplained.pass, false)
  assert.equal(unexplained.notSeenUnexplained, 1)
  const declared = verdictOf({
    ...clean(),
    notSeen: [{ code: 'QxAAB', reason: 'block_not_printed', declared: 'write_conflict' }]
  })
  assert.equal(declared.pass, true)
})

test('demo found only in the raw HTML (a noscript picture, a data-src) fails the verdict', () => {
  const v = verdictOf({ ...clean(), demo: { browser: [], html: [{ kind: 'demo_image' }] } })
  assert.equal(v.pass, false)
  assert.equal(v.demoFindings, 1)
})

test('the demo scan blind on the human quickstart fails; the blank control is no part of the verdict', () => {
  const blind = verdictOf({ ...clean(), controls: { human: { status: 'run', findings: 0, failed: 0 } } })
  assert.equal(blind.controls, 'scan_blind')
  assert.equal(blind.pass, false)
  assert.equal(verdictOf({ ...clean(), controls: {} }).controls, 'not_run')
  const blank = blankControlOf([
    { path: 'index.php', status: 404, expected: 200, observations: [] },
    { path: 'index.php?option=com_users&view=login', status: 500, expected: 200, observations: [] }
  ])
  assert.equal(blank.status, 'not_applicable')
  assert.match(blank.reason, /serves no page/)
  assert.deepEqual(
    blank.statuses.map((s) => s.status),
    [404, 500]
  )
  assert.equal(verdictOf({ ...clean(), controls: { ...clean().controls, blank } }).pass, true)
})

test('an unexplained place, a leak, a failed page, an order problem or a measurement not run each fail it', () => {
  const c = clean()
  const cases = {
    accounting: { accounting: { counts: { ...c.accounting.counts, unexplained: 1 } } },
    leaks: { findings: [{ group: 'unmarked_text' }] },
    renders: { renders: [{ status: 500, expected: 200 }] },
    order: { orderProblems: [{ code: 'x' }] },
    observation: { observationProblems: [{ value: 'structured data that does not parse' }] },
    pending: { measurements: {} }
  }
  for (const [name, change] of Object.entries(cases))
    assert.equal(verdictOf({ ...c, ...change }).pass, false, name)
  // A request to another host alone is a note, not a leak.
  assert.equal(verdictOf({ ...c, findings: [{ group: 'outside_request' }] }).pass, true)
})

test('the record carries the verdict, the order problems and the blank control as not applicable', () => {
  const record = checkRecord({
    kit: { ref: 'petal/j6@1.0.0', mapping: { template: { slug: 'petal' } } },
    origin: 'http://florist.example',
    built: { gaps: [], written: { report: { status: 'done' } }, writePlan: { ops: [] }, orderProblems: [] },
    accounting: { counts: clean().accounting.counts, places: [] },
    real: { status: 'stopped', code: 'write_failed', message: 'refused' },
    renders: [],
    pages: [],
    classified: { findings: [], exempt: [], seen: new Set(), notSeen: [] },
    groups: [],
    demo: { browser: [], html: [], checks: {} },
    controls: { human: { status: 'run', findings: 4, failed: 0 }, blank: blankControlOf([]) },
    widths: [1440],
    themes: ['light'],
    plugin: null,
    refusals: [],
    startedAt: '2026-01-01T00:00:00.000Z'
  })
  assert.equal(record.verdict.pass, false)
  assert.equal(record.verdict.write, 'stopped')
  assert.deepEqual(record.write.orderProblems, [])
  assert.equal(record.demoScan.controls.blank.status, 'not_applicable')
})

test('a written value no page shows is declared by a write conflict, a write flag on its block, or the kit', () => {
  const notSeen = [
    {
      code: 'QxAAA',
      entry: 'home.home-b1.heading',
      reason: 'value_not_printed',
      loc: { slot: 'module-1.0' }
    },
    {
      code: 'QxAAB',
      entry: 'class.class-b5.heading',
      reason: 'block_not_printed',
      loc: { slot: 'module-2.0' }
    },
    { code: 'QxAAC', entry: 'home.home-b3.label', reason: 'value_not_printed', loc: { slot: 'module-3.4' } },
    { code: 'QxAAD', entry: 'home.home-b4.heading', reason: 'block_not_printed', loc: { slot: 'module-4.0' } }
  ]
  const mapping = {
    blocks: {
      social: {
        fields: {
          label: {
            slot: 'module-3.4',
            entity: 'module-3',
            prints: false,
            why: 'the helper reads another key'
          }
        }
      }
    }
  }
  const out = declareNotSeen(notSeen, {
    conflicts: ['home.home-b1.heading'],
    unproven: [{ code: 'detail_position_not_printed', page: 'class', block: 'class-b5' }],
    mapping
  })
  assert.deepEqual(
    out.map((n) => n.declared),
    [
      'write_conflict',
      'detail_position_not_printed',
      'kit_declares_not_printed: the helper reads another key',
      null
    ]
  )
})
