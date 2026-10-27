// What the Profile card may save for one opportunity (#1791): an on/off choice per fact and the key message picks.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FACT_OVERRIDES_MAX,
  mergeKeyMessagePicks,
  nextFactOverrides,
  readFactOverride,
  readKeyMessagePicks
} from '../src/owner-fact-picks.js'

const AT = '2026-10-27T10:00:00.000Z'

test('a fact override is a known-looking fact id and true, false or null', () => {
  assert.deepEqual(readFactOverride({ factId: 'fact_ab12', onSite: false }), {
    factId: 'fact_ab12',
    onSite: false
  })
  assert.deepEqual(readFactOverride({ factId: 'fact_ab12', onSite: null }), {
    factId: 'fact_ab12',
    onSite: null
  })
  assert.equal(readFactOverride({ factId: 'fact ab', onSite: true }).error, 'INVALID_FACT')
  assert.equal(readFactOverride({ factId: 'x'.repeat(300), onSite: true }).error, 'INVALID_FACT')
  assert.equal(readFactOverride({ factId: 'fact_ab12', onSite: 'yes' }).error, 'INVALID_ON_SITE')
  assert.equal(readFactOverride({ factId: 'fact_ab12' }).error, 'INVALID_ON_SITE')
})

test('setting and clearing overrides keeps every other fact, a gone one included', () => {
  const held = { fact_gone: { onSite: true, at: '2026-10-01T00:00:00.000Z' } }
  const on = nextFactOverrides(held, 'fact_rating', true, AT)
  assert.deepEqual(on, { fact_gone: held.fact_gone, fact_rating: { onSite: true, at: AT } })
  const cleared = nextFactOverrides(on, 'fact_rating', null, AT)
  assert.deepEqual(cleared, { fact_gone: held.fact_gone })
  assert.deepEqual(nextFactOverrides(null, 'fact_a', false, AT), { fact_a: { onSite: false, at: AT } })
})

test('key message picks: remove, reorder and relabel only, cleaned', () => {
  const picks = readKeyMessagePicks({
    removed: ['km_3'],
    order: ['km_2', 'km_1'],
    labels: { km_1: '  European   coaches ' }
  })
  assert.deepEqual(picks, {
    removed: ['km_3'],
    order: ['km_2', 'km_1'],
    labels: { km_1: 'European coaches' }
  })
  assert.deepEqual(readKeyMessagePicks({}), { removed: [], order: [], labels: {} })
})

test('key message picks refuse what is not a pick', () => {
  for (const bad of [
    null,
    { removed: 'km_1' },
    { order: ['km_1', 'km_1'] },
    { order: ['bad id'] },
    { labels: { km_1: '   ' } },
    { labels: { km_1: 'x'.repeat(61) } },
    { labels: { km_1: 7 } },
    { removed: Array.from({ length: 51 }, (_, i) => `km_${i}`) },
    { factRefs: ['fact_1'] },
    { quotes: ['changed words'] }
  ])
    assert.equal(readKeyMessagePicks(bad).error, 'INVALID_KEY_MESSAGES', JSON.stringify(bad))
})

test('a label of 60 characters is kept, 61 is refused', () => {
  assert.equal(readKeyMessagePicks({ labels: { km_1: 'x'.repeat(60) } }).labels.km_1.length, 60)
})

test('a save merges into the stored picks: removals stay, labels not sent stay, order replaces', () => {
  const held = { removed: ['km_a'], order: ['km_b', 'km_c'], labels: { km_b: 'Beta renamed' }, at: AT }
  const merged = mergeKeyMessagePicks(held, {
    removed: [],
    order: ['km_c', 'km_b'],
    labels: { km_c: 'Gamma 2' }
  })
  assert.deepEqual(merged, {
    removed: ['km_a'],
    order: ['km_c', 'km_b'],
    labels: { km_b: 'Beta renamed', km_c: 'Gamma 2' }
  })
  assert.deepEqual(mergeKeyMessagePicks(null, { removed: ['km_x'], order: [], labels: {} }), {
    removed: ['km_x'],
    order: [],
    labels: {}
  })
})

test('fact overrides are capped', () => {
  const held = Object.fromEntries(
    Array.from({ length: FACT_OVERRIDES_MAX }, (_, i) => [`fact_${i}`, { onSite: true }])
  )
  assert.throws(() => nextFactOverrides(held, 'fact_new', true, AT), { code: 'TOO_MANY_FACT_OVERRIDES' })
  assert.ok(nextFactOverrides(held, 'fact_1', false, AT).fact_1.onSite === false)
  assert.ok(!('fact_2' in nextFactOverrides(held, 'fact_2', null, AT)))
})
