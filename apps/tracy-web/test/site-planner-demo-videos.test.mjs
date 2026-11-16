// A template demo video a kept block still shows is hidden when the plan left it undecided (plan-demo-videos.js), so
// R07 never fails for good on a video the brief cannot replace. Invented kit and plan in the shape of JA Boxing's
// class pages: a list of rows, each a picture and a video id.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEMO_VIDEO_WHY, withDemoVideosHidden } from '../src/site-planner/plan-demo-videos.js'

const video = (id, sample) => ({ id, role: 'business.video', sample, type: 'text', maxCharacters: 42 })
const picture = (id) => ({ id, role: 'business.gallery_image', type: 'image', maxCharacters: 255 })
const kit = () => ({
  blocks: [
    {
      id: 'body-class',
      demoOwned: [
        video('article-2.15', 'aaa'),
        video('article-2.37', 'bbb'),
        video('article-2.44', 'ccc'),
        video('article-2.9', 'ddd')
      ],
      lists: [
        {
          id: 'article-2.video',
          rowKind: 'slots',
          min: 1,
          max: 3,
          rows: [
            { index: 0, slots: [picture('article-2.14'), video('article-2.15', 'aaa')] },
            { index: 1, slots: [picture('article-2.36'), video('article-2.37', 'bbb')] },
            { index: 2, slots: [picture('article-2.43'), video('article-2.44', 'ccc')] }
          ]
        }
      ]
    }
  ]
})
const decision = (over = {}) => ({
  block: 'body-class',
  decision: 'keep',
  copy: [],
  lists: [{ list: 'article-2.video', rows: 2, items: [{ copy: [] }, { copy: [] }] }],
  ...over
})
const plan = (d = decision()) => ({
  version: 'site-plan/3',
  sharedBlocks: [],
  pages: [{ id: 'page-class', decision: 'keep', blocks: [d] }]
})
const hidden = (p) => p.pages[0].blocks[0].hiddenSlots?.map((h) => h.slot) ?? []

test('an undecided video of a shown row, and one of the block itself, are hidden; rows the list does not show are not', () => {
  const before = plan()
  const after = withDemoVideosHidden(before, kit())
  assert.deepEqual(hidden(after).sort(), ['article-2.15', 'article-2.37', 'article-2.9'])
  assert.ok(after.pages[0].blocks[0].hiddenSlots.every((h) => h.why === DEMO_VIDEO_WHY))
  assert.equal(hidden(before).length, 0, 'the plan is never modified in place')
})

test('a video the plan writes, hides or whose list it hides stays as the plan says; nothing to do returns the same plan', () => {
  const written = plan(
    decision({
      copy: [{ slot: 'article-2.9', text: 'own video id' }],
      hiddenSlots: [{ slot: 'article-2.video', why: 'no videos' }]
    })
  )
  assert.strictEqual(withDemoVideosHidden(written, kit()), written)
  // A list the decision does not name stays with the planner (R07 reports it).
  const unnamed = plan(decision({ lists: [], copy: [{ slot: 'article-2.9', text: 'own video id' }] }))
  assert.strictEqual(withDemoVideosHidden(unnamed, kit()), unnamed)
})

test('a dropped page, a hidden block and a kit without such a block are left alone', () => {
  const dropped = { ...plan(), pages: [{ ...plan().pages[0], decision: 'drop' }] }
  assert.strictEqual(withDemoVideosHidden(dropped, kit()), dropped)
  const hiddenBlock = plan(decision({ decision: 'hide' }))
  assert.strictEqual(withDemoVideosHidden(hiddenBlock, kit()), hiddenBlock)
  const other = plan()
  assert.strictEqual(withDemoVideosHidden(other, { blocks: [] }), other)
})
