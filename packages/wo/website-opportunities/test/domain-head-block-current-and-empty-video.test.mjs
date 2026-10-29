// Two rules of the leftover head block (spec TracyHQ/tracy#189 round 9, classes C2 and C3): a play control whose video
// address names no video is hidden wherever it is, and a list of related pages never shows the page it sits on. All
// rules by markup, never by template.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftoverHeadBlock } from '../domain/outside-map.mjs'

test('a play control whose embed names no video is hidden, whatever its id was', () => {
  const block = leftoverHeadBlock({ emptyVideos: true })
  assert.match(block, /\[data-src\$="youtube\.com\/embed\/"\]/)
  assert.match(block, /\[href\$="youtube\.com\/embed\/"\]/)
  assert.match(block, /\[href\$="watch\?v="\]/)
  assert.match(block, /display:none !important/)
})

test('the item of a related list that leads to the current page is hidden, the other items stay', () => {
  const block = leftoverHeadBlock({ currentItems: ['a.mod-articles-category-title'] })
  const t = 'a.mod-articles-category-title'
  // The child of an element that holds another item's title link, holding the current item's title link and no other title link.
  assert.ok(block.includes(`:has(${t}:not(.active)) > :has(${t}.active):not(:has(${t}:not(.active)))`), block)
})

test('nothing to hide gives no block', () => {
  assert.equal(leftoverHeadBlock({}), '')
  assert.equal(leftoverHeadBlock({ emptyVideos: false, currentItems: [] }), '')
})
