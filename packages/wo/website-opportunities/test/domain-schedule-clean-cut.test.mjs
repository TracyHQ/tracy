// A one part schedule row in a list with a days field and a times field (ticket #615): never lose a real schedule and
// never cut inside a range. The row is split only when the days end before the whole time expression starts; else it
// is kept whole, in the times when it holds a time and in the days when it holds none. Six languages, written through
// the plan's rows and the page writer on the JA Boxing block store; invented business, no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-schedule-clean-cut.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { CHILD_LIST_REASONS, planRows } from '../domain/plan-rows.mjs'
import { partKindOf } from '../domain/schedule-parts.mjs'
import { boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

// Written by code point so the source holds no dash and no accent.
const D = String.fromCodePoint(0x2013)
const c = (n) => String.fromCodePoint(n)
const [a_uml, i_acute, i_grave, a_grave] = [0xe4, 0xed, 0xec, 0xe0].map(c)
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
async function written(parts, store) {
  const out = planned(parts, store)
  assert.deepEqual(out.dropped, [], JSON.stringify(parts))
  const copy = await writePages({
    plan: { language: 'en', pictures: {}, pages: out.pages },
    profile: profileOf(parts),
    blockStore: store,
    model: scriptedWriter(() => 'Calm practice')
  })
  const row = copy.pages[0].fields.filter((f) => f.row === 'calendar.1')
  return Object.fromEntries(row.map((f) => [f.field, f.value ?? `<${f.action}>`]))
}

// [input, days, times]: null is a hidden field.
const SPLIT = [
  ['Mo-Fr 7 bis 22 Uhr', 'Mo-Fr', '7 bis 22 Uhr'],
  ['Mon-Fri 9-5 pm', 'Mon-Fri', '9-5 pm'],
  ['Lun-Ven 9-18h', 'Lun-Ven', '9-18h'],
  ['Mo bis Fr 9 bis 18 Uhr', 'Mo bis Fr', '9 bis 18 Uhr'],
  ['Tue & Thu 6 - 7.30 pm', 'Tue & Thu', '6 - 7.30 pm'],
  [`T${a_uml}glich 9 bis 18 Uhr`, `T${a_uml}glich`, '9 bis 18 Uhr'],
  ['Mo-Fr 9-18 Uhr', 'Mo-Fr', '9-18 Uhr'],
  ['Sa + So 10 bis 14 Uhr', 'Sa + So', '10 bis 14 Uhr'],
  [`Mo${D}Fr 8${D}20 Uhr`, `Mo${D}Fr`, `8${D}20 Uhr`],
  ['Mon 6-8pm', 'Mon', '6-8pm'],
  ['Sat 9 to 11am', 'Sat', '9 to 11am'],
  ['Weekdays 6-9 pm', 'Weekdays', '6-9 pm'],
  ['Weekdays 7am - 9pm', 'Weekdays', '7am - 9pm'],
  ['Lunes 9 a 13 h', 'Lunes', '9 a 13 h'],
  [`Seg a Sex 9h ${a_grave}s 18h`, 'Seg a Sex', `9h ${a_grave}s 18h`],
  ['Lun. au ven. 9h-18h', 'Lun. au ven.', '9h-18h'],
  ['Di und Do 19 Uhr', 'Di und Do', '19 Uhr'],
  ['Lun a Vie 9 a 18', 'Lun a Vie', '9 a 18'],
  ['De lunes a viernes de 9 a 18', 'De lunes a viernes', 'de 9 a 18'],
  ['Lun-Ven 9-18', 'Lun-Ven', '9-18'],
  ['Mo-Fr 9.00-18.00 Uhr', 'Mo-Fr', '9.00-18.00 Uhr'],
  ['Sab 10-13', 'Sab', '10-13'],
  ['Mer 18h', 'Mer', '18h'],
  ['Every day 9am to 9pm', 'Every day', '9am to 9pm'],
  ['Everyday 9am-9pm', 'Everyday', '9am-9pm'],
  ['Tue/Thu 18:30', 'Tue/Thu', '18:30'],
  ['Sat 10am', 'Sat', '10am'],
  [`M${D}F 6am`, `M${D}F`, '6am'],
  ['Mon-Fri 9:00 to 17:00', 'Mon-Fri', '9:00 to 17:00'],
  ['Mon-Fri 9am-5pm', 'Mon-Fri', '9am-5pm'],
  ['Sat 10 - 12', 'Sat', '10 - 12'],
  ['Werktags 8-20 Uhr', 'Werktags', '8-20 Uhr'],
  ['Week-end 10h-12h', 'Week-end', '10h-12h'],
  ['T/Th 18:00', 'T/Th', '18:00'],
  // Fourth pass cases that still hold.
  ['Mo-Fr 9:00-17:00', 'Mo-Fr', '9:00-17:00'],
  ['Lun-Ven 18h30', 'Lun-Ven', '18h30'],
  ['M/W/F 6pm', 'M/W/F', '6pm'],
  ['Tu & Th 18:00', 'Tu & Th', '18:00'],
  [`Sat 10${D}12`, 'Sat', `10${D}12`],
  ['Sat 10-12', 'Sat', '10-12'],
  ['Sat 10 to 12', 'Sat', '10 to 12']
]
// A time with no clean cut: the whole text in the times.
const WHOLE_TIMES = [
  '6:00 pm',
  'Do 18 Uhr',
  'Sa 10-14 Uhr',
  '9h-18h',
  `9h ${a_grave}s 18h`,
  '18:00 Mon',
  'Mon 9:00 to 17:00, Sat 10:00'
]
// No time: the whole text in the days.
const WHOLE_DAYS = [
  'Monday to Friday',
  'Mon, Wed, Fri',
  'Daily',
  'Weekdays',
  'Weekends',
  '24/7',
  'By appointment',
  'Sa + So',
  `T${a_uml}glich`,
  'Werktags',
  'Wochenende',
  'Do',
  'Di',
  'Mi',
  'So',
  'Sa',
  'Di & Do',
  'Tous les jours',
  'Du lundi au vendredi',
  'Sur rendez-vous',
  'Week-end',
  `Todos los d${i_acute}as`,
  'Lunes a viernes',
  'Fines de semana',
  'Tutti i giorni',
  `Dal luned${i_grave} al venerd${i_grave}`,
  'Todos os dias',
  'Segunda a sexta',
  'Fim de semana',
  'Mornings',
  'Evenings',
  'Weekday evenings',
  `Mon${D}Fri`,
  'Mon - Fri',
  'Mon thru Fri',
  'Monday through Friday',
  'Tuesdays and Thursdays',
  'Sat & Sun',
  'Year round',
  'On request',
  'Saturday mornings',
  'Mo, Mi, Fr',
  'M-F',
  'Holidays closed',
  'Mon-Sat',
  'Every Saturday',
  'Every other Sunday',
  'Summer term',
  'Sunrise class',
  'Kids 6 to 12'
]

test('a one part schedule is split only on a clean cut, else kept whole, never dropped', async () => {
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

test('day words of every language, letter groups in week order, an age range is no time', () => {
  const days = ['Daily', 'Weekdays', 'Weekends', `T${a_uml}glich`, 'Werktags', 'Wochenende', 'Tous les jours']
  days.push('Week-end', `Todos los d${i_acute}as`, 'Fines de semana', 'Tutti i giorni', 'Todos os dias')
  days.push('Fim de semana', 'M/W/F', 'T/Th', 'L/X/V', 'M-F', 'Sab')
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
