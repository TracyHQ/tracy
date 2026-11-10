/**
 * The Sources table of the Workspace card (#537, option C): the State column of each row, the summary beside the
 * Sources title (counted from the same row states), and the Add source popover state.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-source-table.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ADD_SOURCE_CLOSED, addSourceLinkOf, addSourceStep } from '../src/client/add-source-model.ts'
import { sourceStateOf, sourcesSummary } from '../src/client/source-table-model.ts'
import { en as STRINGS } from '../src/client/strings.ts'

const words = (parts) =>
  parts
    .map((p) =>
      'text' in p ? p.text : STRINGS[p.key].replace(/\{(\w+)\}/g, (_, n) => String(p.params?.[n] ?? `{${n}}`))
    )
    .join(' · ')

/** A row's State column as two lines joined by a slash. */
function cell(source, researched) {
  const v = sourceStateOf(source, researched, 'en-US')
  return [STRINGS[v.key], v.detail === null ? null : words([v.detail])].filter(Boolean).join(' / ')
}

test('before research every row waits, whatever it holds', () => {
  assert.equal(cell({ source: 'instagram', status: null }, false), 'Waiting for research')
  assert.equal(cell({ source: 'website' }, false), 'Waiting for research')
  assert.equal(sourceStateOf({ source: 'website' }, false, 'en-US').state, 'waiting')
})

test('a collected row reads Collected, with the day its data was collected on the second line', () => {
  assert.equal(
    cell({ source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' }, true),
    'Collected / Nov 10'
  )
  assert.equal(
    cell({ source: 'website', status: 'partial', collectedAt: '2026-11-09T23:30:00Z' }, true),
    'Collected / Nov 9'
  )
  assert.equal(cell({ source: 'website', status: 'complete', collectedAt: null }, true), 'Collected')
  assert.equal(cell({ source: 'website', status: 'complete', collectedAt: 'not a date' }, true), 'Collected')
})

test('a failed row reads Could not collect, with the server reason only when it sends one the screen knows', () => {
  assert.equal(
    cell({ source: 'listing', status: 'failed', reason: 'login_required' }, true),
    'Could not collect / This page asks for a login'
  )
  assert.equal(
    cell({ source: 'website', status: 'skipped', reason: 'not_found' }, true),
    'Could not collect / Not found'
  )
  assert.equal(
    cell({ source: 'website', status: 'blocked', reason: 'URL_BLOCKED' }, true),
    'Could not collect / This address cannot be fetched'
  )
  // No reason, an unknown code, or a code that is not a reason: Could not collect alone, nothing made up.
  assert.equal(cell({ source: 'website', status: 'failed' }, true), 'Could not collect')
  assert.equal(
    cell({ source: 'website', status: 'failed', reason: 'SOMETHING_NEW' }, true),
    'Could not collect'
  )
  assert.equal(
    cell({ source: 'website', status: 'failed', reason: 'not_collected' }, true),
    'Could not collect'
  )
})

test('a row with no outcome after research is a link added since', () => {
  assert.equal(cell({ source: 'facebook', status: null }, true), 'New, waiting for research')
  assert.equal(sourceStateOf({ source: 'facebook', status: null }, true, 'en-US').state, 'new')
})

test('the summary counts the same row states the table draws', () => {
  const base = { researchedAt: '2026-11-10T08:00:00Z', locale: 'en-US' }
  const sum = (states, extra) =>
    words(sourcesSummary({ states, researchDone: true, researchMoving: false, ...base, ...extra }))
  assert.equal(
    sum(['waiting', 'waiting', 'waiting'], { researchDone: false }),
    '0 of 3 read · research not run yet'
  )
  assert.equal(
    sum(['waiting', 'waiting', 'waiting'], { researchMoving: true }),
    '0 of 3 read · research running'
  )
  assert.equal(sum(['collected', 'collected', 'failed']), '2 of 3 read · Nov 10')
  assert.equal(sum(['collected', 'collected', 'failed', 'new']), '2 of 4 read · 1 new link, research again')
  assert.equal(sum(['collected', 'new', 'new']), '1 of 3 read · 2 new links, research again')
  assert.equal(sum(['collected'], { researchedAt: null }), '1 of 1 read')
})

test('the summary and the rows agree for one payload', () => {
  const rows = [
    { source: 'google-places', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' },
    { source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' },
    { source: 'listing', status: 'failed', reason: 'login_required' }
  ]
  const states = rows.map((r) => sourceStateOf(r, true, 'en-US').state)
  assert.deepEqual(states, ['collected', 'collected', 'failed'])
  assert.equal(
    words(
      sourcesSummary({
        states,
        researchDone: true,
        researchMoving: false,
        researchedAt: '2026-11-10T08:00:00Z',
        locale: 'en-US'
      })
    ),
    '2 of 3 read · Nov 10'
  )
})

test('the Add source popover opens, closes, and keeps the refusal under the field', () => {
  let s = addSourceStep(ADD_SOURCE_CLOSED, { type: 'toggle' })
  assert.deepEqual(s, { open: true, url: '', busy: false, error: null })
  // An empty field sends nothing and says why.
  assert.equal(addSourceLinkOf(s), null)
  s = addSourceStep(s, { type: 'submit' })
  assert.equal(s.error, 'INVALID_URL')
  assert.equal(s.busy, false)
  // Typing clears the refusal; Add sends the trimmed link and waits.
  s = addSourceStep(s, { type: 'type', url: '  https://www.instagram.com/sample_kite_club ' })
  assert.equal(s.error, null)
  assert.equal(addSourceLinkOf(s), 'https://www.instagram.com/sample_kite_club')
  s = addSourceStep(s, { type: 'submit' })
  assert.equal(s.busy, true)
  assert.equal(addSourceLinkOf(s), null)
  assert.deepEqual(addSourceStep(s, { type: 'submit' }), s)
  // A refusal stays in the popover with the typed link.
  const refused = addSourceStep(s, { type: 'done', code: 'SOURCE_ALREADY_KNOWN' })
  assert.deepEqual(refused, {
    open: true,
    url: '  https://www.instagram.com/sample_kite_club ',
    busy: false,
    error: 'SOURCE_ALREADY_KNOWN'
  })
  // Added: the popover closes and forgets the link.
  assert.deepEqual(addSourceStep(s, { type: 'done', code: null }), ADD_SOURCE_CLOSED)
})

test('Escape, Cancel or a press outside close the popover; an answer after closing keeps it closed', () => {
  const open = addSourceStep(ADD_SOURCE_CLOSED, { type: 'open' })
  const typed = addSourceStep(open, { type: 'type', url: 'https://sample-kite.example' })
  assert.deepEqual(addSourceStep(typed, { type: 'close' }), ADD_SOURCE_CLOSED)
  assert.deepEqual(addSourceStep(typed, { type: 'toggle' }), ADD_SOURCE_CLOSED)
  const busy = addSourceStep(typed, { type: 'submit' })
  const closed = addSourceStep(busy, { type: 'close' })
  assert.deepEqual(addSourceStep(closed, { type: 'done', code: 'INVALID_URL' }), ADD_SOURCE_CLOSED)
  assert.deepEqual(addSourceStep(ADD_SOURCE_CLOSED, { type: 'type', url: 'x' }), ADD_SOURCE_CLOSED)
})
