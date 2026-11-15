// Every sentence of the review page is true for the state it describes (ticket #586, finding M4): a measurement that
// passed, failed, did not finish or did not run, and a write that stopped, each get a line that says only what was
// measured. A structure that did not finish never says every page answers; build refusals are never counted as values
// tested on the site. Invented values only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (key, m) => measurementLines({ [key]: m }).find((l) => l.key === key).line
const ALL_FINE = 'every page answers and no link is broken'

test('passed: write safety, structure, quality and secrets say what was measured', () => {
  const ws = lineOf('writeSafety', {
    status: 'passed',
    places: { written: 40, probed: 30, tested: 30 },
    passes: [{ pass: 1 }],
    findings: [],
    coverage: { notProbed: { picture: 6, email: 4 } }
  })
  assert.match(ws, /^Passed: /)
  assert.match(ws, /30 of 30 places given a probe had at least one probe reach the site/)
  assert.match(ws, /10 written places not probed/)
  assert.match(ws, /nothing a customer could type broke a page/)
  const st = lineOf('structure', {
    status: 'passed',
    linkCheck: { status: 'passed', broken: [], errors: [] },
    minItems: { status: 'passed', broken: [], errors: [] },
    hidden: { status: 'passed', broken: [] }
  })
  assert.match(st, /all items: every page answers and no link is broken/)
  assert.match(st, /fewest items: every page answers and no link is broken/)
  assert.match(st, /pages hidden: no link leads to a hidden page/)
  assert.match(lineOf('quality', { status: 'passed', regressions: [], seo: { blocking: [] } }), /^Passed: /)
})

test('failed: only the variant and the values that failed are named as such', () => {
  const st = lineOf('structure', {
    status: 'failed',
    linkCheck: { status: 'passed', broken: [], errors: [] },
    minItems: { status: 'failed', broken: [{ page: '/a', href: '/gone' }], errors: [] },
    hidden: { status: 'failed', broken: [{ page: '/', href: '/b' }] }
  })
  assert.match(st, /fewest items: 1 broken link and 0 page errors/)
  assert.match(st, /pages hidden: 1 link leads to a hidden page/)
  assert.match(st, /all items: every page answers/)
  const ws = lineOf('writeSafety', {
    status: 'failed',
    places: { written: 40, probed: 30, tested: 28 },
    passes: [{ pass: 1 }, { pass: 2 }],
    findings: [
      { kind: 'markup_injected', probe: 'double-quote' },
      { kind: 'refused_by_build', probe: 'tag' }
    ]
  })
  assert.match(ws, /1 value a customer could type broke a page or the site refused it/)
  assert.match(ws, /1 value the build refused, recorded and not tested on the site/)
  assert.doesNotMatch(ws, /nothing a customer could type/)
  const sec = lineOf('secrets', {
    status: 'failed',
    findings: [],
    reason: 'unused_allow',
    message: 'allow entries that match nothing: kit/a.json jwt abcdefabcdef'
  })
  assert.match(sec, /allow entr/)
  assert.doesNotMatch(sec, /No secret/)
  const q = lineOf('quality', {
    status: 'failed',
    regressions: [],
    sameAsTemplate: [],
    seo: { missing: [{ item: 'title' }, { item: 'title' }], blocking: [{ item: 'title' }] }
  })
  assert.match(q, /1 missing search engine item/)
})

test('incomplete: the line says what did not finish, never that everything answered', () => {
  const st = lineOf('structure', {
    status: 'incomplete',
    linkCheck: { status: 'incomplete', reason: 'write_stopped', broken: [], errors: [] },
    minItems: { status: 'passed', broken: [], errors: [] },
    hidden: { status: 'incomplete', reason: 'full_not_written' }
  })
  assert.match(st, /^Not finished: /)
  assert.match(st, /all items: not finished, the build did not finish writing the site/)
  assert.doesNotMatch(st, new RegExp('all items: ' + ALL_FINE))
  const ws = lineOf('writeSafety', {
    status: 'incomplete',
    incomplete: 'not_site_tested',
    places: { written: 40, probed: 30, tested: 12 },
    passes: [{ pass: 1 }],
    findings: [{ kind: 'refused_by_build', probe: 'tag' }]
  })
  assert.match(ws, /^Not finished: /)
  assert.match(ws, /12 of 30 places given a probe had at least one probe reach the site/)
  assert.doesNotMatch(ws, /nothing a customer could type/)
})

test('not run: the line says why it did not run and nothing else', () => {
  for (const key of ['writeSafety', 'structure', 'quality', 'secrets']) {
    const line = lineOf(key, { status: 'not_run', reason: 'no_reset_hook' })
    assert.match(line, /^Not measured: /, key)
    assert.doesNotMatch(line, /every page|nothing a customer|No secret/, key)
  }
})

test('a write that stopped: write safety and structure each say the write stopped', () => {
  const ws = lineOf('writeSafety', {
    status: 'incomplete',
    reason: 'plain_write_stopped',
    places: { written: 40, probed: 30, tested: 0 },
    findings: []
  })
  assert.match(ws, /the plain marker build did not finish writing the site/)
  assert.match(ws, /0 of 30 places given a probe had at least one probe reach the site/)
  const st = lineOf('structure', {
    status: 'incomplete',
    linkCheck: { status: 'incomplete', reason: 'write_stopped' },
    minItems: { status: 'incomplete', reason: 'write_stopped' },
    hidden: { status: 'incomplete', reason: 'full_not_written' }
  })
  assert.doesNotMatch(st, new RegExp(ALL_FINE))
  assert.match(st, /fewest items: not finished, the build did not finish writing the site/)
})
