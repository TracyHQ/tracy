// Design typed fields that were written, and text fields over their declared limit (ticket #601).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { designPlacesOf } from '../built-site-check/check-design.mjs'
import { kit, pages, writeResult } from './fixtures/built-site-check/florist.mjs'
import { kindsOf, reportOf } from './fixtures/built-site-check/report-of.mjs'

const heading = {
  loc: { slot: 'module-10.0', entity: 'module-10', column: 'title' },
  entry: 'home.hero.heading',
  value: 'Fresh tulips every morning'
}

test('design places: design typed fields, design lines and design element slots', () => {
  const places = designPlacesOf(kit())
  assert.deepEqual([...places.bySlot.keys()].sort(), ['module-10.3', 'module-10.4', 'module-12.9'])
  assert.equal(places.bySlot.get('module-10.3').field, 'design-overlay')
})

test('a value the write sent to a design field, a design line or a disallowed icon class is reported', async () => {
  const values = [
    heading,
    { loc: { slot: 'module-10.3', entity: 'module-10', column: 'params' }, entry: null, value: 'light-20' },
    { loc: { entity: 'module-10', column: 'params', jsonPath: ['gutter'] }, entry: null, value: '8' },
    {
      loc: { slot: 'module-13.0', entity: 'module-13', column: 'params' },
      value: 'fab fa-myspace',
      rule: 'icon_class'
    }
  ]
  const report = await reportOf({ write: writeResult({ values }) })
  const found = report.checks.design.findings
  assert.deepEqual(
    found.map((f) => [f.kind, f.place.slot]),
    [
      ['design_field_written', 'module-10.3'],
      ['design_field_written', 'module-10.4'],
      ['icon_class_not_allowed', 'module-13.0']
    ]
  )
  assert.equal(found[0].page, null)
  assert.equal(found[0].approvedEntry, false)
  assert.ok(!JSON.stringify(found).includes('light-20'), 'the value is never printed')
})

test('near miss: content fields and allowed icon classes are not design writes', async () => {
  const values = [
    heading,
    {
      loc: { slot: 'module-13.0', entity: 'module-13', column: 'params' },
      value: 'fab fa-facebook',
      rule: 'icon_class'
    }
  ]
  const report = await reportOf({ write: writeResult({ values }) })
  assert.equal(report.checks.design.status, 'ran')
  assert.deepEqual(report.checks.design.findings, [])
})

test('a design slot read back after the build that is not the blank value is reported; an equal one is not', async () => {
  const report = await reportOf({
    stored: { 'module-10.3': 'light-20', 'module-10.4': '24', 'module-10.0': 'x' }
  })
  const found = report.checks.design.findings
  assert.deepEqual(
    found.map((f) => [f.kind, f.source, f.place.slot]),
    [['design_field_written', 'stored', 'module-10.3']]
  )
  assert.deepEqual(found[0].lengths, { blank: 7, built: 8 })
})

test('an operation that did not run is not counted as written', async () => {
  const values = [{ loc: { slot: 'module-10.3', entity: 'module-10', column: 'params' }, value: 'light-20' }]
  const report = await reportOf({ write: writeResult({ values, ran: ['menu:home'] }) })
  assert.deepEqual(report.checks.design.findings, [])
})

test('the design check cannot run without the kit, or with nothing that says what was written', async () => {
  const noKit = await reportOf({ kit: null })
  assert.equal(noKit.checks.design.status, 'not_run')
  assert.match(noKit.checks.design.reason, /^kit_missing/)
  const nothing = await reportOf({ write: null })
  assert.match(nothing.checks.design.reason, /^no_write_result_or_stored_values/)
  assert.equal(nothing.counts.design, null)
})

test('a text field whose rendered words run over its declared limit is reported with lengths, not words', async () => {
  const report = await reportOf()
  const found = report.checks.limits.findings
  assert.deepEqual(kindsOf(report, 'limits'), ['text_over_limit'])
  assert.equal(found[0].page, '/bouquets')
  assert.deepEqual(found[0].place, {
    entry: 'services.intro.paragraph',
    place: 'services.intro.paragraph',
    block: 'intro-text',
    field: 'paragraph',
    element: 'p'
  })
  assert.equal(found[0].limit, 60, 'the kit limit is smaller than the order limit')
  assert.equal(found[0].length, 68)
  assert.ok(!JSON.stringify(report).includes('Hand tied'))
})

