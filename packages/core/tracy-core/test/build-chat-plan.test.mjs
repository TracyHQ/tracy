// The build chat's plan card as data (#606): what the card shows is read from the Contract B plan alone, a conflicting
// fact offers both values with the website's first, a choice becomes a structured plan edit that passes the contract,
// and the plan review bar is one dsh plan review request whose approval names the plan it approves.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlanEdit } from '../../../wo/website-opportunities/domain/build-contract-plan-edit.mjs'
import {
  approvalOf,
  changedFieldsOf,
  planCardOf,
  planChangeOf,
  planEditOf,
  planReviewRequestOf
} from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan

test('business facts carry their value and the first source, in plan order', () => {
  const card = planCardOf(plan())
  assert.equal(card.name, 'Sunrise Tennis Club')
  assert.deepEqual(
    card.facts.map((f) => [f.label, f.value, f.source]),
    [
      ['Business name', 'Sunrise Tennis Club', 'Website'],
      ['Tagline', 'Tennis for every age and level', 'Instagram bio'],
      ['Main button', 'Book a court', 'Your answer'],
      ['Phone', '04 000 0000', 'Your answer'],
      ['Email', 'hello@sunrise-tennis.example', 'Website'],
      ['Address', '12 Court Lane, Harbour District', 'Google Maps'],
      ['Opening hours', 'Weekdays 6:00 to 22:00, weekends 8:00 to 18:00', 'Website']
    ]
  )
  assert.equal(card.language, 'en')
  assert.equal(card.facts[0].field, 'facts[name].value')
})

test('a fact the sources disagree on offers both values, the website first and selected', () => {
  const hours = planCardOf(plan()).facts.find((f) => f.id === 'hours')
  assert.equal(hours.choice.field, 'facts[hours].value')
  assert.match(hours.choice.said, /different opening hours/)
  assert.deepEqual(hours.choice.options, [
    { value: 'Weekdays 6:00 to 22:00, weekends 8:00 to 18:00', source: 'Website', selected: true },
    { value: 'Every day, 6:00 to 22:00', source: 'Google Maps', selected: false }
  ])
  assert.equal(planCardOf(plan()).facts.find((f) => f.id === 'phone').choice, null)
})

test('the other value is picked: a structured plan edit of the current revision that passes the contract', () => {
  const p = plan()
  const edit = planEditOf(p, [{ field: 'facts[hours].value', value: 'Every day, 6:00 to 22:00' }], 'edit-a')
  assert.deepEqual(edit, {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-a',
    plan: { id: 'plan-sunrise-tennis', revision: 1 },
    changes: [{ field: 'facts[hours].value', value: 'Every day, 6:00 to 22:00' }]
  })
  const checked = checkPlanEdit(edit, p)
  assert.deepEqual(checked.problems, [])
  const after = planCardOf(checked.plan).facts.find((f) => f.id === 'hours')
  assert.equal(after.value, 'Every day, 6:00 to 22:00')
  assert.deepEqual(
    after.choice.options.map((o) => o.selected),
    [false, true],
    'the card follows the returned plan'
  )
})

test('pages list their blocks with the data each will hold and the reason', () => {
  const card = planCardOf(plan())
  assert.deepEqual(
    card.pages.map((p) => [p.name, p.blocks.length]),
    [
      ['Home', 4],
      ['About', 2],
      ['Services', 1],
      ['Coaches', 1],
      ['Contact', 2]
    ]
  )
  const [hero, services, reviews, contact] = card.pages[0].blocks
  assert.deepEqual(hero.holds, { facts: ['Business name', 'Tagline', 'Main button'], counts: [] })
  assert.deepEqual(services.holds, {
    services: ['Adult coaching', 'Junior squad', 'Court hire', 'Cardio tennis']
  })
  assert.deepEqual(reviews.holds, { facts: [], counts: [{ kind: 'quote', count: 6 }] })
  assert.match(reviews.reason, /Tracy reviews block/)
  assert.deepEqual(contact.holds.facts, ['Phone', 'Address', 'Opening hours'])
  assert.deepEqual(card.pages[1].blocks[1].holds.counts, [{ kind: 'gallery', count: 12 }])
  assert.deepEqual(card.pages[3].blocks[0].holds.counts, [{ kind: 'person', count: 3 }])
  assert.deepEqual(
    card.services.map((s) => [s.label, s.source]),
    [
      ['Adult coaching', 'Website'],
      ['Junior squad', 'Website'],
      ['Court hire', 'Website'],
      ['Cardio tennis', 'Instagram post']
    ]
  )
})

