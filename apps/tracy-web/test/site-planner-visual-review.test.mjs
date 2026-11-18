import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { firstUserMessage } from '../src/lib/template-kit-source.js'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import {
  checkVisualReview,
  reviewedImages,
  VISUAL_REVIEW_POLICY,
  visualReviewImages,
  visualReviewInstruction
} from '../src/site-planner/visual-review.js'

const ref = 'test-kit/j6/1.0.0'
const ids = ['page-one-1440', 'page-two-1440', 'page-one-390', 'block-one-1440']
const sha = 'a'.repeat(64)
const kit = {
  pageGroups: [
    { id: 'one', representative: 'page-one' },
    { id: 'two', representative: 'page-two' }
  ],
  pages: [
    { id: 'page-one', images: { 1440: ids[0], 390: ids[2] } },
    { id: 'page-two', images: { 1440: ids[1] } }
  ],
  blocks: [{ id: 'block-one', images: { 1440: ids[3] } }],
  images: ids.map((id) => ({ id, sha256: sha }))
}
const plan = {
  pages: [{ id: 'page-one', decision: 'keep', blocks: [{ block: 'block-one', decision: 'keep' }] }]
}
const call = (id) => ({ function: { name: 'open_kit_image', arguments: JSON.stringify({ id }) } })
const part = (id, extra = {}) => ({ type: 'image_ref', ref: { kit: ref, image: id, sha256: sha, ...extra } })
const evidence = (wanted = ids) => [
  { n: 0, state: 'answered', sent: [], message: { tool_calls: wanted.map(call) } },
  { n: 1, state: 'answered', sent: [{ role: 'user', content: wanted.map((id) => part(id)) }], message: {} }
]
const check = (history) => checkVisualReview({ plan, kit, kitRef: ref, history })

test('visual review fails without delivered images and asks for group representatives first', () => {
  const missing = check([])
  assert.equal(missing.status, 'fail')
  assert.deepEqual(
    missing.failures.map((f) => f.where),
    ids.slice(0, 2).map((id) => `kit image ${id}`)
  )
  assert.equal(missing.coverage.missing.length, 4)
  assert.match(visualReviewInstruction(kit), /First open these representative page images/)
})

test('actual answered deliveries cover representatives, kept blocks and responsive pages', () => {
  const partial = check(evidence(ids.slice(0, 2)))
  assert.equal(partial.status, 'fail')
  assert.deepEqual(new Set(partial.coverage.missing), new Set(ids.slice(2)))
  const complete = check(evidence())
  assert.equal(complete.status, 'pass')
  assert.deepEqual(complete.coverage.missing, [])
  assert.equal(complete.coverage.policy, VISUAL_REVIEW_POLICY)
})

test('tool names, forged refs and unanswered image requests never prove visual review', () => {
  assert.equal(check(evidence().slice(0, 1)).status, 'fail')
  assert.equal(reviewedImages({ kit, kitRef: ref, history: [evidence()[1]] }).size, 0)
  for (const patch of [{ sha256: 'b'.repeat(64) }, { kit: 'another-kit' }, { image: 'forged' }]) {
    const history = evidence()
    history[1].sent[0].content = ids.map((id) => part(id, patch))
    assert.equal(check(history).status, 'fail')
  }
  for (const state of ['dispatched', 'failed', 'abandoned']) {
    const history = evidence()
    history[1].state = state
    assert.equal(check(history).status, 'fail')
  }
})

test('an incomplete image catalogue refuses coverage and historical bench checks remain unchanged', () => {
  assert.equal(
    checkVisualReview({ plan, kit: { ...kit, images: [] }, kitRef: ref, history: evidence() }).status,
    'fail'
  )
  const row = { harness: {}, brief: {}, brief_source: {}, kit: { ref } }
  const historical = SITE_PLANNER_STEP.checker.check({
    doc: {},
    row,
    ready: { kit: { doc: {} } },
    history: []
  })
  assert.equal(
    historical.rules.some((rule) => rule.id === 'V01'),
    false
  )
  const strict = SITE_PLANNER_STEP.checker.check({
    doc: plan,
    row: { ...row, harness: { visualReview: VISUAL_REVIEW_POLICY } },
    ready: { kit: { doc: kit } },
    history: evidence()
  })
  assert.equal(strict.rules.find((rule) => rule.id === 'V01').status, 'pass')
})

test('strict prompt replaces optional image advice and all printed block decisions need coverage', () => {
  const prompt = firstUserMessage({
    kit: { ref, doc: kit },
    brief: {},
    visualReviewText: visualReviewInstruction(kit)
  })
  assert.match(prompt, /requires visual review before the plan can pass/)
  assert.doesNotMatch(prompt, /Open an image only where/)
  for (const decision of ['keep', 'replace', 'rewrite']) {
    const printed = { pages: [{ ...plan.pages[0], blocks: [{ block: 'block-one', decision }] }] }
    const result = checkVisualReview({ plan: printed, kit, kitRef: ref, history: evidence(ids.slice(0, 3)) })
    assert.deepEqual(result.coverage.missing, [ids[3]])
  }
  const hidden = { pages: [{ ...plan.pages[0], blocks: [{ block: 'block-one', decision: 'hide' }] }] }
  assert.equal(
    checkVisualReview({ plan: hidden, kit, kitRef: ref, history: evidence(ids.slice(0, 3)) }).status,
    'pass'
  )
})

