// The review page tells the truth about what review 6 of the release gate found it saying wrong (ticket #586), on
// invented records: a stop the bisection left untraced because no single value caused it says that, not that no step
// was left; a stop left untraced for want of steps says how many steps it used; a place "had every probe tried" is
// said as what the ledger holds, a result for every probe, and a probe no page judged is said apart.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines, measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (m) => measurementLines({ writeSafety: m }).find((l) => l.key === 'writeSafety').line
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const stop = (why) => ({
  kind: 'stop_not_traced',
  class: 'door_refused',
  code: 'redo_failed',
  op: 'contract:store:module-12',
  culprit: 'not_traced',
  suspects: 2,
  why,
  pass: 1
})
const record = (why, more = {}) => ({
  status: 'failed',
  incomplete: 'steps',
  steps: 20,
  places: { written: 4, probed: 3, tested: 2 },
  passes: [{ pass: 1 }],
  missing: [{ place: 'writer:home/b1/heading', probe: 'tag' }],
  findings: [stop(why)],
  ends: {
    tested: 2,
    refused: 0,
    untested: [
      { place: 'p', why: why === 'steps' ? 'suspect_of_untraced_stop' : 'suspect_of_unattributed_stop' }
    ]
  },
  ...more
})

test('review 6: a stop no single value causes is said so, not as a stop no step was left for', () => {
  const page = text(measurementsHtml({ writeSafety: record('unattributed', { incomplete: 'unattributed' }) }))
  assert.doesNotMatch(page, /no step was left/)
  assert.match(page, /no single value was found to cause it/)
  const line = lineOf(record('unattributed', { incomplete: 'unattributed' }))
  assert.doesNotMatch(line, /no step was left/)
  assert.match(line, /the measurement then stopped: a stop or a broken page needs several values together/)
})

test('review 6: a stop left for want of steps says so, with the steps used', () => {
  const page = text(measurementsHtml({ writeSafety: record('steps') }))
  assert.match(page, /no step was left to name the field/)
  assert.match(lineOf(record('steps')), /it ran out of site steps \(20 used\)/)
})

test('review 6: pairs never tried are counted, and an unjudged probe has its own reason', () => {
  const line = lineOf(record('steps'))
  assert.doesNotMatch(line, /had a result for every probe/)
  assert.match(line, /1 \(place, probe\) pair never tried, at 1 place/)
  assert.doesNotMatch(line, /every probe that applies tried/)
  const cut = lineOf({
    ...record('steps'),
    findings: [],
    status: 'incomplete',
    incomplete: 'probe_not_judged',
    ends: { tested: 1, refused: 0, untested: [{ place: 'q', why: 'judged_by_no_page' }] }
  })
  assert.match(cut, /every page printed their value only cut short/)
  assert.match(cut, /no page showed whether it ran/)
})
