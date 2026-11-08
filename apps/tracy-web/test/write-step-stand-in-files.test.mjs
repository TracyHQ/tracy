// A write step whose planner or writer produced nothing (#483): the step chain hands it a plan that keeps the whole kit and
// a copy that fills nothing, and the closing rule leaves no kept slot with its demo: every slot nothing fills is emptied, or
// said to keep its demo when the site cannot empty it. Kit and site are the invented ones of the copy check fixtures (demo-gym).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentMapKey } from '../src/lib/site-copy/contract-mapping.js'
import { standInCopy, standInPlan } from '../src/write-step/stand-in-files.js'
import { KIT, runStep } from './_write-step-run.mjs'

/** The invented kit with its two pages, as a cut kit lists them per width. */
function kitWithPages() {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', blocks: { 390: ['block-1', 'block-2', 'block-3', 'block-4', 'block-6'] } },
    {
      id: 'page-about',
      blocks: { 390: ['block-1', 'block-5', 'block-6'], 1440: ['block-1', 'block-5', 'block-6'] }
    }
  ]
  return kit
}

/** Every text slot of the kit: the slots that would print their demo words. */
function textSlots(kit) {
  return kit.doc.blocks.flatMap((b) =>
    [
      ...(b.slots ?? []),
      ...(b.lists ?? []).flatMap((l) => [
        ...(l.rowSlots ?? []),
        ...(l.rows ?? []).flatMap((r) => r.slots ?? [])
      ])
    ]
      .filter((s) => s.type === 'text')
      .map((s) => s.id)
  )
}

test('the stand-in plan keeps every page and block of the kit, shared blocks once', () => {
  const plan = standInPlan(kitWithPages())
  assert.deepEqual(
    plan.sharedBlocks.map((b) => [b.block, b.decision]),
    [
      ['block-1', 'keep'],
      ['block-6', 'keep']
    ]
  )
  assert.deepEqual(
    plan.pages.map((p) => [p.id, p.decision, p.blocks.map((b) => b.block)]),
    [
      ['page-home', 'keep', ['block-2', 'block-3', 'block-4']],
      ['page-about', 'keep', ['block-5']]
    ]
  )
  assert.equal(plan.kit, 'tracy-template-kit/2 demo-gym/j6/1.0.0')
})

test('with no plan and no copy, no slot the site can empty keeps its demo words', async () => {
  const kit = kitWithPages()
  const plan = standInPlan(kit)
  const copy = standInCopy(kit, { planText: JSON.stringify(plan) })
  const slots = textSlots(kit)
  const keys = slots.map(contentMapKey)
  const { report, site } = await runStep(
    { plan, copy },
    { overSlot: (slot) => (keys.includes(slot.key) ? { canHide: true } : {}) },
    { kit }
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const rungs = new Map((report.closing ?? []).map((c) => [c.slot, c.rung]))
  for (const slot of slots) {
    const key = contentMapKey(slot)
    assert.equal(site.held[key], '', `${slot} is emptied, not left with its demo words`)
    assert.ok(['hidden', undefined].includes(rungs.get(slot)), `${slot}: ${rungs.get(slot)}`)
  }
  assert.ok(
    (report.closing ?? []).every((c) => c.rung !== 'demo-remains'),
    'no slot is said to keep its demo when the site can empty it'
  )
})
