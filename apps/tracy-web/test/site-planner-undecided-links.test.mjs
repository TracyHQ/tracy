// What code decides of a plan without the model (site-planner/plan-undecided-links.js, plan-shape-repairs.js), on the released
// JA Boxing 1.0.11 kit: a link the decision left undecided that has one answer is decided, and two slips of the plan's shape
// are repaired. Dev lat29 and lat30 (23/11/2026): round 0 left 17 to 80 links undecided (R10b), wrote the home page's blocks
// as `blockDecisions` (R00) and decided shared blocks again on the home page (R10g). The plans are invented.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { withPageBlocksRepaired } from '../src/site-planner/plan-shape-repairs.js'
import {
  withItemLinksToTheirItems,
  withUndecidedLinksSettled
} from '../src/site-planner/plan-undecided-links.js'

const KIT = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)

const gallery = (copy = [{ slot: 'block-166.19', text: 'Book a free trial' }]) => ({
  block: 'block-166',
  decision: 'keep',
  seen: 'the gallery',
  copy
})
const plan = (decision, contact = 'keep') => ({
  sharedBlocks: [],
  pages: [
    { id: 'page-home', decision: 'keep', blocks: [decision] },
    { id: 'page-about-us_contact', decision: contact, blocks: [] }
  ]
})

test('a picture that opens itself is hidden, and a link to a kept page whose label is decided is kept', () => {
  const out = withUndecidedLinksSettled(plan(gallery()), KIT)
  const d = out.pages[0].blocks[0]
  assert.deepEqual(
    d.hiddenSlots.map((h) => h.slot),
    [
      'block-166.link-1',
      'block-166.link-2',
      'block-166.link-3',
      'block-166.link-4',
      'block-166.link-5',
      'block-166.link-6'
    ]
  )
  assert.deepEqual(d.links, [
    { link: 'block-166.20', leadsTo: 'page-about-us_contact', labelSlot: 'block-166.19' }
  ])
})

test('a link whose page is dropped, or whose label is undecided, stays with the planner; a decided one is left as it is', () => {
  const dropped = withUndecidedLinksSettled(plan(gallery(), 'drop'), KIT).pages[0].blocks[0]
  assert.equal(dropped.links, undefined)
  const unlabelled = withUndecidedLinksSettled(plan(gallery([])), KIT).pages[0].blocks[0]
  assert.equal(unlabelled.links, undefined)
  assert.equal(unlabelled.hiddenSlots.length, 6, 'the picture controls are decided all the same')
  const decided = gallery()
  decided.links = [{ link: 'block-166.20', leadsTo: 'page-home', labelSlot: 'block-166.19' }]
  decided.hiddenSlots = ['1', '2', '3', '4', '5', '6'].map((n) => ({ slot: `block-166.link-${n}`, why: 'x' }))
  const input = plan(decided)
  assert.equal(withUndecidedLinksSettled(input, KIT), input, 'nothing to decide: the same plan')
})

test("a page's blocks under another name are its blocks, and a shared block decided again on a page is the shared one's", () => {
  const input = {
    sharedBlocks: [{ block: 'header', decision: 'keep' }],
    pages: [
      {
        id: 'page-home',
        decision: 'keep',
        blockDecisions: [
          { block: 'header', decision: 'hide' },
          { block: 'block-156', decision: 'keep' }
        ]
      }
    ]
  }
  const out = withPageBlocksRepaired(input)
  assert.equal(out.pages[0].blockDecisions, undefined)
  assert.deepEqual(
    out.pages[0].blocks.map((d) => d.block),
    ['block-156']
  )
  const fine = {
    sharedBlocks: [],
    pages: [{ id: 'page-home', decision: 'keep', blocks: [{ block: 'block-156' }] }]
  }
  assert.equal(withPageBlocksRepaired(fine), fine)
})

test("a card's link that opens its own item leads to that item's kept page, and stays with the planner when it is dropped", () => {
  // Dev lat29/lat30: the advanced class card was sent to the beginner page; the write step has no door to move a card's link.
  const listing = (leadsTo) => ({
    block: 'block-160',
    decision: 'keep',
    seen: 'the classes',
    links: [{ link: 'block-160.link-2', labelSlot: 'menuItem-189.0', leadsTo }]
  })
  const make = (advanced) => ({
    sharedBlocks: [],
    pages: [
      { id: 'page-home', decision: 'keep', blocks: [listing('page-classes_beginner-boxing')] },
      { id: 'page-classes_advanced-boxing', decision: advanced, blocks: [] },
      { id: 'page-classes_beginner-boxing', decision: 'keep', blocks: [] }
    ]
  })
  const out = withItemLinksToTheirItems(make('keep'), KIT)
  assert.equal(out.pages[0].blocks[0].links[0].leadsTo, 'page-classes_advanced-boxing')
  const dropped = make('drop')
  assert.equal(withItemLinksToTheirItems(dropped, KIT), dropped, 'a dropped item stays with the planner')
})
