// Child list rows, fourth verification pass (ticket #615): a single part schedule with no clean cut is kept whole,
// short day forms and en dash hour ranges are read, an age range is no time, a row price is proven as money, an over
// long row reports its field, limit and length, and the main button fallback offers only the business's own channels.
// Invented businesses, the JA Boxing block store read for its declaration; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-fourth-pass.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provenBy, rowProvenBy } from '../domain/needs-profile-grounding.mjs'
import { questionsOf } from '../domain/needs-profile-questions.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { planRows } from '../domain/plan-rows.mjs'
import { partKindOf } from '../domain/schedule-parts.mjs'
import { boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

// Written by code point so the source holds no dash or invisible space.
const EN_DASH = String.fromCodePoint(0x2013)
const SPACES = [' ', String.fromCodePoint(0xa0), String.fromCodePoint(0x202f)]
const sources = ['site']
const site = [{ id: 'site', origin: 'website' }]
const profileOf = (parts) => ({
  sources: site,
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

test('a one part schedule is split into days and times, or kept whole, never guessed', async () => {
  const store = boxingStore()
  const split = [
    [['Mo-Fr 9:00-17:00'], ['Mo-Fr', '9:00-17:00']],
    [['Lun-Ven 18h30'], ['Lun-Ven', '18h30']],
    [['M/W/F 6pm'], ['M/W/F', '6pm']],
    [['Tu & Th 18:00'], ['Tu & Th', '18:00']],
    [[`Sat 10${EN_DASH}12`], ['Sat', `10${EN_DASH}12`]],
    [['Sat 10-12'], ['Sat', '10-12']],
    [['Sat 10 to 12'], ['Sat', '10 to 12']]
  ]
  for (const [parts, [days, times]] of split)
    assert.deepEqual(await written(parts, store), { days, times }, JSON.stringify(parts))
  assert.deepEqual(await written(['Mon', `19${EN_DASH}21`], store), { days: 'Mon', times: `19${EN_DASH}21` })
  // A part the grammar does not split is kept whole, in the times when it holds a digit (`domain-schedule-clean-cut.test.mjs`).
  assert.deepEqual(await written(['Kids 6 to 12'], store), { days: '<hide>', times: 'Kids 6 to 12' })
  assert.deepEqual(await written(['Sunrise class'], store), { days: 'Sunrise class', times: '<hide>' })
  const both = 'Mon 9:00 to 17:00, Sat 10:00'
  assert.deepEqual(await written([both], store), { days: '<hide>', times: both })
  assert.deepEqual(await written(['18:00 Mon'], store), { days: '<hide>', times: '18:00 Mon' })
  assert.deepEqual(['Kids 6 to 12', 'ages 6-12', 'Sunrise class'].map(partKindOf), [
    'other',
    'other',
    'other'
  ])
  // Accented day names and three letter forms are days; two letter forms only in a group.
  assert.deepEqual(['Mié', 'Sáb', 'Gio', 'Seg', 'Di, Do', 'Mo'].map(partKindOf), [
    'day',
    'day',
    'day',
    'day',
    'day',
    'other'
  ])
})

test('an over long row value reports its field, limit and length', () => {
  const store = boxingStore()
  const out = planned(['Mon, Tue, Wed, Thu, Fri and Sat', '18:00 to 19:30'], store)
  assert.deepEqual(
    out.dropped.map(({ code, field, limit, length }) => ({ code, field, limit, length })),
    [{ code: 'row_value_over_limit', field: 'days', limit: 30, length: 31 }]
  )
  const times = planned(['18:00 to 19:30 and 20:00 to 21:30 also late!!'], store).dropped
  assert.deepEqual(
    times.map(({ field, limit, length }) => [field, limit, length]),
    [['times', 44, 45]]
  )
})

test('a row price is proven only as money, the way an item price is', () => {
  const wrong = [
    ['$20', 'Warm up 20 minutes then sparring'],
    ['€20', 'Drop in $20 per class'],
    ['$2010', 'Founded in 2010 by two coaches'],
    ['$15', 'Mon 18:00 to 19:00, 15 places']
  ]
  for (const role of ['offering.price', 'package.price'])
    for (const [value, evidence] of wrong) assert.equal(rowProvenBy(role, value, evidence), false, value)
  assert.equal(rowProvenBy('offering.price', '$20', 'Drop in $20.00 per class'), true)
  assert.equal(rowProvenBy('offering.price', '$20', 'Drop in $20 per class'), true)
  // A space, a no-break space or a narrow no-break space groups thousands.
  for (const space of SPACES) {
    assert.equal(provenBy('package.price', `1${space}200 €`, `Annual plan 1${space}200 € paid once`), true)
    assert.equal(provenBy('package.price', '€1,200', `Annual plan 1${space}200 € paid once`), true)
    assert.equal(rowProvenBy('package.price', `1${space}200 €`, 'Annual plan €1,200 paid once'), true)
  }
  assert.equal(provenBy('package.price', '€200', 'Annual plan 1 200 € paid once'), false)
})

test('the main button fallback offers only the channels the business has', () => {
  const ask = (facts, limit) =>
    questionsOf({
      facts,
      items: {},
      conflicts: [],
      sources: site,
      language: { value: 'en' },
      limits: new Map([['contact.cta_label', limit]])
    })
  const fact = (value) => [{ value, sources }]
  const button = (facts, limit) => ask(facts, limit).questions.find((q) => q.topic === 'main-button')
  const labels = (facts, limit) => button(facts, limit)?.choices.map((c) => c.label)
  const email = { 'contact.email': fact('hello@invented-club.test') }
  const link = { 'contact.cta_url': fact('https://invented-club.test/book') }
  assert.deepEqual(labels(email, 6), ['Email'])
  assert.deepEqual(labels(link, 6), ['Book'])
  assert.deepEqual(labels({ ...email, ...link }, 5), ['Book', 'Email'])
  assert.deepEqual(labels({}, 9), ['Contact'])
  for (const limit of [6, 5, 4, 3]) assert.equal(labels(email, limit)?.includes('Call') ?? false, false)
  // No short label of a channel it has fits: not asked, and the profile says why.
  assert.equal(button(email, 4), undefined)
  assert.deepEqual(
    ask(email, 4).notes.map((n) => n.code),
    ['main_button_not_asked']
  )
})
