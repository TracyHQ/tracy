// The draft copy's parts (site-writer/writer-parts.js): a "shared" unit heavier than the average part gives up its
// heaviest shared blocks, one `shared:<block id>` unit each, so a part can write some shared blocks beside the pages
// and "shared" is no longer always the slowest part; the narrowed plan, the notes and the part message follow the
// units. A site whose shared blocks are light is cut exactly as before. An invented writer input; no model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  notesOf,
  pageWeights,
  partMessage,
  peeledOf,
  planOfPages,
  writingParts,
  writingUnits
} from '../src/site-writer/writer-parts.js'

const slots = (block, n, chars) =>
  Array.from({ length: n }, (_, i) => ({ id: `${block}.${i}`, demoChars: { total: chars } }))
const keep = (block, n, says) => ({
  block,
  decision: 'keep',
  copy: Array.from({ length: n }, (_, i) => ({ slot: `${block}.${i}`, says: `${says} ${i}` }))
})

/** A site whose shared blocks hold a 2000-character menu (block-s1) beside two small ones. */
function input({ menuSlots = 10 } = {}) {
  return {
    blocks: [
      { id: 'block-s1', slots: slots('block-s1', menuSlots, 200) },
      { id: 'block-s2', slots: slots('block-s2', 1, 50) },
      { id: 'block-s3', slots: slots('block-s3', 3, 100) },
      { id: 'block-h1', slots: slots('block-h1', 3, 100) },
      { id: 'block-a1', slots: slots('block-a1', 2, 100) },
      { id: 'block-c1', slots: slots('block-c1', 1, 100) }
    ],
    mainMenu: [],
    footerHeadings: [],
    plan: {
      sharedBlocks: [
        keep('block-s1', menuSlots, 'a dish of the menu'),
        keep('block-s2', 1, 'the opening hours'),
        keep('block-s3', 3, 'the footer story')
      ],
      mainMenu: [{ page: 'page-home' }, { page: 'page-about' }, { page: 'page-contact' }],
      pages: [
        { id: 'page-home', decision: 'keep', blocks: [keep('block-h1', 3, 'the welcome')] },
        { id: 'page-about', decision: 'keep', blocks: [keep('block-a1', 2, 'the story')] },
        { id: 'page-contact', decision: 'keep', blocks: [keep('block-c1', 1, 'how to come')] }
      ]
    }
  }
}
const SPLIT = { splitShared: true }
const total = (weights) => [...weights.values()].reduce((a, b) => a + b, 0)

test('a heavy "shared" gives up its heaviest block as a unit of its own, and the parts are no longer led by "shared"', () => {
  const x = input()
  const before = pageWeights(x)
  assert.equal(before.get('shared'), 2350)
  const units = writingUnits(x, 3, SPLIT)
  assert.deepEqual(
    [...units.keys()],
    ['shared', 'shared:block-s1', 'page-home', 'page-about', 'page-contact']
  )
  assert.equal(units.get('shared'), 350)
  assert.equal(units.get('shared:block-s1'), 2000)
  assert.equal(total(units), total(before), 'nothing is weighed twice or lost')
  const parts = writingParts(x, 3, SPLIT)
  assert.deepEqual(parts.flat(), [...units.keys()], 'joined in order, the parts are the units')
  const heaviest = Math.max(...parts.map((p) => p.reduce((s, u) => s + units.get(u), 0)))
  assert.equal(heaviest, 2000, 'below the 2350 of "shared" whole')
  assert.ok(
    parts.findIndex((p) => p.includes('shared')) !== parts.findIndex((p) => p.includes('shared:block-s1'))
  )
})

test('each part plans, notes and is told only its own shared blocks', () => {
  const x = input()
  const parts = writingParts(x, 3, SPLIT)
  const withShared = parts.find((p) => p.includes('shared'))
  const withMenu = parts.find((p) => p.includes('shared:block-s1'))
  const pagesOnly = parts.find((p) => !p.some((u) => u.startsWith('shared')))
  const blocksOf = (pages) => planOfPages(x.plan, pages, parts).sharedBlocks.map((d) => d.block)
  assert.deepEqual(blocksOf(withShared), ['block-s2', 'block-s3'])
  assert.deepEqual(blocksOf(withMenu), ['block-s1'])
  assert.deepEqual(blocksOf(pagesOnly), [])
  // Without the split given, "shared" still means every shared block, as before.
  assert.deepEqual(
    planOfPages(x.plan, ['shared']).sharedBlocks.map((d) => d.block),
    ['block-s1', 'block-s2', 'block-s3']
  )
  const peeled = peeledOf(parts)
  assert.deepEqual([...peeled], ['block-s1'])
  assert.ok(notesOf(x.plan, withShared, peeled).every((n) => !n.startsWith('a dish of the menu')))
  assert.ok(notesOf(x.plan, withMenu, peeled).includes('a dish of the menu 0'))
  const message = partMessage({
    pages: parts,
    part: parts.indexOf(withMenu),
    voice: null,
    own: parts.map(() => []),
    runs: parts.map(() => ({ mine: [], others: [] }))
  })
  assert.match(message, /Write these pages now, in this order: shared:block-s1\./)
  assert.match(
    message,
    /A page named shared:<block id> is that one shared block .*\("shared" is every other shared block \(block-s1 excepted\)|"shared" is every other shared block \(block-s1 excepted\)/
  )
})

test('light shared blocks, one part, or a run that does not ask for the split are cut exactly as before', () => {
  // test-quality: contract a run without harness.splitShared is cut as every run before it, byte for byte
  assert.deepEqual(writingParts(input(), 3), writingParts(input(), 3, { splitShared: false }))
  assert.ok(
    writingParts(input(), 3)
      .flat()
      .every((u) => !u.startsWith('shared:'))
  )
  const light = input({ menuSlots: 1 })
  // "shared" (550) is no heavier than the average part of one to three parts (603 at three): nothing is split.
  for (const k of [1, 2, 3])
    assert.deepEqual([...writingUnits(light, k, SPLIT)], [...pageWeights(light)], `${k} parts`)
  const heavy = input()
  assert.deepEqual([...writingUnits(heavy, 1, SPLIT)], [...pageWeights(heavy)])
  const message = partMessage({
    pages: [
      ['shared', 'page-home'],
      ['page-about', 'page-contact']
    ],
    part: 0,
    voice: null,
    own: [[], []],
    runs: [
      { mine: [], others: [] },
      { mine: [], others: [] }
    ]
  })
  assert.doesNotMatch(message, /written in more than one part/)
})