test('look, pictures, assumptions and left out come straight from the plan', () => {
  const card = planCardOf(plan())
  assert.deepEqual(card.look, {
    template: 'JA Boxing',
    accent: '#1f7a4d',
    logo: { kind: 'own', source: 'Instagram profile picture' }
  })
  assert.deepEqual(card.pictures, {
    own: { frames: 31, from: ['Instagram', 'Website'] },
    generated: { frames: 2, reason: 'Two spots have no fitting photo; generated pictures show no people.' }
  })
  // The conflict is shown at its fact; the other assumptions are listed.
  assert.deepEqual(
    card.assumptions.map((a) => a.id),
    ['language']
  )
  assert.deepEqual(
    card.leftOut.map((l) => l.what),
    ['Prices page', 'Blog', 'Shop', 'Video in the top banner']
  )
  assert.deepEqual(card.counts, { pages: 5, services: 4 })
})

test('the card holds no written copy: every shown text comes from a plan field', () => {
  const card = JSON.stringify(planCardOf(plan()))
  assert.doesNotMatch(card, /"(heading|title|description|body|cta)"/)
})

test('the plan review bar is one dsh plan review request; only Approve is an approval', () => {
  const p = plan()
  const request = planReviewRequestOf(p)
  assert.equal(request.questions.length, 1)
  const [q] = request.questions
  assert.equal(q.intent.kind, 'plan-review')
  assert.equal(q.intent.approve, 'Approve')
  assert.equal(q.detail, '# Sunrise Tennis Club: 5 pages, 4 services')
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Approve', 'Request changes']
  )
  assert.deepEqual(approvalOf(p, { answers: [{ id: q.id, selected: ['Approve'] }] }), {
    plan: { id: 'plan-sunrise-tennis', revision: 1 }
  })
  assert.equal(approvalOf(p, { answers: [{ id: q.id, selected: ['Request changes'] }] }), null)
  assert.equal(approvalOf(p, null), null)
})

// In place editing (#607): which values were just changed, and the change an editor's text makes.

const tagline = (p) =>
  planEditOf(p, [{ field: 'facts[tagline].value', value: 'Tennis for every age' }], 'edit-t')

test('the value just changed is the last edit, while it can still be undone and applies to this revision', () => {
  const p = plan()
  const edit = tagline(p)
  const after = checkPlanEdit(edit, p).plan
  assert.deepEqual(changedFieldsOf({ plan: after, lastEdit: edit, canUndo: true }), ['facts[tagline].value'])
  // Undone: the draft keeps the undo as its last edit but offers no undo, so nothing is highlighted.
  assert.deepEqual(changedFieldsOf({ plan: after, lastEdit: edit, canUndo: false }), [])
  // A newer plan (a page added through the chat): the edit belongs to an older revision.
  assert.deepEqual(changedFieldsOf({ plan: { ...after, revision: 5 }, lastEdit: edit, canUndo: true }), [])
  assert.deepEqual(
    changedFieldsOf({ plan: { ...after, id: 'plan-other' }, lastEdit: edit, canUndo: true }),
    []
  )
  assert.deepEqual(changedFieldsOf({ plan: p, lastEdit: null, canUndo: false }), [])
  assert.deepEqual(changedFieldsOf({ plan: p }), [])
})

test('an editor text becomes one change: text trimmed, a count a whole number, nothing when empty or unchanged', () => {
  assert.deepEqual(planChangeOf('facts[tagline].value', 'Old', '  New tagline '), {
    field: 'facts[tagline].value',
    value: 'New tagline'
  })
  assert.equal(planChangeOf('facts[tagline].value', 'Old', '   '), null)
  assert.equal(planChangeOf('facts[tagline].value', 'Old', ' Old '), null)
  assert.deepEqual(planChangeOf('pictures.generated.frames', 2, ' 3 '), {
    field: 'pictures.generated.frames',
    value: 3
  })
  assert.deepEqual(planChangeOf('pictures.generated.frames', 2, '0'), {
    field: 'pictures.generated.frames',
    value: 0
  })
  assert.equal(planChangeOf('pictures.generated.frames', 2, '2'), null)
  assert.equal(planChangeOf('pictures.generated.frames', 2, '2.5'), null)
  assert.equal(planChangeOf('pictures.generated.frames', 2, 'two'), null)
  assert.equal(planChangeOf('pictures.generated.frames', 2, '-1'), null)
})

