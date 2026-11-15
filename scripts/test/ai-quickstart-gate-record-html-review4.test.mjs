// The review page tells the truth about what run 4 of JA Boxing showed it saying wrong (ticket #586, review 4), on
// invented records: a write safety that failed and then ran out of site steps says both, with the stop it left
// untraced and the places it left untested; each finding names its item and where it was stored (X7).
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines, measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (key, m) => measurementLines({ [key]: m }).find((l) => l.key === key).line
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const FAILED_SHORT = {
  status: 'failed',
  incomplete: 'steps',
  places: { written: 40, probed: 30, tested: 0 },
  passes: [{ pass: 1 }],
  findings: [
    {
      kind: 'door_refused',
      probe: 'other-scripts',
      place: 'service-6.name',
      page: 'home',
      block: 'home-b6',
      storeBlock: 'block-160',
      field: 'name',
      item: '2',
      location: { op: 'article:service-6', column: 'title', slot: 'article-14.4' },
      evidence: 'named_alone',
      pass: 1
    },
    {
      kind: 'stop_not_traced',
      class: 'door_refused',
      code: 'read_back_mismatch',
      op: 'article:post-8',
      culprit: 'not_traced',
      suspects: 12,
      why: 'steps',
      pass: 1
    }
  ],
  ends: {
    tested: 0,
    refused: 1,
    untested: [
      ...Array.from({ length: 12 }, (_, i) => ({ place: 's' + i, why: 'suspect_of_untraced_stop' })),
      ...Array.from({ length: 17 }, (_, i) => ({ place: 'p' + i, why: 'no_pass_reached_it' }))
    ]
  }
}

test('X4: a failed write safety that ran out of steps says so, with its untraced stop as a floor', () => {
  const ws = lineOf('writeSafety', FAILED_SHORT)
  assert.match(ws, /^Failed: /)
  assert.match(
    ws,
    /at least 2 values a customer could type broke a page or the site refused it \(1 traced to a field, 1 stop left untraced\)/
  )
  assert.match(
    ws,
    /29 places untested \(12 set aside as suspects of a stop no step was left to trace, 17 no pass reached them\)/
  )
  assert.match(ws, /the measurement then stopped: it ran out of site steps/)
})

test('X7: a write safety finding names its item and where it was stored; an untraced stop names its operation', () => {
  const page = text(measurementsHtml({ writeSafety: FAILED_SHORT }))
  assert.match(page, /Item Stored at/)
  assert.match(
    page,
    /home block-160 name 2 article:service-6 article-14\.4 other-scripts The site refused it the only value stored where it stopped/
  )
  assert.match(
    page,
    /article:post-8 not traced \(12 suspects\) The write stopped here; no step was left to name the field \(The site refused it\)/
  )
})
