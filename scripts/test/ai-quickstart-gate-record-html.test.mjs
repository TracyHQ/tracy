// The review page of the check record (ticket #586): an owner who does not read code sees the six measurements, each
// with a one line result in plain words, then what write safety found (page, block, field, probe, what happened),
// the broken links of each structure variant, the quality regressions, and the secrets by name only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { recordHtml } from '../ai-quickstart/gate/record-html.mjs'
import { measurementLines } from '../ai-quickstart/gate/record-html-measures.mjs'

// The two dashes no owner facing line may carry, by code point.
const DASHES = new RegExp('[\\u2013\\u2014]')
const record = (measurements) => ({
  verdict: { pass: false, failing: ['writeSafety'], notRun: [] },
  universe: {},
  markerTest: { groups: [], notSeen: [] },
  demoScan: { controls: {} },
  measurements
})
const MEASURED = {
  markerTest: { status: 'passed' },
  demoScan: { status: 'passed' },
  writeSafety: {
    status: 'failed',
    places: { written: 40, probed: 30, tested: 28 },
    passes: [{ pass: 1 }, { pass: 2 }],
    findings: [
      {
        kind: 'markup_injected',
        probe: 'double-quote',
        page: 'home',
        block: 'home-b3',
        storeBlock: 'hero-home',
        field: 'heading'
      },
      {
        kind: 'refused_by_build',
        probe: 'tag',
        page: 'about',
        block: 'about-b1',
        storeBlock: 'intro',
        field: 'text'
      }
    ]
  },
  structure: {
    status: 'failed',
    linkCheck: {
      status: 'failed',
      broken: [{ kind: 'missing_page', page: '/a', href: '/gone', target: 'classes' }]
    },
    minItems: { status: 'passed', broken: [] },
    hidden: {
      status: 'passed',
      recorded: [{ kind: 'missing_page', page: '/', href: '/b', hidden: ['team'] }]
    }
  },
  quality: {
    status: 'failed',
    regressions: [
      {
        group: 'text-overflow',
        page: '/a',
        width: 390,
        selector: '.card p',
        reason: 'Text runs past its box'
      }
    ],
    sameAsTemplate: [{ group: 'main-heading', page: '/b', reason: 'No main heading' }],
    seo: { status: 'failed', missing: [{ page: '/a', item: 'description' }] }
  },
  secrets: {
    status: 'passed',
    findings: [],
    control: { status: 'right', findings: 159 }
  }
}

test('each of the six measurements has one plain line that says what it found', () => {
  const lines = measurementLines(MEASURED)
  assert.deepEqual(
    lines.map((l) => l.name),
    ['The marker test', 'The demo scan', 'Write safety', 'Structure', 'Template quality', 'Secret scan']
  )
  const of = (name) => lines.find((l) => l.name === name).line
  assert.match(of('Write safety'), /28 of 30 places/)
  assert.match(of('Write safety'), /1 value/)
  assert.match(of('Structure'), /1 broken link/)
  assert.match(of('Template quality'), /1 problem the untouched template does not have/)
  assert.match(of('Template quality'), /1 missing search engine item/)
  assert.match(of('Secret scan'), /No secret/)
  for (const l of lines) assert.ok(!DASHES.test(l.line), 'no dash in ' + l.name)
  // A measurement not run says why in plain words.
  const notRun = measurementLines({ writeSafety: { status: 'not_run', reason: 'no_reset_hook' } })
  assert.match(notRun.find((l) => l.name === 'Write safety').line, /Not measured/)
  assert.match(notRun.find((l) => l.name === 'Write safety').line, /reset/)
})

test('the page lists the write safety findings, the broken links by variant, the regressions and the secrets by name', () => {
  const page = recordHtml(
    record({
      ...MEASURED,
      secrets: {
        status: 'failed',
        findings: [
          { file: 'kit/mapping.json', at: '/mail', rule: 'uri_credentials', fingerprint: 'abcdefabcdef' }
        ]
      }
    })
  )
  for (const text of ['home', 'hero-home', 'heading', 'double-quote', 'The page ran it as code'])
    assert.ok(page.includes(text), text)
  assert.ok(page.includes('The build refused it'), 'a build refusal is named, recorded only')
  assert.match(page, /All items[^<]*<\/h3>[\s\S]*\/gone/)
  assert.match(page, /Pages hidden after the build[\s\S]*team/)
  assert.ok(page.includes('.card p') && page.includes('390'))
  assert.ok(page.includes('description'))
  assert.ok(page.includes('kit/mapping.json') && page.includes('uri_credentials'))
  // Never a value: a finding has none, and the page prints only the names it was given.
  assert.doesNotMatch(page, /undefined|\[object Object\]/)
})
