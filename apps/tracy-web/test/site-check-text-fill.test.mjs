// The site check's `text-fill` measure (ADR 0044, 2026-11-04): a block printing far less or far more text than the same block on the
// untouched demo, and a list with half the demo's items or items twice as long, are warnings on step 6, once per block for the whole
// run. Silent when the baseline holds no block text. Pages and numbers are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { textBlocksFromHost } from '../src/site-check/demo-baseline.js'
import { findTextFill } from '../src/site-check/page-measures.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'

const demo = [
  { page: '/', width: 1440, selector: 'section.steps', chars: 400 },
  { page: '/', width: 390, selector: 'section.steps', chars: 400 },
  { page: '/', width: 1440, selector: 'ul.points', chars: 150, items: [20, 30, 25, 35, 40] },
  { page: '/', width: 1440, selector: 'div.card', chars: 100 },
  { page: '/', width: 1440, selector: 'div.card', chars: 90 }
]
const at = (width, textBlocks) => ({ path: '/', width, textBlocks })

test('a block at 50% or at 130% of its demo text warns, one line per block for the run', () => {
  const low = findTextFill(
    [
      at(1440, [{ selector: 'section.steps', chars: 200 }]),
      at(390, [{ selector: 'section.steps', chars: 200 }])
    ],
    demo
  )
  assert.equal(low.length, 1, 'both widths are one block')
  assert.match(low[0].reason, /200 characters, 50% of the 400/)
  const high = findTextFill([at(1440, [{ selector: 'section.steps', chars: 520 }])], demo)
  assert.match(high[0].reason, /130% of the 400/)
  assert.deepEqual(findTextFill([at(1440, [{ selector: 'section.steps', chars: 380 }])], demo), [])
})

test('silent without a baseline, for a block the demo does not hold, and for a selector a page holds twice', () => {
  assert.deepEqual(findTextFill([at(1440, [{ selector: 'section.steps', chars: 10 }])], []), [])
  assert.deepEqual(findTextFill([at(1440, [{ selector: 'section.steps', chars: 10 }])]), [])
  assert.deepEqual(findTextFill([at(1440, [{ selector: 'section.other', chars: 10 }])], demo), [])
  assert.deepEqual(findTextFill([at(1440, [{ selector: 'div.card', chars: 10 }])], demo), [])
})

test('a list with half the demo items, or items twice as long, warns', () => {
  const few = findTextFill([at(1440, [{ selector: 'ul.points', chars: 130, items: [60, 70] }])], demo)
  assert.match(few[0].reason, /2 items where the template's demo shows 5/)
  const long = findTextFill([at(1440, [{ selector: 'ul.points', chars: 145, items: [60, 65, 70] }])], demo)
  assert.match(long[0].reason, /65 characters \(median\), 2\.2 times the template demo's 30/)
  assert.deepEqual(
    findTextFill([at(1440, [{ selector: 'ul.points', chars: 140, items: [22, 28, 30, 33] }])], demo),
    []
  )
})

test('the baseline keeps the host text blocks, and the group is a warning on step 6', () => {
  const kept = textBlocksFromHost([
    {
      path: '/',
      width: 1440,
      textBlocks: [
        { selector: 'ul.points', chars: 150, items: [20, 30] },
        { selector: 'p', chars: 0 }
      ]
    },
    { path: '/about', width: 390 }
  ])
  assert.deepEqual(kept, [{ page: '/', width: 1440, selector: 'ul.points', chars: 150, items: [20, 30] }])
  const group = PAGE_CHECK_GROUPS.find((g) => g.name === 'text-fill')
  assert.deepEqual([group.level, group.causingStep], ['warn', 6])
})
