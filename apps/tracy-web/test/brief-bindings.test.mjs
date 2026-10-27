/**
 * A binding decides where a customer's words land. These tests hold one rule from both sides: a
 * link the release declares is accepted, and a link nobody declared BLOCKS — it is never guessed
 * and never skipped.
 *
 * ⚠ THE LAST TEST IS THE MEASURED STATE OF THE REPO, NOT A HYPOTHETICAL. No contract shipping today
 * carries `semanticKey`, so against a contract as captured today every group is unresolved. That is
 * a blocker on the capture side, and this test exists so the day it changes is a day a test moves.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertResolved,
  BindingsUnresolvedError,
  isDerivedSlot,
  resolveBindings,
  UNRESOLVED
} from '../src/brief/bindings.js'

const RELEASE = { tag: 'tracy-business-j6', contract: 'tracy-business@1.1.0' }

/** A slot as `inspect` returns one, plus the semantic key a FUTURE capture would add. */
const slot = (over = {}) => ({
  key: 'module-441.2',
  entity: 'module-441',
  type: 'text',
  sample: 'Welcome to our bakery',
  maxCharacters: 80,
  requiresEvidence: false,
  ...over
})

test('a slot that declares its own semantic key binds, and the evidence is recorded', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot({ semanticKey: 'hero.headline' })],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  assert.equal(result.bindings[0].slotKey, 'module-441.2')
  assert.equal(result.bindings[0].evidence, 'slot-semantic-key')
  assert.equal(result.bindings[0].maxCharacters, 80)
})

test('a capability row that names its slots is the other accepted evidence', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot()],
    capabilities: { capabilities: [{ key: 'hero.headline', kind: 'block', slotKeys: ['module-441.2'] }] },
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.equal(result.bindings[0].evidence, 'capability-slot-map')
})

test('NO EVIDENCE MEANS BLOCKED — not a guess, and not a silent skip', () => {
  const result = resolveBindings({
    release: RELEASE,
    // A slot whose label screams "hero heading". Nothing declares the link, so nothing binds.
    slots: [slot({ label: 'Hero heading' })],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.deepEqual(result.unresolved, [
    { group: 'g1', semanticKey: 'hero.headline', why: UNRESOLVED.NO_SLOT }
  ])
  assert.throws(
    () => assertResolved(result),
    (error) => {
      assert.ok(error instanceof BindingsUnresolvedError)
      assert.equal(error.code, 'BINDINGS_UNRESOLVED')
      assert.deepEqual(
        error.unresolved.map((u) => u.group),
        ['g1']
      )
      return true
    }
  )
})

test('a translated copy is never bound — the language machinery writes those, not a seed', () => {
  for (const marker of [
    { translates: 'module-441.2' },
    { sourceKey: 'module-441.2' },
    { key: 'zh-TW::module-441.2' }
  ]) {
    const candidate = slot({ semanticKey: 'hero.headline', ...marker })
    assert.equal(isDerivedSlot(candidate), true)
    const result = resolveBindings({
      release: RELEASE,
      slots: [candidate],
      groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
    })
    assert.deepEqual(result.bindings, [])
    assert.equal(result.unresolved[0].why, UNRESOLVED.DERIVED)
  }
})

test('a source slot still binds when its translated copy sits beside it', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ semanticKey: 'hero.headline' }),
      slot({ key: 'zh-TW::module-441.2', semanticKey: 'hero.headline', sourceKey: 'module-441.2' })
    ],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings[0].slotKey, 'module-441.2')
})

test('two slots declaring the same group is ambiguous, and ambiguity is not a coin toss', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ semanticKey: 'hero.headline' }),
      slot({ key: 'module-999.1', semanticKey: 'hero.headline' })
    ],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.equal(result.unresolved[0].why, UNRESOLVED.AMBIGUOUS)
})

test('a slot the Claude Cowork plugin marks unwritable is unresolved, not written anyway', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot({ semanticKey: 'hero.headline', writable: false })],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.equal(result.unresolved[0].why, UNRESOLVED.NOT_WRITABLE)
})

test('the binding hash is stable and changes when a binding changes', () => {
  const of = (slotKey) =>
    resolveBindings({
      release: RELEASE,
      slots: [slot({ key: slotKey, semanticKey: 'hero.headline' })],
      groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
    }).hash
  assert.equal(of('module-441.2'), of('module-441.2'))
  assert.notEqual(of('module-441.2'), of('module-999.1'))
})

