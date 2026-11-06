// `stripEnd` (brief.mjs): a line of the brief without the spaces and stops it ends on. It reads from the end now
// (CodeQL polynomial-redos, release 2026-11-05): a long run of them inside a line no longer takes a pass per place.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripEnd } from '../domain/brief.mjs'

test('the spaces and stops a line ends on are taken off, as the old regex took them', () => {
  assert.equal(stripEnd('Padel and tennis coaching for all ages. '), 'Padel and tennis coaching for all ages')
  assert.equal(stripEnd('Fresh pasta – '), 'Fresh pasta')
  assert.equal(stripEnd('Dubai: open daily!!'), 'Dubai: open daily')
  assert.equal(stripEnd('  Coffee, cake'), 'Coffee, cake')
  assert.equal(stripEnd('...'), '')
  const old = (t) => t.replace(/[\s.!:;,–—-]+$/u, '').trim()
  const parts = [' ', '\t', '.', '!', ':', ';', ',', '–', '—', '-', 'a', '\u00e9', '😀']
  for (let i = 0; i < 2000; i++) {
    const s = Array.from({ length: i % 9 }, (_, k) => parts[(i * 7 + k * 13) % parts.length]).join('')
    assert.equal(stripEnd(s), old(s), JSON.stringify(s))
  }
})

test('a long run of tabs inside a line reads fast', () => {
  const t = performance.now()
  assert.equal(stripEnd(`a${'\t'.repeat(100_000)}x`).length, 100_002)
  assert.ok(performance.now() - t < 500)
})
