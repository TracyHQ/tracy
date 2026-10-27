import assert from 'node:assert/strict'
import { test } from 'node:test'
import { en } from '../src/i18n/ns/invitations-real.ts'
import {
  andList,
  contentStatusLabel,
  draftProgress,
  localTime,
  templateNotes
} from '../src/invitations/real-format.ts'

/** The English the screens read without a provider, filled the way `t` fills it. */
const t = (key, params = {}) =>
  (en[key] ?? key).replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all))

test('template notes name what cleaning removed instead of showing a bare code', () => {
  assert.deepEqual(
    templateNotes(
      t,
      ['ZIP_METADATA_IGNORED', 'HTML_CONTENT_REMOVED'],
      [
        { item: '<meta> element', count: 1 },
        { item: 'onclick attribute', count: 2 }
      ]
    ),
    [
      'macOS metadata in the ZIP (.DS_Store, __MACOSX) was ignored.',
      'Removed while cleaning the HTML: <meta> element, onclick attribute (2).'
    ]
  )
  assert.deepEqual(templateNotes(t, ['HTML_CONTENT_REMOVED']), ['Some HTML was removed while cleaning.'])
  assert.deepEqual(templateNotes(t, ['SOMETHING_NEW']), ['SOMETHING_NEW'])
})

test('times read in the viewer locale, and an unreadable value is shown as given', () => {
  const shown = localTime('2026-10-12T03:10:01.018Z', 'en-GB')
  assert.ok(!shown.includes('T03:10'))
  assert.match(shown, /2026/)
  assert.equal(localTime('not a date'), 'not a date')
})

test('content states and draft progress read as sentences', () => {
  assert.equal(contentStatusLabel(t, 'not_created'), 'No draft yet')
  assert.equal(contentStatusLabel(t, 'approved'), 'Content approved')
  assert.equal(contentStatusLabel(t, 'from_the_future'), 'from_the_future')
  assert.equal(
    draftProgress(t, { total: 318, drafted: 100 }),
    '100 of 318 recipients in this group have a draft.'
  )
  assert.equal(
    draftProgress(t, { total: 318, drafted: 318 }),
    'All 318 recipients in this group have a draft.'
  )
  assert.equal(draftProgress(t, { total: 0, drafted: 0 }), 'No recipients in this group.')
})

test('lists of missing settings join with the language word for and', () => {
  assert.equal(andList(t, ['A', 'B', 'C']), 'A and B and C')
  assert.equal(andList(t, ['A']), 'A')
  assert.equal(andList(t, []), '')
})