test('bindings need a pinned release', () => {
  assert.throws(() => resolveBindings({ release: {}, slots: [], groups: [] }), /pinned release/)
})

test('BLOCKED TODAY: a contract as captured today declares no semantic key, so every group blocks', () => {
  // The shape of a `content-map.json` slot as the capture script writes it — key, entity, type,
  // sample, maxCharacters. No semanticKey, and no capability row naming it. Measured 22/09/2026
  // across all ten contracts under packages/cms/tracy-*-quickstart/contracts/.
  const asCapturedToday = [
    { key: 'module-441.2', entity: 'module-441', type: 'text', sample: 'Welcome', maxCharacters: 80 },
    { key: 'article-12.title', entity: 'article-12', type: 'text', sample: 'Our story', maxCharacters: 120 }
  ]
  for (const captured of asCapturedToday) assert.equal('semanticKey' in captured, false)
  const result = resolveBindings({
    release: RELEASE,
    slots: asCapturedToday,
    groups: [
      { id: 'g1', semanticKey: 'hero.headline' },
      { id: 'g2', semanticKey: 'about.body' }
    ]
  })
  assert.deepEqual(result.bindings, [])
  assert.deepEqual(
    result.unresolved.map((u) => u.why),
    [UNRESOLVED.NO_SLOT, UNRESOLVED.NO_SLOT]
  )
  assert.throws(() => assertResolved(result), BindingsUnresolvedError)
})

/**
 * A capability row as session A's reader emits one for a PHYSICAL slot
 * (`lib/quickstart-capabilities.js`, commit 17743927c): `kind: 'slot'`, a key namespaced
 * `slot:<contract key>`, and `block` naming the block it belongs to. No `slotKeys` anywhere — zero
 * rows of 1204 carry one on `tracy-base/j6`, which is why the block is the evidence that exists.
 */
const capSlot = (over = {}) => ({
  key: 'slot:module-441.2',
  kind: 'slot',
  label: 'Welcome heading',
  block: 'block:module-441',
  type: 'text',
  limit: 80,
  requiresEvidence: false,
  can: ['replace'],
  evidence: 'declared',
  works: { ui: 'declared', backend: 'unknown' },
  ...over
})

test('a block with exactly one writable slot resolves, and the evidence names the block', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot(), slot({ key: 'module-999.1', entity: 'module-999' })],
    capabilities: {
      capabilities: [
        capSlot(),
        capSlot({ key: 'slot:module-999.1', block: 'block:module-999', label: 'Other heading' })
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  assert.equal(result.bindings[0].slotKey, 'module-441.2')
  assert.equal(result.bindings[0].evidence, 'capability-slot-block')
})

test('the snapshot’s `slot:` prefix is cut before the Claude Cowork plugin inventory is searched', () => {
  // The Claude Cowork plugin keys its own inventory BARE, and a decoy carrying the namespaced spelling sits
  // beside it: drop `physicalKeyOf` and this binds the decoy (or nothing at all), never `module-170.0`.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-170.0', entity: 'module-170', sample: 'the real slot' }),
      slot({ key: 'slot:module-170.0', entity: 'module-170', sample: 'the decoy' })
    ],
    capabilities: {
      capabilities: [capSlot({ key: 'slot:module-170.0', block: 'block:module-170' })]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-170' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  assert.equal(result.bindings[0].slotKey, 'module-170.0')
  assert.equal(result.bindings[0].sample, 'the real slot')
  assert.equal(result.bindings[0].evidence, 'capability-slot-block')
})

