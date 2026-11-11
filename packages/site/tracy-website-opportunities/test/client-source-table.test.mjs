/**
 * The Sources table of the Workspace card (#537, option C): the State column of each row, the summary beside the
 * Sources title (counted from the same row states), and the Add source popover state.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-source-table.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ADD_SOURCE_CLOSED, addSourceLinkOf, addSourceStep } from '../src/client/add-source-model.ts'
import { sourceProgressOf, sourceStateOf, sourcesSummary } from '../src/client/source-table-model.ts'
import { en as STRINGS } from '../src/client/strings.ts'

const words = (parts) =>
  parts
    .map((p) =>
      'text' in p ? p.text : STRINGS[p.key].replace(/\{(\w+)\}/g, (_, n) => String(p.params?.[n] ?? `{${n}}`))
    )
    .join(' · ')

/** A row's State column as two lines joined by a slash. */
function cell(source) {
  const v = sourceStateOf(source, 'en-US')
  return [STRINGS[v.key], v.detail === null ? null : words([v.detail])].filter(Boolean).join(' / ')
}

/** The collected time the screen words relative to now (empty when the row has none). */
function collectedAt(source) {
  return sourceStateOf(source, 'en-US').collectedAt
}

test('before research every row waits, whatever it holds', () => {
  assert.equal(cell({ source: 'instagram', status: null }), 'Waiting for research')
  assert.equal(cell({ source: 'website' }), 'Waiting for research')
  assert.equal(sourceStateOf({ source: 'website' }, 'en-US').state, 'waiting')
})

