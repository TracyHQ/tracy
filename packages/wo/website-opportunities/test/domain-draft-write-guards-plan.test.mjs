// The guards of the draft write on pictures, held texts, the approved plan and pairs (ticket #597), each caught before
// any door is called, and the error of a guard naming no customer text. The value guards:
// `domain-draft-write-guards.test.mjs`.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-guards-plan.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { codeOf, guarded, kit, plan, site, valueWhere } from './fixtures/draft-write/guarded.mjs'

test('guard picture_without_alt: a shown picture with no alt text', () => {
  const code = guarded((p) => {
    p.ops.find((op) => op.kind === 'picture.upload' && op.pictureKind === 'picture').alt = ' '
  })
  assert.equal(code, 'picture_without_alt')
})

test('guard picture_web_address_only and picture_not_stored: pictures come from stored bytes only', () => {
  const op = (p) => p.ops.find((o) => o.kind === 'picture.upload')
  assert.equal(
    guarded((p) => {
      Object.assign(op(p), { stored: null, ref: 'https://photos.example/rose.jpg' })
    }),
    'picture_web_address_only'
  )
  assert.equal(
    guarded((p) => {
      op(p).stored = null
    }),
    'picture_not_stored'
  )
  assert.equal(
    codeOf(() => writePlanOf(site.order, site.aiq, { stored: {} })),
    'picture_not_stored'
  )
})

test('guard held_text_in_value: a held name in a value, an alt text or a record title, in any form', () => {
  const withheld = { names: ['Marigold Thorne'] }
  assert.equal(
    guarded(() => {}, { withheld }),
    'passed'
  )
  assert.equal(
    guarded(
      (p) => {
        p.ops.find((op) => op.kind === 'picture.upload').alt = 'Marigold Thorne at the counter'
      },
      { withheld }
    ),
    'held_text_in_value'
  )
  assert.equal(
    guarded(
      (p) => {
        valueWhere(p, (_, v) => v.entry === 'home.home-b3.paragraph').value = 'see marigold-thorne'
      },
      { withheld }
    ),
    'held_text_in_value'
  )
})

test('guard block_not_approved: a block of the order the approved plan does not place', () => {
  const approved = structuredClone(site.build.approval.plan)
  assert.equal(
    guarded(() => {}, { approved }),
    'passed'
  )
  approved.pages.find((page) => page.id === 'home').blocks.splice(2, 1)
  assert.equal(
    guarded(() => {}, { approved }),
    'block_not_approved'
  )
})

test('guard pair_incomplete: one half of a button written without the other, one icon version without its pair', () => {
  assert.equal(
    guarded((p) => {
      p.controls.find((c) => c.written.every(Boolean)).written[1] = false
    }),
    'pair_incomplete'
  )
  assert.equal(
    guarded((p) => {
      p.pairs = [
        { entry: 'home.home-b4.service-seasonal-posy.item-icon-2', fields: ['item-icon', 'item-icon-2'] }
      ]
    }),
    'pair_incomplete'
  )
})

test('a guard error names entities, slots and lengths, never the customer text', () => {
  const p = structuredClone(plan)
  valueWhere(p, (_, v) => v.entry === 'home.home-b3.paragraph').value = 'Secret florist words '.repeat(5)
  try {
    guardPlan(p, { order: site.order, kit })
    assert.fail('the guard passed')
  } catch (error) {
    assert.equal(error.code, 'text_over_limit')
    assert.doesNotMatch(JSON.stringify(error.details) + error.message, /Secret florist/)
  }
})
