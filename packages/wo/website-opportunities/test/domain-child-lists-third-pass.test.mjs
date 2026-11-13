// Child list rows, third verification pass (ticket #615): an over long optional value leaves only that value off its
// item, schedule parts land in the field of their own kind, and the main button question never offers a choice the
// template's button cannot hold. Invented businesses, the JA Boxing block store read for its declaration; no real
// model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-third-pass.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { questionsOf } from '../domain/needs-profile-questions.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { questionProblems } from '../domain/build-contract-questions.mjs'
import { settleAnswers } from '../domain/plan-answers.mjs'
import { clearOverLimitValues, dropOverLimitData, overLimitLeftOut } from '../domain/plan-data-limits.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { planRows } from '../domain/plan-rows.mjs'
import { daysAndTimesOf, partKindOf } from '../domain/schedule-parts.mjs'
import { boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const sources = ['site']
const site = [{ id: 'site', origin: 'website' }]
const service = (id, fields, rows = []) => ({
  id,
  kind: 'service',
  fields: Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value, sources }])),
  sources,
  rows: rows.map((parts, n) => ({
    id: `${id}-row-${n + 1}`,
    fields: { 'offering.schedule': { value: parts } },
    sources
  }))
})
const page = (ids) => [
  {
    id: 'home',
    name: 'Home',
    pageType: 'home',
    blocks: [{ id: 'b1', type: 'services', block: 'block-160', data: ids }]
  }
]
const write = (pages, profile, store) =>
  writePages({
    plan: { language: 'en', pictures: {}, pages },
    profile,
    blockStore: store,
    model: scriptedWriter(() => 'Calm practice')
  })

test('an over long optional value is left off alone: the item stays, the field follows its no-data rule', async () => {
  const store = boxingStore()
  const long = 'Mondays, Wednesdays and Fridays from early morning until late in the evening hours'
  const profile = {
    sources: site,
    facts: {},
    items: { service: [service('svc-a', { 'offering.name': 'Invented Boxing', 'offering.schedule': long })] }
  }
  const data = planDataOf(profile)
  const limited = dropOverLimitData(page(['svc-a']), blocksOf(store), data)
  clearOverLimitValues(limited.dropped, data)
  assert.deepEqual(limited.pages[0].blocks[0].data, ['svc-a'])
  const [entry] = overLimitLeftOut(limited.dropped, limited.pages, data)
  assert.equal(entry.what, 'Schedule of Invented Boxing')
  assert.match(entry.reason, /^"Mondays, Wednesdays.*so Invented Boxing is shown without it\.$/)
  const copy = await write(limited.pages, profile, store)
  const fields = copy.pages[0].fields.filter((f) => f.item === 'svc-a' && !f.row)
  assert.equal(fields.find((f) => f.field === 'name').value, 'Invented Boxing')
  assert.equal(fields.find((f) => f.field === 'schedule').action, 'hide')
  // The value that names the item (a required role of its kind) takes the item off the block.
  const named = planDataOf({
    sources: site,
    facts: {},
    items: { service: [service('svc-b', { 'offering.name': long })] }
  })
  assert.deepEqual(dropOverLimitData(page(['svc-b']), blocksOf(store), named).pages[0].blocks[0].data, [])
})

test('one detector places schedule parts: days in days, times in times, never the other way', async () => {
  const store = boxingStore()
  const cases = [
    [['18:00 to 19:30'], [undefined, '18:00 to 19:30']],
    [['Mon to Fri 9:00 to 17:00'], ['Mon to Fri', '9:00 to 17:00']],
    [
      ['Lundi', '18h30 à 20h'],
      ['Lundi', '18h30 à 20h']
    ],
    [
      ['Mon', '6 pm to 7.30 pm'],
      ['Mon', '6 pm to 7.30 pm']
    ],
    [['18:00', 'Mon 19:00'], 'row_parts_order'],
    [['noon to 2', 'Sat'], 'row_parts_order'],
    [['Mon', 'Tue'], 'row_parts_order']
  ]
  for (const [parts, want] of cases) {
    const profile = {
      sources: site,
      facts: {},
      items: { service: [service('svc-a', { 'offering.name': 'Invented Boxing' }, [parts])] }
    }
    const out = planRows(page(['svc-a']), blocksOf(store), planDataOf(profile))
    if (typeof want === 'string') {
      assert.deepEqual(
        out.dropped.map((d) => d.code),
        [want],
        JSON.stringify(parts)
      )
      continue
    }
    assert.deepEqual(out.dropped, [], JSON.stringify(parts))
    const copy = await write(out.pages, profile, store)
    const row = copy.pages[0].fields.filter((f) => f.row === 'calendar.1')
    const value = (name) => row.find((f) => f.field === name)
    assert.deepEqual([value('days').value, value('times').value], want, JSON.stringify(parts))
    if (want[0] === undefined) assert.equal(value('days').action, 'hide')
  }
  // The prompt's own examples are days then times by the same detector.
  const prompt = readFileSync(new URL('../domain/needs-profile-prompt.md', import.meta.url), 'utf8')
  const examples = [...prompt.matchAll(/`(\["[^`]*"\])`/g)].map((m) => JSON.parse(m[1]))
  assert.ok(examples.length >= 3)
  for (const parts of examples) assert.ok(daysAndTimesOf(parts) !== null, JSON.stringify(parts))
  assert.deepEqual(['noon', 'midnight', '18 Uhr', '20h'].map(partKindOf), ['time', 'time', 'time', 'time'])
})

test('the main button question always offers a choice that fits, falling back to shorter generic labels', () => {
  const facts = { 'contact.phone': [{ value: '+1 555 0100', sources }] }
  const ask = (limit) =>
    questionsOf({
      facts,
      items: {},
      conflicts: [],
      sources: site,
      language: { value: 'en' },
      limits: new Map([['contact.cta_label', limit]])
    })
  const button = (limit) => ask(limit).questions.find((q) => q.topic === 'main-button')
  const labels = (limit) => button(limit).choices.map((c) => c.label)
  assert.deepEqual(labels(12), ['Call us'])
  assert.deepEqual(labels(6), ['Call'])
  assert.deepEqual(labels(4), ['Call'])
  for (const limit of [12, 6, 4]) {
    const problems = []
    questionProblems(button(limit), (at, message) => problems.push(`${at}: ${message}`))
    assert.deepEqual(problems, [], String(limit))
    assert.equal(button(limit).choices.filter((c) => c.recommended).length, 1)
  }
  // A typed label within the limit settles too, and the offered choice settles to its label.
  const limits = new Map([['contact.cta_label', 4]])
  const q = button(4)
  const settle = (fields) =>
    settleAnswers(
      { questions: [q], facts, sources: site },
      [{ schema: 'tracy-build-answer/v1', question: q.id, ...fields }],
      limits
    )
  assert.equal(settle({ text: 'Hi' }).profile.facts['contact.cta_label'][0].value, 'Hi')
  assert.equal(settle({ choice: q.choices[0].id }).profile.facts['contact.cta_label'][0].value, 'Call')
  // A button shorter than the short label of every channel the business has is not asked about; the profile says why.
  const none = ask(3)
  assert.equal(
    none.questions.find((q) => q.topic === 'main-button'),
    undefined
  )
  assert.deepEqual(
    none.notes.map((n) => n.code),
    ['main_button_not_asked']
  )
})