test('a collected row reads Data processed, and carries the time its data was collected for the phrase beside the pill', () => {
  assert.equal(
    cell({ source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' }),
    'Data processed'
  )
  assert.equal(
    collectedAt({ source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' }),
    '2026-11-10T08:00:00Z'
  )
  assert.equal(
    collectedAt({ source: 'website', status: 'partial', collectedAt: '2026-11-09T23:30:00Z' }),
    '2026-11-09T23:30:00Z'
  )
  assert.equal(collectedAt({ source: 'website', status: 'complete', collectedAt: null }), null)
  assert.equal(collectedAt({ source: 'website', status: 'complete', collectedAt: 'not a date' }), null)
  assert.equal(cell({ source: 'website', status: 'complete', collectedAt: 'not a date' }), 'Data processed')
})

test('a failed row reads Could not collect, with the server reason only when it sends one the screen knows', () => {
  assert.equal(
    cell({ source: 'listing', status: 'failed', reason: 'login_required' }),
    'Could not collect / This page asks for a login'
  )
  assert.equal(
    cell({ source: 'website', status: 'skipped', reason: 'not_found' }),
    'Could not collect / Not found'
  )
  assert.equal(
    cell({ source: 'website', status: 'blocked', reason: 'URL_BLOCKED' }),
    'Could not collect / This address cannot be fetched'
  )
  // No reason, an unknown code, or a code that is not a reason: Could not collect alone, nothing made up.
  assert.equal(cell({ source: 'website', status: 'failed' }), 'Could not collect')
  assert.equal(cell({ source: 'website', status: 'failed', reason: 'SOMETHING_NEW' }), 'Could not collect')
  assert.equal(cell({ source: 'website', status: 'failed', reason: 'not_collected' }), 'Could not collect')
})

test('a row with no outcome waits for research: sources are fixed once research starts, so no link is new after it', () => {
  assert.equal(cell({ source: 'facebook', status: null }), 'Waiting for research')
  assert.equal(sourceStateOf({ source: 'facebook', status: null }, 'en-US').state, 'waiting')
  assert.equal(STRINGS['source.state.new'], undefined)
})

const researchItems = (items) => ({ step: 'research', items })

test('while research runs, the band item with the row source key makes it Reading now, Collected or Could not collect', () => {
  const progress = sourceProgressOf(
    researchItems([
      { key: 'google-places', label: 'Google Places', state: 'done' },
      { key: 'instagram', label: 'Instagram', state: 'running' },
      { key: 'website', label: 'Website', state: 'waiting' },
      { key: 'facebook', label: 'Facebook', state: 'failed' }
    ]),
    true
  )
  const state = (source) => sourceStateOf({ source, status: null }, 'en-US', progress)
  assert.equal(state('instagram').state, 'reading')
  assert.equal(STRINGS[state('instagram').key], 'Reading now')
  assert.equal(state('google-places').state, 'collected')
  assert.equal(state('google-places').detail, null)
  assert.equal(state('facebook').state, 'failed')
  // Waiting item, or no item for the row: Waiting for research.
  assert.equal(state('website').state, 'waiting')
  assert.equal(state('tiktok').state, 'waiting')
})

test('the band items count only while research runs, for the research step, and never override a read outcome', () => {
  const items = [{ key: 'instagram', label: 'Instagram', state: 'running' }]
  assert.equal(sourceProgressOf(researchItems(items), false).size, 0)
  assert.equal(sourceProgressOf({ step: 'brief', items }, true).size, 0)
  assert.equal(sourceProgressOf(null, true).size, 0)
  const progress = sourceProgressOf(researchItems(items), true)
  const done = { source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' }
  assert.equal(sourceStateOf(done, 'en-US', progress).state, 'collected')
  assert.equal(sourceStateOf({ source: 'instagram', status: null }, 'en-US', progress).state, 'reading')
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
  assert.equal(sum(['collected'], { researchedAt: null }), '1 of 1 read')
})

test('the summary and the rows agree for one payload', () => {
  const rows = [
    { source: 'google-places', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' },
    { source: 'instagram', status: 'complete', collectedAt: '2026-11-10T08:00:00Z' },
    { source: 'listing', status: 'failed', reason: 'login_required' }
  ]
  const states = rows.map((r) => sourceStateOf(r, 'en-US').state)
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
  assert.deepEqual(s, { open: true, url: '', checkingSince: null, error: null, notice: null })
  // An empty field sends nothing and says why.
  assert.equal(addSourceLinkOf(s), null)
  s = addSourceStep(s, { type: 'submit', at: 0 })
  assert.equal(s.error.key, 'source.add.error.INVALID_URL')
  assert.equal(s.checkingSince, null)
  // Typing clears the refusal; Add sends the trimmed link and waits.
  s = addSourceStep(s, { type: 'type', url: '  https://www.instagram.com/sample_kite_club ' })
  assert.equal(s.error, null)
  assert.equal(addSourceLinkOf(s), 'https://www.instagram.com/sample_kite_club')
  s = addSourceStep(s, { type: 'submit', at: 1000 })
  assert.equal(s.checkingSince, 1000)
  assert.equal(addSourceLinkOf(s), null)
  assert.deepEqual(addSourceStep(s, { type: 'submit', at: 1200 }), s)
  // A refusal stays in the popover with the typed link.
  const refusal = { key: 'source.add.error.SOURCE_ALREADY_KNOWN' }
  const refused = addSourceStep(s, { type: 'done', refusal })
  assert.deepEqual(refused, {
    open: true,
    url: '  https://www.instagram.com/sample_kite_club ',
    checkingSince: null,
    error: refusal,
    notice: null
  })
  // Added: the popover closes, forgets the link and leaves the added notice.
  assert.deepEqual(addSourceStep(s, { type: 'done', refusal: null }), {
    ...ADD_SOURCE_CLOSED,
    notice: { phase: 'added', url: 'https://www.instagram.com/sample_kite_club', platform: 'instagram' }
  })
})

test('Escape, Cancel or a press outside close the popover; an answer after closing reads on the notice', () => {
  const open = addSourceStep(ADD_SOURCE_CLOSED, { type: 'open' })
  const typed = addSourceStep(open, { type: 'type', url: 'https://sample-kite.example' })
  assert.deepEqual(addSourceStep(typed, { type: 'close' }), ADD_SOURCE_CLOSED)
  assert.deepEqual(addSourceStep(typed, { type: 'toggle' }), ADD_SOURCE_CLOSED)
  const busy = addSourceStep(typed, { type: 'submit', at: 0 })
  const closed = addSourceStep(busy, { type: 'close' })
  assert.deepEqual(closed.notice, { phase: 'pending', url: 'https://sample-kite.example' })
  const refusal = { key: 'source.add.error.INVALID_URL' }
  assert.deepEqual(addSourceStep(closed, { type: 'done', refusal }).notice, {
    phase: 'failed',
    url: 'https://sample-kite.example',
    error: refusal
  })
  assert.equal(addSourceStep(closed, { type: 'done', refusal }).open, false)
  assert.deepEqual(addSourceStep(ADD_SOURCE_CLOSED, { type: 'type', url: 'x' }), ADD_SOURCE_CLOSED)
})
