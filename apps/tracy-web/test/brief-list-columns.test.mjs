// A card list that lost demo cards keeps a whole row (spec TracyHQ/tracy#189, product owner 29/10/2026): the list's own
// column setting follows the cards kept, for any card list of a module (people, offerings, testimonials). The templates
// and businesses below are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'
import { fitListColumns } from '../src/sites/brief-engines/list-columns.js'

const acm = (config) => JSON.stringify({ 'jatools-config': JSON.stringify(config) })
const configOf = (steps, id) =>
  JSON.parse(
    JSON.parse(steps.find((s) => s.kind === 'module' && s.id === id).fields.params)['jatools-config']
  )

/** The plan's honesty for one list of a module: the cards at `hidden` taken off. */
function honestyOf(entity, kind, parents, fields, hidden) {
  const records = hidden.map((index) => ({ group: `${entity}.${kind}.${index}`, kind, decision: 'hide' }))
  const hide = hidden.map((index) => ({
    how: 'item',
    entity,
    column: 'params',
    nestedJson: 'jatools-config',
    parents,
    fields,
    index,
    group: `${entity}.${kind}.${index}`,
    reason: 'no-brief-person'
  }))
  return { records, hide, blanks: [], values: {} }
}

test('a dental clinic: two dentists kept of a four-column team list fill a two-column row', () => {
  // The admin form's own bookkeeping (`rows`, `cols`, `type: list`) sits beside the fields and is left alone.
  const config = {
    staff: {
      'staff-intro[columns]': ['4'],
      'staff-intro[data]': {
        'staff-intro[data][title]': ['Dr. Lena Morrow', 'Dr. Ada Kim', 'Dr. Felix Brandt', 'Dr. Ola Brin'],
        'staff-intro[data][img]': ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
        rows: 4,
        cols: 2,
        type: 'list'
      }
    }
  }
  const honesty = honestyOf(
    'module-41',
    'person',
    [['staff', 'staff-intro[data]']],
    ['staff-intro[data][title]', 'staff-intro[data][img]'],
    [2, 3]
  )
  const { steps } = recordSteps({ honesty, modules: new Map([[41, { id: 41, params: acm(config) }]]) })
  const out = configOf(steps, 41)
  assert.deepEqual(out.staff['staff-intro[columns]'], ['2'])
  assert.equal(out.staff['staff-intro[data]'].cols, 2, 'the list bookkeeping is no column setting')
  assert.deepEqual(out.staff['staff-intro[data]']['staff-intro[data][title]'], [
    'Dr. Lena Morrow',
    'Dr. Ada Kim',
    '',
    ''
  ])
})

test('a bakery: five products kept of a six-column list take four columns, a count the grid draws whole', () => {
  const config = { items: { 'items[cols]': '6', 'items[title]': ['a', 'b', 'c', 'd', 'e', 'f'] } }
  const honesty = honestyOf('module-52', 'product', [['items']], ['items[title]'], [5])
  const { steps } = recordSteps({ honesty, modules: new Map([[52, { id: 52, params: acm(config) }]]) })
  assert.equal(configOf(steps, 52).items['items[cols]'], '4')
})

test('a list with no column setting, or with no fewer cards than its row, keeps its setting', () => {
  assert.equal(fitListColumns([{ 'quotes[title]': ['a', 'b'] }], 1), null)
  const row = { 'team[columns]': ['3'] }
  assert.equal(fitListColumns([row], 3), null)
  assert.deepEqual(row['team[columns]'], ['3'])
  assert.deepEqual(fitListColumns([{ columns: 4 }], 1), { key: 'columns', from: 4, to: 1 })
})
