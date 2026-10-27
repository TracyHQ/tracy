/**
 * The rules of the interface-language gate (`scripts/check-interface-languages.ts`, ticket #732),
 * driven through its pure half `scripts/lib/locale-ledger.mjs` with literal dictionaries:
 *
 *   - a key the language lacks, or has empty, is a `missing` gap; different `{placeholders}` are a
 *     `placeholder` gap; a namespace the language has no file for counts every key as missing;
 *   - a gap recorded in the ledger passes; one that is not is reported as added;
 *   - a ledger row that is no longer a gap is reported as paid;
 *   - striking removes paid rows and never adds a row.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compareLedger,
  countRows,
  findGaps,
  fingerprints,
  ledgerWarning,
  sourceFingerprint,
  staleSources,
  strikePaid
} from '../lib/locale-ledger.mjs'

const source = {
  shop: { buy: 'Buy', count: '{n} items', empty: 'Empty' },
  menu: { open: 'Open' }
}

test('missing, empty and placeholder gaps are found; a whitespace value is a translation; a namespace with no file is all missing', () => {
  const debt = findGaps(source, { shop: { buy: 'Kaufen', count: '{count} Artikel', empty: '' } })
  assert.deepEqual(debt, { missing: ['menu open', 'shop empty'], placeholder: ['shop count'] })
})

test('a complete language has no gaps', () => {
  const debt = findGaps(source, {
    shop: { buy: 'Kopen', count: '{n} artikelen', empty: 'Leeg' },
    menu: { open: 'Openen' }
  })
  assert.deepEqual(debt, { missing: [], placeholder: [] })
})

test('a gap in the ledger passes; a gap outside it is added', () => {
  const measured = { de: { missing: ['menu open', 'shop empty'], placeholder: [] } }
  const ledger = { de: { missing: ['shop empty'], placeholder: [] } }
  assert.deepEqual(compareLedger(measured, ledger), { added: ['de missing menu open'], paid: [] })
})

test('a ledger row that is no longer a gap is paid', () => {
  const measured = { vi: { missing: [], placeholder: [] } }
  const ledger = { vi: { missing: ['shop buy'], placeholder: ['shop count'] } }
  assert.deepEqual(compareLedger(measured, ledger), {
    added: [],
    paid: ['vi missing shop buy', 'vi placeholder shop count']
  })
})

test('a gap changing kind is both added and paid, so it cannot hide behind its old row', () => {
  const measured = { fr: { missing: [], placeholder: ['shop count'] } }
  const ledger = { fr: { missing: ['shop count'], placeholder: [] } }
  assert.deepEqual(compareLedger(measured, ledger), {
    added: ['fr placeholder shop count'],
    paid: ['fr missing shop count']
  })
})

test('striking removes paid rows and never adds a new gap', () => {
  const measured = { nl: { missing: ['menu open', 'shop new'], placeholder: [] } }
  const ledger = { nl: { missing: ['menu open', 'shop buy'], placeholder: [] } }
  const struck = strikePaid(measured, ledger)
  assert.deepEqual(struck, { nl: { missing: ['menu open'], placeholder: [] } })
  assert.deepEqual(countRows(struck), { nl: 1 })
})

test('an empty English string is translated by an empty one, not a gap', () => {
  const debt = findGaps({ chat: { sharedPrefix: '' } }, { chat: { sharedPrefix: '' } })
  assert.deepEqual(debt, { missing: [], placeholder: [] })
  assert.deepEqual(findGaps({ chat: { sharedPrefix: '' } }, {}).missing, ['chat sharedPrefix'])
})

test('a whitespace-only translation counts (French thousands separator)', () => {
  assert.deepEqual(findGaps({ chat: { groupSeparator: ',' } }, { chat: { groupSeparator: ' ' } }).missing, [])
})

test('a reworded English source is stale; a new one is unrecorded; a removed one is ignored', () => {
  const recorded = fingerprints({ shop: { buy: 'Buy', gone: 'Gone' } })
  const now = fingerprints({ shop: { buy: 'Buy now', fresh: 'Fresh' } })
  assert.deepEqual(staleSources(now, recorded), { reworded: ['shop buy'], unrecorded: ['shop fresh'] })
  assert.equal(sourceFingerprint('Buy'), sourceFingerprint('Buy'))
  assert.notEqual(sourceFingerprint('Buy'), sourceFingerprint('Buy now'))
})

test('an empty ledger is silent; a non-empty one names its row count loudly (#754)', () => {
  assert.equal(ledgerWarning({}), null)
  assert.equal(ledgerWarning({ vi: { missing: [], placeholder: [] } }), null)
  const warning = ledgerWarning({
    vi: { missing: ['ns a', 'ns b'], placeholder: [] },
    de: { missing: [], placeholder: ['ns c'] }
  })
  assert.match(warning ?? '', /holds 3 untranslated row\(s\) \{"vi":2,"de":1\}/)
  assert.match(warning ?? '', /^⚠⚠ /)
})
