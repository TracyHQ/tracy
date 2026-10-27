/**
 * The preview probe fails the URLs a template's contract names in `measureBlock`, as the built-site run does
 * (`scripts/preview-check/measure-block.mjs`): JA Restaurant 1.0.6's OpenTable script held the live frame's home
 * page at readyState `loading` and no page after it was measured (20/10/2026).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadContract } from '../../../packages/design/tracy-ds-slot/src/library.mjs'
import { measureBlockOf } from '../scripts/preview-check/measure-block.mjs'

test("JA Restaurant's contract blocks OpenTable's parser-blocking script", () => {
  const block = measureBlockOf([loadContract('joomla-ja-restaurant')])
  assert.ok(block.includes('*opentable.com/*'), JSON.stringify(block))
})

test('every contract is read, each pattern once, and anything but a non-empty string is left out', () => {
  assert.deepEqual(
    measureBlockOf([
      { measureBlock: ['*a.com/*', '', 7, '*b.com/*'] },
      null,
      {},
      { measureBlock: 'not a list' },
      { measureBlock: ['*b.com/*', '*c.com/*'] }
    ]),
    ['*a.com/*', '*b.com/*', '*c.com/*']
  )
  assert.deepEqual(measureBlockOf([]), [])
})
