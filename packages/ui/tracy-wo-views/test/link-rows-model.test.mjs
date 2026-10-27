/**
 * The link rows of "add a business by its links": a paste of several links spreads into rows, the x empties a ready
 * row or drops an extra one, and every row is judged by the shared classifier, the server's reason winning.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addRow,
  judgeRows,
  linksOf,
  removable,
  removeRow,
  rowsOf,
  sourceNames,
  spreadPaste,
  summaryOf
} from '../src/link-rows-model.ts'

const GOOGLE = 'https://share.google/hscFakeLink01'
const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Coach/store/1000001'
const INSTAGRAM = 'https://www.instagram.com/harbour.sportclub?mdxt=Z204'

test('three ready rows; links are the filled rows in order', () => {
  assert.deepEqual(rowsOf(), ['', '', ''])
  assert.deepEqual(linksOf([' a.ae ', '', 'b.ae']), ['a.ae', 'b.ae'])
})

test('a paste of several links spreads one per row and keeps the words as the name', () => {
  const spread = spreadPaste(['', '', ''], 0, `Harbour Sport Club\n${GOOGLE}\n${MAGICPIN} ${INSTAGRAM}`)
  assert.deepEqual(spread, { rows: [GOOGLE, MAGICPIN, INSTAGRAM], name: 'Harbour Sport Club' })
})

test('a spread into a later row keeps the rows already filled', () => {
  const spread = spreadPaste([GOOGLE, '', ''], 1, `${MAGICPIN}, ${INSTAGRAM}`)
  assert.deepEqual(spread?.rows, [GOOGLE, MAGICPIN, INSTAGRAM])
})

test('one pasted link is a plain paste', () => {
  assert.equal(spreadPaste(['', '', ''], 0, GOOGLE), null)
  assert.equal(spreadPaste(['', '', ''], 0, 'Harbour Sport Club'), null)
})

test('rows grow to five; the x empties a ready row and drops an extra one', () => {
  let rows = rowsOf([GOOGLE])
  rows = addRow(addRow(addRow(rows)))
  assert.equal(rows.length, 5)
  assert.deepEqual(removeRow(rows, 4), [GOOGLE, '', '', ''])
  assert.deepEqual(removeRow(rowsOf([GOOGLE]), 0), ['', '', ''])
  assert.equal(removable(rowsOf([GOOGLE]), 1), false)
  assert.equal(removable(rowsOf([GOOGLE]), 0), true)
  assert.equal(removable(['', '', '', ''], 3), true)
})

test('rows are judged by the shared classifier', () => {
  const views = judgeRows([GOOGLE, 'instagram.com/harbour.sportclub/', INSTAGRAM, 'not a link'])
  assert.equal(views[0].group, 'google')
  assert.equal(views[1].group, 'social')
  assert.equal(views[2].reason, 'duplicate')
  assert.equal(views[3].reason, 'invalid')
  assert.deepEqual(summaryOf(views), { filled: 4, used: 2, leftOut: 1, twice: 1 })
  assert.equal(judgeRows([MAGICPIN, ''])[0].source, 'magicpin')
  assert.equal(judgeRows([MAGICPIN, ''])[1], null)
})

test('the server reason wins where it differs', () => {
  const views = judgeRows([GOOGLE, '', INSTAGRAM], [{ used: false, reason: 'unresolvable' }, { used: true }])
  assert.equal(views[0].reason, 'unresolvable')
  assert.equal(views[0].used, false)
  assert.equal(views[2].used, true)
  assert.deepEqual(summaryOf(views), { filled: 2, used: 1, leftOut: 1, twice: 0 })
})

test('the sources a research reads, once each', () => {
  assert.deepEqual(sourceNames([GOOGLE, MAGICPIN, INSTAGRAM, 'harboursport.example']), [
    'Google',
    'magicpin',
    'Instagram',
    'website'
  ])
})

test('leftOutOf: the links a successful add did not use, with their reason; twice-pasted ones are used', async () => {
  const { leftOutOf } = await import('../src/link-rows-model.ts')
  assert.deepEqual(
    leftOutOf([
      { url: 'https://share.google/x', kind: 'google', used: false, reason: 'unresolvable' },
      { url: 'https://magicpin.com/a', kind: 'listing', used: true },
      { url: 'https://magicpin.com/a', used: false, reason: 'duplicate' },
      { url: 'https://instagram.com/club', used: true }
    ]),
    [{ url: 'https://share.google/x', reason: 'unresolvable' }]
  )
  assert.deepEqual(leftOutOf(undefined), [])
  assert.deepEqual(leftOutOf([{ url: 'https://a.example', used: false }]), [
    { url: 'https://a.example', reason: 'invalid' }
  ])
})
