// A text slot the kit lists under a block's `demoOwned` (the demo business's own words) keeps the demo's accent emphasis like any
// other slot: the writer is told, the copy check (W16) and the site check (`accent-emphasis`) judge it, and the export wraps it.
// Kit, copy and site are invented (Quay Fitness Studio of the copy check fixtures).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { judgeAccentEmphasis } from '../src/site-check/accent-emphasis.js'
import { demoLeftByWrite } from '../src/site-check/demo-left-by-write.js'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

/** The kit with the hero heading block-2.1 moved to the block's demoOwned list, drawn like "((span))NO1((/span)) Fitness club". */
function demoOwnedKit() {
  const k = kit()
  const block = k.blocks.find((b) => b.id === 'block-2')
  const slot = block.slots.find((s) => s.id === 'block-2.1')
  block.slots = block.slots.filter((s) => s !== slot)
  block.demoOwned = [{ ...slot, inline: [{ tag: 'span', attrs: '', text: 'NO1', at: 'start' }] }]
  return k
}
const HEADING = 'Train with a coach who knows your name'
const withHeading = (emphasis) => {
  const c = copy()
  const s = slotOf(c, 'block-2.1')
  s.text = HEADING
  if (emphasis !== undefined) s.emphasis = emphasis
  return c
}
const w16 = (c) =>
  checkCopy({ copy: c, plan: plan(), kit: demoOwnedKit(), brief: brief() }).rules.find((r) => r.id === 'W16')

test('the writer is told the accent of a demo-owned heading', () => {
  const slot = writerInput({ plan: plan(), brief: brief(), kit: demoOwnedKit() })
    .blocks.find((b) => b.id === 'block-2')
    .slots.find((s) => s.id === 'block-2.1')
  assert.ok(slot, 'the demo-owned slot is in the writer view of its block')
  assert.match(slot.inline, /The demo draws "NO1" in the accent colour, at the start/)
  assert.equal(slot.maxCharacters, 40)
})

test('W16 fails a demo-owned heading with no emphasis and passes one with its own words', () => {
  const missing = w16(withHeading(undefined))
  assert.equal(missing.failures[0]?.cause, 'missing')
  assert.match(missing.failures[0].detail, /^block-2.1: has no emphasis: the demo draws "NO1"/)
  assert.equal(w16(withHeading('coach')).status, 'pass')
})

test('the export wraps the emphasis of a demo-owned heading in the demo span', () => {
  const c = withHeading('coach')
  const out = exportContractMapping({
    copy: c,
    contract: 'demo-gym/j6/1.0.0',
    revision: 'rev-1',
    kit: demoOwnedKit(),
    brief: brief()
  }).mapping.changes['module-2.1']
  assert.equal(out, 'Train with a ((span))coach((/span)) who knows your name')
})

test('the site check blocks a demo-owned heading printed with no span', () => {
  const head = 'tracy brand style accent-only: replaces=#e03a3e accent=#bf5b3d family=#e03a3e words=#c4623f'
  const measures = [
    {
      path: '/',
      width: 1440,
      brandStyle: { worn: true, head },
      headingSpans: [{ text: HEADING, color: 'rgb(255, 255, 255)', spans: [] }]
    }
  ]
  const r = judgeAccentEmphasis(
    demoOwnedKit(),
    [{ slot: 'block-2.1', status: 'written', ordered: HEADING }],
    measures
  )
  assert.deepEqual(
    r.failures.map((f) => [f.level, f.causingStep, f.slot]),
    [['block', 6, 'block-2.1']]
  )
})

test("demo words a refused demo-owned slot leaves on the page are the write step's", () => {
  const k = demoOwnedKit()
  k.blocks.find((b) => b.id === 'block-2').demoOwned[0].sample =
    'NO1 Fitness club in the whole old harbour town'
  const report = {
    slots: [{ slot: 'block-2.1', key: 'module-2.1', status: 'refused', ordered: HEADING }]
  }
  const blamed = demoLeftByWrite(
    { page: '/', measured: 'NO1 Fitness club in the whole old harbour town', level: 'block', causingStep: 6 },
    { report, kit: k }
  )
  assert.equal(blamed?.causingStep, 9)
  assert.equal(blamed?.slot, 'block-2.1')
})