test('a renamed service is one change, and every block that shows the services reads the new name', () => {
  const p = plan()
  const edit = planEditOf(p, [planChangeOf('items[s2].label', 'Junior squad', 'Junior academy')], 'edit-r')
  const checked = checkPlanEdit(edit, p)
  assert.deepEqual(checked.problems, [])
  const card = planCardOf(checked.plan)
  assert.equal(card.services.find((s) => s.id === 's2').label, 'Junior academy')
  const servicesOf = (page) =>
    card.pages.find((x) => x.id === page).blocks.find((b) => 'services' in b.holds).holds
  for (const page of ['home', 'services'])
    assert.deepEqual(servicesOf(page).services, [
      'Adult coaching',
      'Junior academy',
      'Court hire',
      'Cardio tennis'
    ])
})

// Child list rows (#606, #615): a block with `lists` shows each list with its rows in plain words.
const withLists = (lists, extra = {}) => {
  const p = structuredClone(plan())
  p.rows = [
    { id: 'row-a', label: 'Tuesday, 18:00', sources: [{ kind: 'website', name: 'Website' }] },
    { id: 'row-b', label: 'Beginners', sources: [{ kind: 'website', name: 'Website' }] }
  ]
  const block = p.pages.find((pg) => pg.id === 'services').blocks[0]
  block.lists = lists
  Object.assign(p, extra)
  return { plan: p, block: () => planCardOf(p).pages.find((pg) => pg.id === 'services').blocks[0] }
}

test('a block without lists has no lists on the card, and the sample shows its one list with rows', () => {
  const p = plan()
  const card = planCardOf(p)
  for (const [i, page] of card.pages.entries())
    for (const [j, block] of page.blocks.entries())
      if (!p.pages[i].blocks[j].lists) assert.equal('lists' in block, false)
  // The sample's Services block holds one list with rows and one planned empty: only the first is shown.
  const services = card.pages.find((pg) => pg.id === 'services').blocks[0]
  assert.deepEqual(services.lists, [
    {
      head: 'Adult coaching, sessions',
      rows: [{ label: 'Tuesday and Thursday, 18:00 to 19:00' }, { label: 'Saturday, 9:00 to 10:00' }]
    }
  ])
})

test('a list shows its rows by label, in plan order, headed by its item and name', () => {
  const { plan: p, block } = withLists([
    { name: 'sessions', item: 's1', rows: [{ data: 'row-b' }, { data: 'row-a' }] }
  ])
  assert.deepEqual(block().lists, [
    { head: 'Adult coaching, sessions', rows: [{ label: 'Beginners' }, { label: 'Tuesday, 18:00' }] }
  ])
  // The card renders the plan's order as given: reversing the block's data changes nothing about the lists.
  p.pages.find((pg) => pg.id === 'services').blocks[0].data.reverse()
  assert.deepEqual(planCardOf(p).pages.find((pg) => pg.id === 'services').blocks[0].lists[0].rows.length, 2)
})

test('a row that points at a fact shows its value, and one that points at a page shows its name', () => {
  const { block } = withLists([
    { name: 'links', rows: [{ data: 'phone' }, { page: 'about' }, { data: 'unknown-id' }] }
  ])
  assert.deepEqual(block().lists, [{ head: 'Links', rows: [{ label: '04 000 0000' }, { label: 'About' }] }])
})

test('nested lists keep their level, and a list planned empty shows nothing', () => {
  const { block } = withLists([
    {
      name: 'steps',
      rows: [
        {
          data: 'row-a',
          lists: [
            { name: 'notes', rows: [{ data: 'row-b' }] },
            { name: 'none', rows: [] }
          ]
        }
      ]
    },
    { name: 'sessions', item: 's2', rows: [] }
  ])
  assert.deepEqual(block().lists, [
    {
      head: 'Steps',
      rows: [{ label: 'Tuesday, 18:00', lists: [{ head: 'Notes', rows: [{ label: 'Beginners' }] }] }]
    }
  ])
})

test('the rows report of dropped rows reaches the card as left out reasons, never as codes', () => {
  const reason = 'This row is longer than the section can show, so it is not shown.'
  const { plan: p } = withLists([], {
    leftOut: [{ what: 'Tuesday, 18:00', kind: 'item', reason }]
  })
  const card = planCardOf(p)
  assert.deepEqual(card.leftOut, [{ what: 'Tuesday, 18:00', kind: 'item', reason }])
  assert.equal(JSON.stringify(card).includes('row_value_over_limit'), false)
})
