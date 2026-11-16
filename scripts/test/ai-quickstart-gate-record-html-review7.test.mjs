// The review page says what write safety found by kind (ticket #586, review 7 S6), on an invented record: a value the
// site refused, one a page ran as code and one the build threw in memory are never lumped as "broke a page or the site
// refused it", and every applicable (place, probe) pair is counted by the class it ended in, so a pair the build wrote
// otherwise is never counted as a result.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines, measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (m) => measurementLines({ writeSafety: m }).find((l) => l.key === 'writeSafety').line
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const rows = (status, count) =>
  Array.from({ length: count }, (_, i) => ({ place: status + i, probe: 'tag', status }))
const record = {
  status: 'failed',
  incomplete: 'passes',
  places: { written: 9, probed: 8, tested: 5 },
  passes: [{ pass: 1 }],
  missing: [{ place: 'writer:home/b1/heading', probe: 'tag' }],
  findings: [
    { kind: 'door_refused', probe: 'other-scripts', place: 'a', pass: 1 },
    { kind: 'door_refused', probe: 'loadposition', place: 'b', pass: 1 },
    { kind: 'markup_injected', probe: 'emailcloak', place: 'c', pass: 1, evidence: 'page', judgedOn: 'home' },
    { kind: 'unclassified', probe: 'empty', place: 'd', code: 'invented_code', pass: 1 },
    ...['e', 'f', 'g'].map((place) => ({ kind: 'refused_by_build', probe: 'tag', place, pass: 1 }))
  ],
  ledger: [
    ...rows('written', 5),
    ...rows('refused_by_build', 3),
    ...rows('door_refused', 2),
    ...rows('markup_injected', 1),
    ...rows('unclassified', 1),
    ...rows('normalized_by_build', 2),
    ...rows('not_written', 1)
  ],
  ends: { tested: 5, refused: 1, untested: [] }
}

test('S6: failures are said by kind, and a build throw is not a site stop', () => {
  const line = lineOf(record)
  assert.doesNotMatch(line, /broke a page or the site refused it/)
  assert.match(
    line,
    /3 values a customer could type failed: 2 the site refused or kept otherwise, 1 a page ran as code/
  )
  assert.match(
    line,
    /1 value the build threw in memory with a code the gate does not know, before any site saw it \(the measurement cannot pass\)/
  )
  const page = text(measurementsHtml({ writeSafety: record }))
  assert.doesNotMatch(page, /It stopped with a code the gate does not know/)
  assert.match(page, /The build threw a code the gate does not know, in memory/)
})

test('S6: every applicable pair is counted by the class it ended in', () => {
  const line = lineOf(record)
  assert.doesNotMatch(line, /had a result for every probe/)
  assert.match(
    line,
    /16 \(place, probe\) pairs apply: 5 tested on the site, 3 refused by the build, 2 normalized by the build, 1 the build wrote otherwise or dropped \(not tested\), 2 the site refused or kept otherwise, 1 a page ran as code, 1 the build threw with a code the gate does not know, 1 never tried/
  )
})