test('a block holding several writable slots resolves to ONE binding covering all of them, in release order', () => {
  // A block that holds many slots is not a contradiction — it is a block. The release says which
  // slots it is made of and in which order, so the binding carries all of them, ordered as the
  // release declares them. The inventory below is deliberately in the OPPOSITE order, so a binding
  // that took its order from the Claude Cowork plugin's array instead of the snapshot fails here.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-441.4', entity: 'module-441', sample: 'third' }),
      slot({ key: 'module-441.3', entity: 'module-441', sample: 'second' }),
      slot({ key: 'module-441.2', entity: 'module-441', sample: 'first' })
    ],
    capabilities: {
      capabilities: [
        capSlot({ key: 'slot:module-441.2' }),
        capSlot({ key: 'slot:module-441.3', label: 'Welcome body' }),
        capSlot({ key: 'slot:module-441.4', label: 'Welcome footnote' })
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  const [binding] = result.bindings
  assert.equal(binding.evidence, 'capability-slot-block')
  assert.equal(binding.slots.length, 3)
  assert.deepEqual(
    binding.slots.map((s) => s.slotKey),
    ['module-441.2', 'module-441.3', 'module-441.4']
  )
  assert.deepEqual(
    binding.slots.map((s) => s.sample),
    ['first', 'second', 'third']
  )
  // 🔒 NO `slotKey` AT BINDING LEVEL. A caller that could read one key off a multi-slot binding
  // would write one slot and believe it had written the block. The plural field is the only one.
  assert.equal('slotKey' in binding, false)
  assert.equal(binding.slots[0].maxCharacters, 80)
})

test('two slots declaring the SAME semantic key stay AMBIGUOUS even when a block also covers them', () => {
  // 🔒 THE BOUNDARY OF THE BLOCK BRANCH. What decides is the KIND OF EVIDENCE, not the count:
  // `slot-semantic-key` twice is the release contradicting itself about one name, and picking a
  // winner would be guessing with extra steps. Delete the evidence split and this test goes red.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-441.2', entity: 'module-441', semanticKey: 'hero.headline' }),
      slot({ key: 'module-441.3', entity: 'module-441', semanticKey: 'hero.headline' })
    ],
    capabilities: {
      capabilities: [
        capSlot({ key: 'slot:module-441.2', block: 'block:hero.headline' }),
        capSlot({ key: 'slot:module-441.3', block: 'block:hero.headline', label: 'Welcome body' })
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.deepEqual(result.unresolved, [
    { group: 'g1', semanticKey: 'hero.headline', why: UNRESOLVED.AMBIGUOUS }
  ])
  assert.throws(() => assertResolved(result), BindingsUnresolvedError)
})

test('a block whose every slot is unwritable is NOT_WRITABLE, not an empty binding', () => {
  // The failure this rules out is a binding with `slots: []` — resolved on paper, a no-op write in
  // practice, and nothing downstream would ever ask why the block came out untouched.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-441.2', entity: 'module-441', writable: false }),
      slot({ key: 'module-441.3', entity: 'module-441', writable: false })
    ],
    capabilities: {
      capabilities: [
        capSlot({ key: 'slot:module-441.2' }),
        capSlot({ key: 'slot:module-441.3', label: 'Welcome body' })
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.deepEqual(result.unresolved, [
    { group: 'g1', semanticKey: 'block:module-441', why: UNRESOLVED.NOT_WRITABLE }
  ])
})

test('a multi-slot block binding carries only the real slots — the translated copy is left out', () => {
  // Two writable slots plus a translation of the first. The language machinery owns that copy, so
  // it is not part of what a seed writes: the binding holds two slots, never three.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-441.2', entity: 'module-441' }),
      slot({ key: 'module-441.3', entity: 'module-441', label: 'Welcome body' }),
      slot({ key: 'zh-TW::module-441.2', entity: 'module-441', sourceKey: 'module-441.2' })
    ],
    capabilities: {
      capabilities: [
        capSlot({ key: 'slot:module-441.2' }),
        capSlot({ key: 'slot:module-441.3', label: 'Welcome body' }),
        capSlot({ key: 'slot:zh-TW::module-441.2', label: 'Welcome heading (zh-TW)' })
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  assert.deepEqual(
    result.bindings[0].slots.map((s) => s.slotKey),
    ['module-441.2', 'module-441.3']
  )
})

test('a block of exactly one slot keeps the ONE-SLOT binding shape — `slotKey`, and no `slots`', () => {
  // The patch added a plural shape; it must not have changed the singular one. Anything already
  // reading `binding.slotKey` for a one-slot block keeps working, and gets no `slots` to half-read.
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot({ key: 'module-441.2', entity: 'module-441' })],
    capabilities: { capabilities: [capSlot({ key: 'slot:module-441.2' })] },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  const [binding] = result.bindings
  assert.equal(binding.slotKey, 'module-441.2')
  assert.equal('slots' in binding, false)
  assert.equal(binding.evidence, 'capability-slot-block')
})

test('a MEANINGFUL group name is still NO_SLOT, even with a whole block of slots sitting in the snapshot', () => {
  // 🔒 THE PATCH MUST NOT HAVE BOUGHT MEANING. Three slots, a block that holds all three, labels
  // that shout "hero" — and a group asking for `hero.headline`. Nothing in the release declares
  // that this block IS the hero, so the answer stays "the release says nothing", not a binding
  // picked by how similar the strings look.
  const result = resolveBindings({
    release: RELEASE,
    slots: [
      slot({ key: 'module-441.2', entity: 'module-441', label: 'Hero headline' }),
      slot({ key: 'module-441.3', entity: 'module-441', label: 'Hero subheadline' }),
      slot({ key: 'module-441.4', entity: 'module-441', label: 'Hero body' })
    ],
    capabilities: {
      capabilities: [
        capSlot({ key: 'slot:module-441.2', label: 'Hero headline' }),
        capSlot({ key: 'slot:module-441.3', label: 'Hero subheadline' }),
        capSlot({ key: 'slot:module-441.4', label: 'Hero body' }),
        { key: 'block:module-441', kind: 'block', label: 'Hero', slots: ['slot:module-441.2'] }
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.deepEqual(result.unresolved, [
    { group: 'g1', semanticKey: 'hero.headline', why: UNRESOLVED.NO_SLOT }
  ])
})

test('a meaningful name no release declares stays unresolved — a block is not a hero', () => {
  // Every label here shouts "hero", and one block even holds a single writable slot. Nothing
  // declares that the block IS `hero.headline`, so string similarity buys nothing.
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot({ label: 'Hero headline' })],
    capabilities: {
      capabilities: [
        capSlot({ label: 'Hero headline', meaning: { role: 'hero', by: 'rule' } }),
        { key: 'block:module-441', kind: 'block', label: 'Hero', slots: ['slot:module-441.2'] }
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.equal(result.unresolved[0].why, UNRESOLVED.NO_SLOT)
})

test('a translated copy inside a block is skipped, and a block of nothing else is DERIVED', () => {
  for (const [physicalKey, marker] of [
    ['module-441.9', { translates: 'module-441.2' }],
    ['module-441.9', { sourceKey: 'module-441.2' }],
    ['zh-TW::module-441.2', {}]
  ]) {
    const derived = slot({ key: physicalKey, entity: 'module-441', ...marker })
    assert.equal(isDerivedSlot(derived), true)
    const capabilities = {
      capabilities: [capSlot(), capSlot({ key: `slot:${physicalKey}`, label: 'Welcome heading (zh-TW)' })]
    }
    // The source slot beside its copy: one writable candidate, so the block still resolves.
    const both = resolveBindings({
      release: RELEASE,
      slots: [slot(), derived],
      capabilities,
      groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
    })
    assert.deepEqual(both.unresolved, [])
    assert.equal(both.bindings.length, 1)
    assert.equal(both.bindings[0].slotKey, 'module-441.2')

    // The same block with the copy alone: declared, but nothing a seed may write.
    const only = resolveBindings({
      release: RELEASE,
      slots: [derived],
      capabilities,
      groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
    })
    assert.deepEqual(only.bindings, [])
    assert.equal(only.unresolved[0].why, UNRESOLVED.DERIVED)
  }
})

test('a row that is not a slot does not become one by carrying a `block` field', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot({ key: 'article-12.title', entity: 'article-12' })],
    capabilities: {
      capabilities: [
        // Same shape as a slot row in every field the block branch reads, except `kind`.
        { key: 'slot:article-12.title', kind: 'article', block: 'block:module-441', type: 'text' }
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.bindings, [])
  assert.equal(result.unresolved[0].why, UNRESOLVED.NO_SLOT)
})

test('one slot declared by BOTH evidences is counted once, not turned into an ambiguity', () => {
  const result = resolveBindings({
    release: RELEASE,
    slots: [slot()],
    capabilities: {
      capabilities: [
        { key: 'block:module-441', kind: 'block', slots: ['slot:module-441.2'], slotKeys: ['module-441.2'] },
        capSlot()
      ]
    },
    groups: [{ id: 'g1', semanticKey: 'block:module-441' }]
  })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.bindings.length, 1)
  assert.equal(result.bindings[0].slotKey, 'module-441.2')
  assert.equal(result.bindings[0].evidence, 'capability-slot-map')
})
