// A picture frame with `twinOf` is the light or dark copy of the frame it names: the planner never hides it on its own, so the
// write step hides it with its original (ADR 0044). The kit and plan here are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hiddenTwins, ownerTable, planClaims, unownedSlots } from '../src/write-step/owner-table.js'

const frame = (id, twinOf = null) => ({
  id,
  kind: 'icon',
  canHide: true,
  twinOf,
  picture: `images/demo/${id}.png`
})
const KIT = {
  blocks: [
    {
      id: 'block-40',
      visibleAt: ['1440', '390'],
      slots: [{ id: 'block-40.1', type: 'text' }],
      lists: [
        {
          rowSlots: [
            { id: 'block-40.3', type: 'image' },
            { id: 'block-40.4', type: 'image' }
          ]
        }
      ],
      frames: [frame('block-40.3'), frame('block-40.4', 'block-40.3')]
    },
    { id: 'block-41', visibleAt: ['1440'], frames: [frame('block-41.2', 'block-40.4')] }
  ]
}
const PLAN = {
  pages: [
    {
      decision: 'keep',
      blocks: [{ block: 'block-40', hiddenSlots: [{ slot: 'block-40.3', why: 'no signature to show' }] }]
    }
  ]
}

test('a frame whose twin the plan hides is hidden too, as the plan via its twin', () => {
  const claims = planClaims(
    { plan: PLAN, kit: KIT, hidden: new Set(['block-40.3']), menuHide: [] },
    'plan.json'
  )
  const twin = claims.find((c) => c.slot === 'block-40.4')
  assert.deepEqual(
    { owner: twin.owner, kind: twin.kind, via: twin.via, twinOf: twin.twinOf, file: twin.file },
    { owner: 'plan', kind: 'hide', via: 'twin', twinOf: 'block-40.3', file: 'plan.json' }
  )
  assert.match(twin.why, /block-40\.3/)
  const { owners, disputes } = ownerTable(claims)
  assert.equal(owners.get('block-40.4').kind, 'hide')
  assert.deepEqual(disputes, [])
  assert.deepEqual(
    unownedSlots({ plan: PLAN, kit: KIT, owners }).map((u) => u.slot),
    ['block-40.1']
  )
})

test('twins are followed through a chain, and a twin the plan fills elsewhere keeps its slot', () => {
  assert.deepEqual(
    [...hiddenTwins(KIT, new Set(['block-40.3']))],
    [
      ['block-40.4', 'block-40.3'],
      ['block-41.2', 'block-40.4']
    ]
  )
  const both = { pages: [{ ...PLAN.pages[0], blocks: [...PLAN.pages[0].blocks, { block: 'block-41' }] }] }
  const hide = (plan, filled) =>
    planClaims({ plan, kit: KIT, hidden: new Set(['block-40.3']), menuHide: [], filled }, 'plan.json')
      .filter((c) => c.via === 'twin')
      .map((c) => c.slot)
  assert.deepEqual(hide(both), ['block-40.4', 'block-41.2'])
  // A twin on a block the plan does not keep leaves with its block, and one the plan fills keeps its slot.
  assert.deepEqual(hide(PLAN), ['block-40.4'])
  assert.deepEqual(hide(both, new Set(['block-40.4'])), ['block-41.2'])
})

test('a twin whose original the plan keeps is left as before', () => {
  const plan = { pages: [{ decision: 'keep', blocks: [{ block: 'block-40' }] }] }
  const claims = planClaims({ plan, kit: KIT, hidden: new Set(), menuHide: [] }, 'plan.json')
  assert.deepEqual(claims, [])
  const { owners } = ownerTable(claims)
  assert.deepEqual(
    unownedSlots({ plan, kit: KIT, owners }).map((u) => u.slot),
    ['block-40.1', 'block-40.3', 'block-40.4']
  )
})

test('without a kit the plan claims only what it names', () => {
  const claims = planClaims({ plan: PLAN, hidden: new Set(['block-40.3']), menuHide: [] }, 'plan.json')
  assert.deepEqual(
    claims.map((c) => c.slot),
    ['block-40.3']
  )
})
