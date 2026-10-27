#!/usr/bin/env node
/**
 * Which columns the table draws and in what order (`src/table-columns.ts`), and what a click on a
 * row does (`src/row-click.ts`).
 *
 *   node --test packages/ui/tracy-wo-views/test/table-columns.test.mjs
 *
 * Find places passes neither `columns` nor a `position`, so its table must stay exactly as before.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rowClickHandler } from '../src/row-click.ts'
import { tableColumns, typeColumnShown } from '../src/table-columns.ts'

const extra = (id, position) => ({ id, header: id, cell: () => null, ...(position ? { position } : {}) })
const ids = (slots) => slots.map((s) => (s.kind === 'built-in' ? s.id : `+${s.column.id}`))

test('Find: every built-in column in table order, the hidden ones left out, extras after them', () => {
  const slots = tableColumns({ hidden: new Set(['type', 'contact']), extraColumns: [extra('a'), extra('b')] })
  assert.deepEqual(ids(slots), ['score', 'web', 'google', 'social', 'status', '+a', '+b'])
})

test('position start puts an extra right after Place; end (and no position) after the built-ins', () => {
  const slots = tableColumns({
    hidden: new Set(),
    columns: ['web', 'google'],
    extraColumns: [extra('status', 'end'), extra('research', 'start'), extra('action')]
  })
  assert.deepEqual(ids(slots), ['+research', 'web', 'google', '+status', '+action'])
})

test('after puts an extra right behind that built-in, and in its place when the built-in is hidden', () => {
  const demo = { ...extra('demo'), after: 'web' }
  const shown = tableColumns({
    hidden: new Set(),
    columns: ['web', 'google', 'contact'],
    extraColumns: [demo]
  })
  assert.deepEqual(ids(shown), ['web', '+demo', 'google', 'contact'])
  const webHidden = tableColumns({
    hidden: new Set(['web']),
    columns: ['web', 'google', 'contact'],
    extraColumns: [extra('r', 'start'), demo]
  })
  assert.deepEqual(ids(webHidden), ['+r', '+demo', 'google', 'contact'])
})

test('columns restricts the built-ins that exist at all, in table order whatever order it is given in', () => {
  const slots = tableColumns({ hidden: new Set(['google']), columns: ['contact', 'web', 'google', 'social'] })
  assert.deepEqual(ids(slots), ['web', 'social', 'contact'])
  assert.deepEqual(ids(tableColumns({ hidden: new Set(), columns: [] })), [])
})

test('the place line names the type whenever the Type column is not drawn', () => {
  assert.equal(typeColumnShown({ hidden: new Set() }), true)
  assert.equal(typeColumnShown({ hidden: new Set(['type']) }), false)
  assert.equal(typeColumnShown({ hidden: new Set(), columns: ['web', 'google'] }), false)
  assert.equal(typeColumnShown({ hidden: new Set(), columns: ['type', 'web'] }), true)
})

function spyActions(withOpen) {
  const calls = []
  const actions = { onToggle: (key) => calls.push(['toggle', key]) }
  if (withOpen) actions.onOpen = (row) => calls.push(['open', row.key])
  return { actions, calls }
}
const row = { key: 'google-places:x' }

test('a row click toggles the selection by default (Find)', () => {
  const { actions, calls } = spyActions(true)
  rowClickHandler(undefined, row, actions)()
  rowClickHandler('toggle', row, actions)()
  assert.deepEqual(calls, [
    ['toggle', row.key],
    ['toggle', row.key]
  ])
})

test('rowClick open opens the row and leaves the selection alone; without onOpen it still toggles', () => {
  const open = spyActions(true)
  rowClickHandler('open', row, open.actions)()
  assert.deepEqual(open.calls, [['open', row.key]])
  const none = spyActions(false)
  rowClickHandler('open', row, none.actions)()
  assert.deepEqual(none.calls, [['toggle', row.key]])
})
