// Explicitly hidden inactive lists compile only to exact already-empty native children; no input is rewritten.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexInputs } from '../src/lib/site-copy/inputs-index.js'
import { KIT, copy, plan, runStep } from './_write-step-run.mjs'
import { readBackGroup } from '../src/site-check/read-back.js'

function fixture() {
  const kit = KIT()
  kit.doc.blocks.find((b) => b.id === 'block-2').lists = [
    {
      id: 'block-2.inactive',
      rowKind: 'slots',
      shown: 0,
      min: 1,
      max: 1,
      rowSlots: [
        { id: 'block-2.7', type: 'text', sample: '' },
        { id: 'block-2.8', type: 'url', sample: '' }
      ]
    }
  ]
  const planned = plan()
  planned.pages[0].blocks[0].hiddenSlots.push({
    slot: 'block-2.inactive',
    why: 'the second control was not active'
  })
  return { kit, planned }
}
function nativeSlots(kit, mutate = () => {}) {
  const slots = kit.doc.blocks
    .flatMap((b) => [
      ...(b.slots ?? []),
      ...(b.lists ?? []).flatMap((l) => [
        ...(l.rowSlots ?? []),
        ...(l.rows ?? []).flatMap((r) => r.slots ?? [])
      ])
    ])
    .filter((s) => s.id)
    .map((s) => ({
      key: s.id.replace(/^block-/, 'module-'),
      type: s.type,
      entity: s.id.replace(/^block-/, 'module-').split('.')[0],
      current: s.id === 'block-2.7' || s.id === 'block-2.8' ? '' : (s.sample ?? 'demo'),
      canHide: true
    }))
  mutate(slots)
  return slots
}

test('an explicit hidden list indexes all exact child IDs without mutating the paid plan or kit', () => {
  const { kit, planned } = fixture()
  const before = JSON.stringify({ kit, planned })
  const index = indexInputs({ plan: planned, kit: kit.doc, brief: {}, compileHiddenLists: true })
  assert.ok(!index.hidden.has('block-2.inactive'))
  for (const id of ['block-2.7', 'block-2.8']) assert.ok(index.hidden.has(id), id)
  assert.equal(JSON.stringify({ kit, planned }), before)
})

test('plan through write reuses actual empty children with live read-back and no list writes', async () => {
  const { kit, planned } = fixture()
  const done = await runStep({ plan: planned }, { slots: nativeSlots(kit) }, { kit })
  assert.equal(done.line('block-2.inactive'), undefined)
  for (const slot of ['block-2.7', 'block-2.8']) {
    assert.equal(done.line(slot).status, 'hidden', slot)
    assert.equal(done.line(slot).hiddenList, 'block-2.inactive')
  }
  assert.ok(
    done.site
      .applies()
      .every(
        (c) =>
          !['module-2.7', 'module-2.8'].some(
            (k) => k in (c.params.changes ?? {}) || (c.params.empty_slots ?? []).includes(k)
          )
      )
  )
  const read = (action, params) => done.site.door.apply({ siteKey: done.report.site, action, params })
  const report = { ...done.report, slots: ['block-2.7', 'block-2.8'].map((id) => done.line(id)) }
  assert.equal((await readBackGroup.run({ read, report })).failures.length, 0)
  done.site.held['module-2.7'] = 'reopened'
  // The fake site inspect uses supplied slots, so mutate the live fixture value it returns.
  const inspected = await read('content.contract', { operation: 'inspect' })
  inspected.slots.find((s) => s.key === 'module-2.7').current = 'reopened'
  assert.ok(
    (
      await readBackGroup.run({
        read: async (action, params) => (action === 'content.contract' ? inspected : read(action, params)),
        report
      })
    ).failures.some((f) => f.slot === 'block-2.7')
  )
})

test('one missing, nonempty, null or non-string native child fails the whole hidden list without writes', async () => {
  for (const scenario of ['missing', 'nonempty', 'null', 'number', 'absent-current', 'wrong-native-type']) {
    const { kit, planned } = fixture()
    const slots = nativeSlots(kit, (slots) => {
      const at = slots.findIndex((s) => s.key === 'module-2.8')
      if (scenario === 'missing') slots.splice(at, 1)
      else if (scenario === 'absent-current') delete slots[at].current
      else if (scenario === 'wrong-native-type') slots[at].type = 'image'
      else slots[at].current = scenario === 'nonempty' ? '/kept' : scenario === 'null' ? null : 0
    })
    const done = await runStep({ plan: planned }, { slots }, { kit })
    for (const id of ['block-2.7', 'block-2.8'])
      assert.equal(done.line(id).status, 'failed', `${scenario} ${id}`)
    assert.ok(
      done.site.applies().every((c) => !(c.params.empty_slots ?? []).some((k) => /^module-2\.[78]$/.test(k)))
    )
  }
})

