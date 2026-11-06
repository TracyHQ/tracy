// BRAND-3's judge (src/brand-check.mjs): what a brand-mode run on a built site breaks of the door's three
// promises: accent words read at 4.5:1 in the brand's own hue, accent fills stand out at 3:1, no template
// accent left. The rows below are the JA Boxing 1.0.10 measurements of 02/11/2026, before and after the
// page shift that keeps the hue.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND_MEASUREMENT_SCHEMA, judgeBrandMeasurement, keepsHue } from '../src/brand-check.mjs'

const run = (/** @type {any} */ spot) => ({
  id: 'brand:121111--042515',
  accent: '#042515',
  side: 'dark',
  page: '/',
  spots: [{ scope: 'page', words: [], fills: [], left: [], ...spot }]
})
const doc = (/** @type {any[]} */ runs) => ({ schema: BRAND_MEASUREMENT_SCHEMA, version: '1.0.10', runs })

test('accent words in the body text grey lose the brand hue, even when they read', () => {
  assert.equal(keepsHue('#757d85', '#042515'), false)
  assert.equal(keepsHue('#6d8177', '#042515'), true)
  assert.equal(keepsHue('#6d767c', '#a78f45'), false)
  assert.equal(keepsHue('#7d6c36', '#a78f45'), true)
  const j = judgeBrandMeasurement(
    doc([run({ words: [{ text: 'Form', colour: '#757d85', ground: '#121111', ratio: 4.51, need: 4.5 }] })])
  )
  assert.equal(j.ok, false)
  assert.match(j.findings[0], /lost the brand hue of #042515/)
})

test('a fill under 3:1 on its ground is a finding (moss #042515 on #121111)', () => {
  const j = judgeBrandMeasurement(
    doc([
      run({ fills: [{ el: 'button.btn.btn-primary', colour: '#042515', ground: '#121111', ratio: 1.15 }] })
    ])
  )
  assert.deepEqual(j.findings, [
    'brand:121111--042515 dark /: button.btn.btn-primary filled #042515 on #121111 stands out 1.15:1 (need 3:1)'
  ])
})

test('words under their need, and a template accent left, are findings; a clean run passes', () => {
  const bad = judgeBrandMeasurement(
    doc([
      run({
        scope: '.acm-cta',
        words: [{ text: 'Join', colour: '#2a5a40', ground: '#121111', ratio: 2.1, need: 4.5 }],
        left: [{ el: 'path', prop: 'fill', value: '#f44141' }]
      })
    ])
  )
  assert.equal(bad.findings.length, 2)
  assert.match(bad.findings[1], /\.acm-cta: path still paints the template accent #f44141/)
  const good = judgeBrandMeasurement(
    doc([
      run({
        words: [{ text: 'Form', colour: '#6d8177', ground: '#121111', ratio: 4.54, need: 4.5 }],
        fills: [{ el: 'button', colour: '#4f665b', ground: '#121111', ratio: 3.04 }]
      })
    ])
  )
  assert.deepEqual(good, { ok: true, findings: [], runs: 1, problem: null })
})

test('a file that is not a brand measurement cannot be scored', () => {
  assert.match(String(judgeBrandMeasurement({ schema: 'x' }).problem), /tracy-brand-measurement\/v1/)
})
