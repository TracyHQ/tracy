// A copy entry under a block that does not own its slot is moved to the block that owns it on the same page, or left
// out when that block writes it already (site-planner/plan-slot-owners.js), so R01 has nothing left to fail on it; a
// slot in no block of the kit, or whose own block is not kept, stays with the planner and R01. An invented kit; no
// model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { withSlotsInTheirBlocks } from '../src/site-planner/plan-slot-owners.js'

const block = (id, slots, extra = {}) => ({
  id,
  role: 'content',
  shared: false,
  slots: slots.map((s) => ({ id: s, kind: 'text' })),
  frames: [],
  lists: [],
  links: [],
  fixedText: [],
  demoOwned: [],
  ...extra
})
const kit = {
  pageGroups: [{ id: 'group-home', root: 'page-home' }],
  pages: [
    { id: 'page-home', group: 'group-home', blocks: { 1440: ['block-160', 'block-165', 'block-170'] } }
  ],
  blocks: [
    block('block-160', ['article-2.9', 'article-2.10']),
    block('block-165', ['article-3.1']),
    block('block-170', ['article-4.1'])
  ],
  site: {}
}
const copy = (slot) => ({ slot, text: `text of ${slot}` })
const plan = (blocks) => ({ pages: [{ id: 'page-home', decision: 'keep', blocks }] })

test('a slot under the wrong block moves to its own block on the page; one in no block of the kit stays for R01', () => {
  const before = plan([
    { block: 'block-160', decision: 'keep', copy: [copy('article-2.10')] },
    {
      block: 'block-165',
      decision: 'keep',
      copy: [copy('article-3.1'), copy('article-2.9'), copy('category-8.0')]
    }
  ])
  const after = withSlotsInTheirBlocks(before, kit)
  const [b160, b165] = after.pages[0].blocks
  assert.deepEqual(
    b160.copy.map((c) => c.slot),
    ['article-2.10', 'article-2.9']
  )
  assert.equal(b160.copy[1].text, 'text of article-2.9')
  assert.deepEqual(
    b165.copy.map((c) => c.slot),
    ['article-3.1', 'category-8.0']
  )
  // The plan given is not changed.
  assert.equal(before.pages[0].blocks[1].copy.length, 3)
  // R01 has nothing left to say about these slots.
  const r01 = checkPlan({ plan: after, kit, brief: {}, briefRef: null }).rules?.find((r) => r.id === 'R01')
  assert.ok(
    (r01?.failures ?? []).every((f) => !/article-2\.9/.test(f.where)),
    'R01 has nothing left on the moved slot'
  )
  assert.ok(
    (r01?.failures ?? []).some((f) => /category-8\.0/.test(f.where)),
    'a slot in no block of the kit is still R01'
  )
})

test('a slot its own kept block writes already is left out of the wrong block; one whose block is hidden stays', () => {
  const after = withSlotsInTheirBlocks(
    plan([
      { block: 'block-160', decision: 'hide' },
      { block: 'block-165', decision: 'keep', copy: [copy('article-2.9')] },
      { block: 'block-170', decision: 'keep', copy: [copy('article-4.1'), copy('article-3.1')] },
      { block: 'block-165b', decision: 'keep', copy: [copy('article-4.1')] }
    ]),
    { ...kit, blocks: [...kit.blocks, block('block-165b', [])] }
  )
  const [b160, b165, b170, b165b] = after.pages[0].blocks
  assert.equal('copy' in b160, false, 'a decision with no copy list gets none')
  // block-160 is hidden: article-2.9 stays for R01; article-3.1, under block-170, is block-165's and moves there.
  assert.deepEqual(
    b165.copy.map((c) => c.slot),
    ['article-2.9', 'article-3.1']
  )
  assert.deepEqual(
    b170.copy.map((c) => c.slot),
    ['article-4.1']
  )
  // block-170 already writes article-4.1: the second one goes.
  assert.deepEqual(b165b.copy, [])
})

test('a plan with every slot in its own block comes back as the same object', () => {
  const ok = plan([
    { block: 'block-160', decision: 'keep', copy: [copy('article-2.9')] },
    // A block the kit does not have and a made-up fixed text stay with the planner (R01 names them).
    { block: 'block-999', decision: 'keep', copy: [copy('article-2.9')] },
    { block: 'block-165', decision: 'keep', copy: [copy('fixedText:hello')] }
  ])
  assert.equal(withSlotsInTheirBlocks(ok, kit), ok)
  assert.equal(withSlotsInTheirBlocks(null, kit), null)
})
