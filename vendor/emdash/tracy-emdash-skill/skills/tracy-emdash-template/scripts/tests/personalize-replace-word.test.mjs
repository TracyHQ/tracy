// A `replace` rule is a plain substring unless it says `word: true`: found while porting JA Restaurant, where the demo
// brand "RES" also rewrote RESERVATIONS and FRESH BEER.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameRulesOf, replaceDeep } from '../tools/personalize.mjs'

const data = { title: 'RES Bar & Restaurant', body: 'RESERVATIONS open. FRESH BEER at RES, daily. (RES)', url: '/res' }

test('a plain rule replaces every occurrence, inside longer words too (the old behaviour is unchanged)', () => {
  const { rules } = nameRulesOf({ replace: [{ find: 'RES', with: 'Oak' }] }, {})
  assert.equal(replaceDeep(data, rules).body, 'OakERVATIONS open. FOakH BEER at Oak, daily. (Oak)')
})

test('word: true leaves RESERVATIONS and FRESH alone and still takes RES at a boundary', () => {
  const { rules } = nameRulesOf({ replace: [{ find: 'RES', with: 'Oak', word: true }] }, {})
  const out = replaceDeep(data, rules)
  assert.equal(out.body, 'RESERVATIONS open. FRESH BEER at Oak, daily. (Oak)')
  assert.equal(out.title, 'Oak Bar & Restaurant')
  assert.equal(out.url, '/res', 'an address key is still untouched')
})

test('a find with regex characters is matched literally', () => {
  const { rules } = nameRulesOf({ replace: [{ find: 'A.B', with: 'x', word: true }] }, {})
  assert.equal(replaceDeep('A.B and AxB', rules), 'x and AxB')
})