test('near miss: entities and an emoji count one character each, so a field at its limit passes', async () => {
  const files = pages()
  files['bouquets.html'] = files['bouquets.html'].replace(
    'Hand tied bouquets for weddings, birthdays and quiet thank you notes',
    'Hand tied bouquets'
  )
  const values = writeResult()
    .plan.ops.at(-1)
    .values.map((v) => (v.entry === 'services.intro.paragraph' ? { ...v, value: 'Hand tied bouquets' } : v))
  const report = await reportOf({ files, write: writeResult({ values }) })
  assert.deepEqual(report.checks.limits.findings, [])
  assert.match(report.checks.limits.notes[0], /^3 of 3 written text field/)
})

/** The bouquets page with the paragraph field written as `words` inside `wrap` (the words in place of `$`). */
function sharedElement(words, wrap) {
  const files = pages()
  files['bouquets.html'] = files['bouquets.html'].replace(
    '<p>Hand tied bouquets for weddings, birthdays and quiet thank you notes</p>',
    wrap.replace('$', words)
  )
  const values = writeResult()
    .plan.ops.at(-1)
    .values.map((v) => (v.entry === 'services.intro.paragraph' ? { ...v, value: words } : v))
  return reportOf({ files, write: writeResult({ values }) })
}
const paragraph = (report) => report.checks.limits.findings.filter((f) => f.place.field === 'paragraph')
const SIXTY = 'Hand tied bouquets for weddings and birthdays, every day: ok'

test('near miss: a field at its limit sharing its element with other words is measured alone', async () => {
  assert.equal([...SIXTY].length, 60)
  const wrap = '<p><strong>Our work:</strong> $ and a tail the template adds after it.</p>'
  const report = await sharedElement(SIXTY, wrap)
  assert.equal(report.checks.limits.status, 'ran')
  assert.deepEqual(paragraph(report), [])
})

test('a field one over its limit sharing its element with other words is reported with its own length', async () => {
  const wrap = '<p><strong>Our work:</strong> $ and a tail the template adds after it.</p>'
  const found = paragraph(await sharedElement(`${SIXTY}!`, wrap))
  assert.deepEqual(
    found.map((f) => [f.page, f.place.element, f.length, f.limit]),
    [['/bouquets', 'p', 61, 60]]
  )
})

test('a field split across inline tags is measured as one run; one the template cuts short is measured as shown', async () => {
  const split = paragraph(
    await sharedElement(`${SIXTY}!`, '<p>$</p>'.replace('$', `<em>Hand</em> ${SIXTY.slice(5)}!`))
  )
  assert.equal(split[0]?.length, 61)
  const files = pages()
  files['bouquets.html'] = files['bouquets.html'].replace(
    'Hand tied bouquets for weddings, birthdays and quiet thank you notes',
    'Hand tied bouquets for weddings, birthdays and quie...'
  )
  const cut = await reportOf({ files })
  assert.deepEqual(paragraph(cut), [], 'the page shows 51 characters of the field')
})

test('a written field found on no page is named as not located, never passed silently', async () => {
  const files = pages()
  delete files['bouquets.html']
  const report = await reportOf({ files })
  assert.deepEqual(report.checks.limits.notLocated, ['services.intro.paragraph', 'services.intro.note'])
})

test('a stored value over its limit is reported from the read back', async () => {
  const report = await reportOf({ stored: { 'module-11.1': 'x'.repeat(24) } })
  const stored = report.checks.limits.findings.find((f) => f.source === 'stored')
  assert.deepEqual([stored.place.slot, stored.length, stored.limit], ['module-11.1', 24, 23])
  const atLimit = await reportOf({ stored: { 'module-11.1': `${'x'.repeat(20)} &amp;🌷` } })
  assert.ok(!atLimit.checks.limits.findings.some((f) => f.source === 'stored'), '23 characters fit 23')
})

test('the limits check cannot run without a write result or without its write order', async () => {
  const none = await reportOf({ write: null })
  assert.match(none.checks.limits.reason, /^write_result_missing/)
  const bare = writeResult()
  delete bare.order
  const noOrder = await reportOf({ write: bare })
  assert.match(noOrder.checks.limits.reason, /^write_order_missing/)
  const other = writeResult()
  other.order = { ...other.order, run: { id: 'run-another', kind: 'build' } }
  const mismatch = await reportOf({ write: other })
  assert.match(mismatch.checks.limits.reason, /^write_order_mismatch/)
})
