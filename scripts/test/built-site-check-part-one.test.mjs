// The demo scan and the link check come from the Part 1 release gate (#585, #586) through a seam; the tool only
// shapes their findings, keeps held names out, and says not_run while Part 1 does not export them (ticket #601).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { foldHeld } from '../../packages/wo/website-opportunities/domain/held-text-match.mjs'
import { PART_ONE_MODULE, loadPartOne } from '../built-site-check/part-one.mjs'
import { DEMO_IMAGE, DEMO_SENTENCES, HELD_PERSON } from './fixtures/built-site-check/florist.mjs'
import { reportOf } from './fixtures/built-site-check/report-of.mjs'

/** A stand in for Part 1's scan: finds the fixture's declared demo sentences and picture, with a place. */
const demoScan = async ({ pages }) =>
  pages.flatMap((p) => [
    ...DEMO_SENTENCES.filter((s) => p.html.includes(s)).map((s) => ({
      kind: 'demo_text',
      page: p.path,
      place: { element: 'p' },
      excerpt: s
    })),
    ...(p.html.includes(DEMO_IMAGE)
      ? [{ kind: 'demo_image', page: p.path, place: { element: 'img' }, excerpt: DEMO_IMAGE }]
      : [])
  ])

test('a demo sentence and a demo picture found by the scan are reported with page and place', async () => {
  const report = await reportOf({ demoScan })
  assert.deepEqual(
    report.checks.demo.findings.map((f) => [f.kind, f.page, f.place.element, f.excerpt]),
    [
      ['demo_text', '/demo-classes', 'p', DEMO_SENTENCES[1]],
      ['demo_text', '/', 'p', DEMO_SENTENCES[0]],
      ['demo_image', '/', 'img', DEMO_IMAGE]
    ]
  )
})

test('near miss: a page with no demo text gives no finding, and an unknown kind is left out and counted', async () => {
  const report = await reportOf({
    files: { 'index.html': '<p>Fresh tulips every morning</p>' },
    demoScan: async (input) => [...(await demoScan(input)), { kind: 'something_else', page: '/' }]
  })
  assert.deepEqual(report.checks.demo.findings, [])
  assert.deepEqual(report.checks.demo.notes, ['1 finding(s) of an unknown kind left out'])
})

test('links to a missing page, a dead anchor and a demo page are reported, as a path only', async () => {
  let given
  const linkCheck = async (input) => {
    given = input
    return [
      { kind: 'missing_page', page: '/', place: { menu: true }, href: 'http://pages.invalid/gone?x=1' },
      { kind: 'anchor_missing', page: '/bouquets', place: { element: 'a' }, href: '#nowhere' },
      { kind: 'demo_page', page: '/', place: { menu: true }, href: '/demo-classes' }
    ]
  }
  const report = await reportOf({ linkCheck })
  assert.deepEqual(
    report.checks.links.findings.map((f) => [f.kind, f.page, f.href]),
    [
      ['missing_page', '/', '/gone'],
      ['anchor_missing', '/bouquets', '#nowhere'],
      ['demo_page', '/', '/demo-classes']
    ]
  )
  assert.deepEqual(given.expected.paths, ['/', '/bouquets', '/visit-us'])
  assert.equal(given.base, 'http://pages.invalid/')
  assert.ok(given.pages.every((p) => typeof p.html === 'string' && !('tree' in p)))
})

test('near miss: no broken link gives no finding', async () => {
  const report = await reportOf({ linkCheck: async () => [] })
  assert.equal(report.checks.links.status, 'ran')
  assert.deepEqual(report.checks.links.findings, [])
})

test('while Part 1 exports nothing, both checks say not_run with what is missing, never a pass', async () => {
  const report = await reportOf()
  assert.equal(report.checks.demo.status, 'not_run')
  assert.equal(
    report.checks.demo.reason,
    `part_one_export_missing: ${PART_ONE_MODULE} does not export demoScan (#585)`
  )
  assert.equal(report.checks.links.status, 'not_run')
  assert.match(report.checks.links.reason, /linkCheck \(#586\)$/)
  assert.deepEqual([report.counts.demo, report.counts.links], [null, null])
  const real = await loadPartOne()
  assert.ok(real.demoScan === null || typeof real.demoScan === 'function')
})

test('a Part 1 function that throws is not_run with its code only', async () => {
  const report = await reportOf({
    demoScan: async () => {
      throw Object.assign(new Error(`saw ${HELD_PERSON}`), { code: 'render_failed' })
    }
  })
  assert.deepEqual(
    [report.checks.demo.status, report.checks.demo.reason],
    ['not_run', 'part_one_failed: render_failed']
  )
})

test('a held name never reaches the report, in any form, wherever a check quotes it', async () => {
  const leaky = async ({ pages }) =>
    pages
      .filter((p) => p.html.includes(HELD_PERSON))
      .map((p) => ({
        kind: 'demo_text',
        page: p.path,
        place: { element: 'p' },
        excerpt: 'arranged by ODALYS  brenwick'
      }))
  const files = {
    'index.html': `<nav><a href="/">Home</a><a href="/odalys-brenwick">Odalys Brenwick</a></nav><p>${HELD_PERSON}</p>`
  }
  const report = await reportOf({ files, demoScan: leaky })
  const text = foldHeld(JSON.stringify(report))
  assert.ok(!/odalys/.test(text) && !/brenwick/.test(text), text)
  assert.ok(report.checks.demo.findings[0].excerpt.includes('[held]'))
  assert.ok(report.checks.pages.findings.some((f) => f.kind === 'site_menu_item_not_in_plan'))
})

test('an excerpt is cut to 80 characters, so a long passage is never copied whole', async () => {
  const long = 'Demo words '.repeat(20)
  const report = await reportOf({
    demoScan: async () => [{ kind: 'demo_text', page: '/', place: null, excerpt: long }]
  })
  const { excerpt } = report.checks.demo.findings[0]
  assert.equal([...excerpt].length, 80)
  assert.ok(excerpt.endsWith('...'))
})