test('the first message names every image V01 can require, so a planner can open them before the plan exists', () => {
  const published = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
        import.meta.url
      )
    )
  )
  const kitRef = 'ja-boxing/j6/1.0.11'
  const { groups, blocks } = visualReviewImages(published)
  const text = visualReviewInstruction(published)
  const named = [...groups.flatMap((g) => g.ids), ...Object.values(blocks)]
  for (const id of named) assert.ok(text.includes(id), `${id} is named`)
  // Blocks that share an image are named with the image they really have, not one guessed from their id.
  const shared = published.blocks.find((b) => b.images?.['1440'] && b.images['1440'] !== `${b.id}-1440`)
  assert.equal(blocks[shared.id], shared.images['1440'])
  assert.ok(text.includes(`"${shared.id}":"${shared.images['1440']}"`))
  // The widest plan the kit allows: every page kept and every block printed. Opening the named ids passes V01.
  const everything = {
    sharedBlocks: [],
    pages: published.pages.map((page) => ({
      id: page.id,
      decision: 'keep',
      blocks: published.blocks.map((block) => ({ block: block.id, decision: 'keep' }))
    }))
  }
  const sha256 = new Map(published.images.map((image) => [image.id, image.sha256]))
  const opened = [...new Set(named)]
  const history = [
    { n: 0, state: 'answered', sent: [], message: { tool_calls: opened.map(call) } },
    {
      n: 1,
      state: 'answered',
      sent: [
        {
          role: 'user',
          content: opened.map((image) => ({
            type: 'image_ref',
            ref: { kit: kitRef, image, sha256: sha256.get(image) }
          }))
        }
      ],
      message: {}
    }
  ]
  const result = checkVisualReview({ plan: everything, kit: published, kitRef, history })
  assert.equal(result.coverage.missing.length, 0)
  assert.ok(result.coverage.required.every((id) => opened.includes(id)))
  // Naming ids proves nothing by itself: without the opens, the same plan still fails.
  assert.equal(checkVisualReview({ plan: everything, kit: published, kitRef, history: [] }).status, 'fail')
})

test('each page group is named with its desktop and every distinct phone image of its pages', () => {
  const twoPhones = structuredClone(kit)
  twoPhones.pages.push({ id: 'page-one-b', group: 'one', images: { 1440: ids[0], 390: 'page-one-b-390' } })
  twoPhones.pages[0].group = 'one'
  const { groups } = visualReviewImages(twoPhones)
  assert.deepEqual(groups.find((g) => g.group === 'one').ids, [ids[0], ids[2], 'page-one-b-390'])
  assert.match(visualReviewInstruction(kit), /in the same call that reads the block with read_kit_part/)
})

test('a page group of stock screens asks for no image; a mixed group stands for its first page that is not one', () => {
  // Dev, JA Diner 16/11/2026: V01 asked for page-home_home-red-1440, a home colour variant the kit declares a stock
  // screen, which open_kit_image answers STOCK_SCREEN, and the plan step ended "failed, best version used".
  const stockIds = ['page-red-1440', 'page-red-390', 'page-account-1440', 'page-three-1440']
  const withStock = {
    ...kit,
    site: {
      stockScreens: [
        { path: '/home/*', why: 'colour variants of the home page' },
        { path: '/account', why: 'an account screen with no customer content' }
      ]
    },
    pageGroups: [
      ...kit.pageGroups,
      { id: 'red', representative: 'page-red' },
      { id: 'mixed', representative: 'page-account' }
    ],
    pages: [
      { ...kit.pages[0], path: '/' },
      { ...kit.pages[1], path: '/two' },
      { id: 'page-red', group: 'red', path: '/home/red', images: { 1440: stockIds[0], 390: stockIds[1] } },
      { id: 'page-account', group: 'mixed', path: '/account', images: { 1440: stockIds[2] } },
      { id: 'page-three', group: 'mixed', path: '/three', images: { 1440: stockIds[3] } }
    ],
    images: [...ids, ...stockIds].map((id) => ({ id, sha256: sha }))
  }
  const asked = visualReviewImages(withStock).groups.flatMap((g) => g.ids)
  for (const id of stockIds.slice(0, 3)) assert.ok(!asked.includes(id), id)
  assert.ok(
    asked.includes('page-three-1440'),
    'the mixed group stands for its page that is not a stock screen'
  )
  const run = checkVisualReview({
    plan,
    kit: withStock,
    kitRef: ref,
    history: evidence([...ids, 'page-three-1440'])
  })
  assert.equal(run.status, 'pass', run.failures.map((f) => f.where).join('; '))
  assert.ok(!run.coverage.required.some((id) => stockIds.slice(0, 3).includes(id)))
})
