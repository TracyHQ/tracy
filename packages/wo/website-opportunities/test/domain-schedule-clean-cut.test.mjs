// A one part schedule row in a list with a days field and a times field (ticket #615), written through the plan's rows
// and the page writer on the JA Boxing block store. The row is split only when the whole text is one day group, one
// separator and one time expression; anything else is kept whole and unchanged (in the times when it holds a digit,
// else in the days). A table of six languages plus a seeded property test; invented business, no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-schedule-clean-cut.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { CHILD_LIST_REASONS, planRows } from '../domain/plan-rows.mjs'
import { hasDays } from '../domain/schedule-days.mjs'
import { partKindOf } from '../domain/schedule-parts.mjs'
import { boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'
import { SPLIT, WHOLE_DAYS, WHOLE_TIMES } from './fixtures/schedule-clean-cut/cases.mjs'
import { generatedRows } from './fixtures/schedule-clean-cut/generator.mjs'

const c = (n) => String.fromCodePoint(n)
const [a_uml, i_acute] = [0xe4, 0xed].map(c)
const sources = ['site']
const profileOf = (parts) => ({
  sources: [{ id: 'site', origin: 'website' }],
  facts: {},
  items: {
    service: [
      {
        id: 'svc-a',
        kind: 'service',
        fields: { 'offering.name': { value: 'Invented Boxing', sources } },
        sources,
        rows: [{ id: 'svc-a-row-1', fields: { 'offering.schedule': { value: parts } }, sources }]
      }
    ]
  }
})
const pages = [
  {
    id: 'home',
    name: 'Home',
    pageType: 'home',
    blocks: [{ id: 'b1', type: 'services', block: 'block-160', data: ['svc-a'] }]
  }
]
const planned = (parts, store) => planRows(pages, blocksOf(store), planDataOf(profileOf(parts)))
/** The row's days and times as written (`<hide>` for a hidden field), or the drop of an over long value. */
async function written(parts, store) {
  const out = planned(parts, store)
  if (out.dropped.length > 0) return { dropped: out.dropped }
  const copy = await writePages({
    plan: { language: 'en', pictures: {}, pages: out.pages },
    profile: profileOf(parts),
    blockStore: store,
    model: scriptedWriter(() => 'Calm practice')
  })
  const row = copy.pages[0].fields.filter((f) => f.row === 'calendar.1')
  return Object.fromEntries(row.map((f) => [f.field, f.value ?? `<${f.action}>`]))
}

test('a one part schedule is split only by the whole string grammar, else kept whole, never dropped', async () => {
  const store = boxingStore()
  const cases = [...SPLIT, ...WHOLE_TIMES.map((s) => [s, null, s]), ...WHOLE_DAYS.map((s) => [s, s, null])]
  for (const [input, days, times] of cases)
    assert.deepEqual(
      await written([input], store),
      { days: days ?? '<hide>', times: times ?? '<hide>' },
      JSON.stringify(input)
    )
  assert.equal('row_part_unclear' in CHILD_LIST_REASONS, false)
})

const nonSpace = (s) => s.replace(/\s+/gu, '')
// A range or list connector the days may not end with (the cut would be inside a range).
const OPEN_END = /(?:[-\u2013/&+,]|\s(?:to|thru|through|till|until|and|et|au|\u00e0|und|bis|a|al|y|e))$/iu

test('property: 2,400 generated rows lose nothing, cut only between days and times, drop only over the limit', async () => {
  const store = boxingStore()
  const rows = generatedRows(2400)
  const tally = { split: 0, wholeTimes: 0, wholeDays: 0, dropped: 0 }
  for (const input of rows) {
    const out = await written([input], store)
    const say = JSON.stringify({ input, out })
    if (out.dropped) {
      for (const d of out.dropped) {
        assert.equal(d.code, 'row_value_over_limit', say)
        assert.ok(d.length > d.limit, say)
      }
      tally.dropped++
      continue
    }
    const days = out.days === '<hide>' ? '' : out.days
    const times = out.times === '<hide>' ? '' : out.times
    if (days && times) {
      tally.split++
      // Nothing lost or added but the one separator at the cut.
      const cut = nonSpace(input).slice(
        nonSpace(days).length,
        nonSpace(input).length - nonSpace(times).length
      )
      assert.ok(['', ':', ',', '-', '\u2013'].includes(cut), say)
      assert.equal(nonSpace(input), nonSpace(days) + cut + nonSpace(times), say)
      assert.doesNotMatch(days, /\d/u, say)
      assert.equal(hasDays(times), false, say)
      assert.doesNotMatch(days, OPEN_END, say)
      assert.doesNotMatch(times, /^[-\u2013]/u, say)
    } else {
      // Kept whole and unchanged, in the times exactly when it holds a digit.
      assert.equal(days || times, input, say)
      assert.equal(times ? 'times' : 'days', /\d/u.test(input) ? 'times' : 'days', say)
      tally[times ? 'wholeTimes' : 'wholeDays']++
    }
  }
  console.log(`generated ${rows.length}: ${JSON.stringify(tally)}`)
  assert.ok(tally.split > 600 && tally.wholeTimes > 600 && tally.wholeDays > 200, JSON.stringify(tally))
})

test('day words of every language, letter groups in week order, an age range is no time', () => {
  const days = ['Daily', 'Weekdays', 'Weekends', `T${a_uml}glich`, 'Werktags', 'Wochenende', 'Tous les jours']
  days.push('Week-end', `Todos los d${i_acute}as`, 'Fines de semana', 'Tutti i giorni', 'Todos os dias')
  days.push('Fim de semana', 'M/W/F', 'T/Th', 'L/X/V', 'M-F', 'Sab', 'Montags')
  for (const text of days) assert.equal(partKindOf(text), 'day', text)
  for (const text of [
    'S, M, L',
    'W/R/F',
    'M/L/XL',
    'fr/en',
    'T-shirt',
    'Kids 6 to 12',
    'ages 6-12',
    'Do',
    'So good'
  ])
    assert.equal(partKindOf(text), 'other', text)
})

test('a value longer than its field still drops the row with its field, limit and length', () => {
  const store = boxingStore()
  const long = 'By appointment on any day you like'
  assert.deepEqual(
    planned([long], store).dropped.map(({ code, field, limit, length }) => ({ code, field, limit, length })),
    [{ code: 'row_value_over_limit', field: 'days', limit: 30, length: long.length }]
  )
  // Two parts keep their order rule.
  assert.equal(planned(['18:00', 'Mon 19:00'], store).dropped[0].code, 'row_parts_order')
})