test('unresolved child definitions and conflicting kept copy stay blocked rather than partly compiling', async () => {
  for (const scenario of ['unresolved', 'conflict', 'planned-list']) {
    const { kit, planned } = fixture()
    if (scenario === 'unresolved')
      kit.doc.blocks.find((b) => b.id === 'block-2').lists[0].rowSlots.push({ field: 'unknown' })
    if (scenario === 'conflict')
      planned.pages[0].blocks[0].copy.push({ slot: 'block-2.7', says: 'keep these words', text: 'Keep' })
    if (scenario === 'planned-list')
      planned.pages[0].blocks[0].lists = [{ list: 'block-2.inactive', rows: 1, items: [] }]
    const done = await runStep({ plan: planned }, { slots: nativeSlots(kit) }, { kit })
    assert.equal(done.line('block-2.inactive').status, 'failed', scenario)
    assert.ok(!done.report.slots.some((s) => s.hiddenList === 'block-2.inactive' && s.status === 'hidden'))
  }
})

test('a competing writer claim blocks every compiled child even when the hide wins ownership', async () => {
  const { kit, planned } = fixture()
  const written = copy()
  written.slots.push({ slot: 'block-2.7', owner: 'writer', text: 'Competing words', factIds: [] })
  const done = await runStep({ plan: planned, copy: written }, { slots: nativeSlots(kit) }, { kit })
  for (const id of ['block-2.7', 'block-2.8']) assert.equal(done.line(id).status, 'failed', id)
})

test('nested concrete child IDs compile exactly; unresolved fields, non-slot lists and overlapping units do not', () => {
  const { kit, planned } = fixture()
  const lists = kit.doc.blocks.find((b) => b.id === 'block-2').lists
  lists[0].rowSlots = [
    {
      field: 'controls',
      slots: [
        { id: 'block-2.7', type: 'text' },
        { id: 'block-2.8', type: 'url' }
      ]
    }
  ]
  const nested = indexInputs({ plan: planned, kit: kit.doc, brief: {}, compileHiddenLists: true })
  assert.deepEqual([...nested.hiddenLists.keys()], ['block-2.7', 'block-2.8'])
  lists.push({ ...lists[0], id: 'block-2.overlap' })
  planned.pages[0].blocks[0].hiddenSlots.push({ slot: 'block-2.overlap', why: 'ambiguous shared children' })
  const overlapping = indexInputs({ plan: planned, kit: kit.doc, brief: {}, compileHiddenLists: true })
  for (const list of ['block-2.inactive', 'block-2.overlap'])
    assert.equal(overlapping.hiddenLists.get(list).invalid, true)
  assert.ok(!overlapping.hidden.has('block-2.7'))
  lists.pop()
  lists[0].rowKind = 'items'
  assert.equal(
    indexInputs({ plan: planned, kit: kit.doc, brief: {}, compileHiddenLists: true }).hiddenLists.get(
      'block-2.inactive'
    ).invalid,
    true
  )
})

test('populated lists without an explicit hide keep their paid plan and expected writer slots', () => {
  const { kit, planned } = fixture()
  const decision = planned.pages[0].blocks[0]
  decision.hiddenSlots = decision.hiddenSlots.filter((h) => h.slot !== 'block-2.inactive')
  decision.lists = [
    {
      list: 'block-2.inactive',
      rows: 1,
      items: [
        {
          copy: [
            { slot: 'block-2.7', says: 'the paid plan expects a second button', text: 'Visit us' },
            { slot: 'block-2.8', says: 'the contact page destination' }
          ]
        }
      ]
    }
  ]
  const before = JSON.stringify(planned)
  const index = indexInputs({ plan: planned, kit: kit.doc, brief: {}, compileHiddenLists: true })
  assert.equal(index.hiddenLists.size, 0)
  assert.ok(index.expected.has('block-2.7'))
  assert.ok(index.expected.has('block-2.8'))
  assert.equal(JSON.stringify(planned), before)
})

test('default writer and copy-check indexing preserves frozen hidden-list semantics', () => {
  const { kit, planned } = fixture()
  const index = indexInputs({ plan: planned, kit: kit.doc, brief: {} })
  assert.ok(index.hidden.has('block-2.inactive'))
  assert.ok(!index.hidden.has('block-2.7'))
  assert.ok(!index.hidden.has('block-2.8'))
  assert.ok(!('hiddenLists' in index))
})

test('native whitespace empties use existing empty read-back semantics without child writes', async () => {
  const { kit, planned } = fixture()
  const slots = nativeSlots(kit, (slots) => {
    slots.find((s) => s.key === 'module-2.8').current = ' \n  '
  })
  const done = await runStep({ plan: planned }, { slots }, { kit })
  for (const id of ['block-2.7', 'block-2.8']) assert.equal(done.line(id).status, 'hidden')
  const read = (action, params) => done.site.door.apply({ siteKey: done.report.site, action, params })
  const check = await readBackGroup.run({
    read,
    report: { ...done.report, slots: ['block-2.7', 'block-2.8'].map((id) => done.line(id)) }
  })
  assert.equal(check.failures.length, 0)
  assert.ok(
    done.site.applies().every((c) => !(c.params.empty_slots ?? []).some((k) => /^module-2\.[78]$/.test(k)))
  )
})
