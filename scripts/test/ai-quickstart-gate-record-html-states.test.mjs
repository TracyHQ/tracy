// The review page says only what was measured (ticket #586, review round 2): the eight lines a reviewer found false or
// misleading on a real run's page, each in the state it was read in. A part that did not finish is never listed as
// failing; a half-written site says so in the first lines; the probe counts agree with the coverage table, which adds
// up; a table of what went wrong tells "not measured" from "measured, nothing found"; quality on a half-written site
// is not counted; system pages the template titles the same way are not counted missing. Invented values only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'
import { recordHtml } from '../ai-quickstart/gate/record-html.mjs'

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
const COVERAGE = {
  universeWritten: 641,
  locations: 667,
  inBoth: 600,
  onlyInUniverse: 41,
  onlyInPlan: { no_marker: 50, not_in_universe: 17 },
  probed: 317,
  notProbed: { no_marker: 300, picture: 50 },
  why: { no_marker: 'a fixed value', picture: 'a picture', not_in_universe: 'not counted' },
  places: { couldTakeProbe: 320, probedInPass: 320, tested: 0, notProbedInPass: {} }
}
const stopped = {
  status: 'incomplete',
  reason: 'write_stopped',
  write: { status: 'stopped', code: 'door_not_available' }
}
const record = (measurements, extra = {}) => ({
  kit: 'example-petal/j6@1.0.0',
  template: { slug: 'example-petal', version: '1.0.0' },
  write: { site: { status: 'stopped', code: 'door_not_available' } },
  verdict: {
    pass: false,
    leaks: 630,
    demoFindings: 0,
    unexplained: 0,
    write: 'stopped',
    controls: 'right',
    failing: ['write', 'leaks', 'writeSafety', 'structure', 'quality'],
    notRun: []
  },
  measurements,
  markerTest: { groups: [], notSeen: [] },
  universe: {},
  ...extra
})
const M = {
  writeSafety: {
    status: 'incomplete',
    reason: 'plain_write_stopped',
    places: { probed: 320, tested: 0 },
    findings: [],
    coverage: COVERAGE
  },
  structure: {
    status: 'incomplete',
    linkCheck: { ...stopped },
    minItems: { status: 'not_run', reason: 'no_reset_hook' },
    hidden: { status: 'incomplete', reason: 'full_not_written' }
  },
  quality: {
    ...stopped,
    measuredStatus: 'failed',
    regressions: [{ group: 'main-heading', page: '/x', reason: 'two' }],
    seo: { blocking: [] }
  }
}

test('1: a part that did not finish is not listed as failing, and structure names the hidden pages', () => {
  const page = text(recordHtml(record(M)))
  const failing = /Failing parts: ([^.]*)\./.exec(page)?.[1] ?? ''
  assert.doesNotMatch(failing, /write safety|structure|template quality/)
  assert.match(
    page,
    /Not finished: [^.]*write safety[^.]*structure \(the link check, the fewest items and the hidden pages\)/
  )
})

test('2: leaks and values not seen on a write that stopped say so in the first lines, naming the code', () => {
  const page = text(recordHtml(record(M)))
  const head = page.slice(0, page.indexOf('The measurements'))
  assert.match(head, /The write on the site stopped \(door_not_available\)/)
  assert.match(head, /leaks and the written values not seen come from a half-written site/)
})

test('3 and 8: the probe counts agree with the coverage table, and the table adds up', () => {
  const page = text(measurementsHtml(M))
  assert.match(page, /values reached the site at 0 of 320 places given a probe/)
  assert.match(
    page,
    /641 places the universe counts written = 600 also in the plain build \+ 41 only in the universe/
  )
  assert.match(page, /667 locations the plain build writes = 600 in both \+ 67 only in the plain build/)
  assert.match(page, /667 = 317 could take a probe \+ 350 not probed/)
  assert.match(page, /320 places could take a probe: 320 given one in a pass, 0 reached the site/)
})

test('4 and 5: a table of what went wrong says not measured when nothing ran, nothing found when nothing was', () => {
  const page = text(measurementsHtml(M))
  assert.match(
    page,
    /Write safety: what a customer could type Not measured: the plain marker build did not finish/
  )
  assert.match(page, /All items Not measured: the build did not finish writing the site/)
  assert.match(page, /Fewest items Not measured: the run had no reset command/)
  assert.match(
    page,
    /Pages hidden after the build[^)]*\) Not measured: the build did not finish writing the site/
  )
  assert.doesNotMatch(page, /None\./)
  const fine = text(
    measurementsHtml({
      writeSafety: { status: 'passed', places: { probed: 3, tested: 3 }, findings: [] },
      structure: {
        status: 'passed',
        linkCheck: { status: 'passed', broken: [] },
        minItems: { status: 'passed', broken: [] },
        hidden: { status: 'passed', broken: [] }
      }
    })
  )
  assert.match(
    fine,
    /Write safety: what a customer could type Measured: no value a customer could type broke a page/
  )
  assert.match(fine, /All items Measured: no broken link/)
})

test('6: quality on a half-written site is not counted against the template', () => {
  const page = text(measurementsHtml(M))
  assert.match(
    page,
    /Template quality Not counted: the build did not finish writing the site \(door_not_available\)/
  )
  assert.doesNotMatch(page, /1 problem the untouched template does not have/)
})

test('7: system pages titled as the untouched template titles them are not counted missing', () => {
  const page = text(
    measurementsHtml({
      quality: {
        status: 'passed',
        regressions: [],
        seo: {
          status: 'passed',
          blocking: [],
          same: [{ page: '/index.php?option=com_users&view=login', item: 'title' }]
        },
        sameAsTemplate: []
      }
    })
  )
  assert.match(page, /0 missing search engine items/)
  assert.match(page, /1 search engine item the untouched template is missing too \(its own system pages\)/)
})
