// The guards of the draft write on values (ticket #597), each caught before any door is called: the plan of the JA
// Boxing florist passes them all, and one change to the plan or the order makes exactly the named guard fail, with
// `noRerun` (a second attempt of the step would fail the same way). Pictures, held texts, approval and pairs:
// `domain-draft-write-guards-plan.test.mjs`.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-guards.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import {
  contractSlot,
  fieldEntry,
  guarded,
  kit,
  plan,
  site,
  valueWhere
} from './fixtures/draft-write/guarded.mjs'

test('the plan of the florist passes every guard', () => {
  assert.equal(
    guarded(() => {}),
    'passed'
  )
})

test('guard text_over_limit: a value longer than its field limit, or than its contract slot limit', () => {
  assert.equal(
    guarded((p) => {
      valueWhere(p, (_, v) => v.entry === 'home.home-b3.paragraph').value = 'x'.repeat(59)
    }),
    'text_over_limit'
  )
  // The field states no limit of its own: the contract slot's limit alone catches it.
  const order = structuredClone(site.order)
  delete fieldEntry(order, 'home.home-b5.try-button-label').limit
  const p = structuredClone(plan)
  const v = valueWhere(p, (op, at) => contractSlot(op, at) && at.entry === 'home.home-b5.try-button-label')
  const limit = kit.slots.get(v.loc.slot).maxCharacters
  v.value = 'x'.repeat(limit + 1)
  assert.throws(
    () => guardPlan(p, { order, kit }),
    (error) => {
      assert.equal(error.code, 'text_over_limit')
      assert.equal(error.details.problems[0].limit, limit)
      return true
    }
  )
})

test('guard straight_quote_in_open_slot: a straight double quote sent to a slot that opens empty', () => {
  const code = guarded((p) => {
    valueWhere(p, (op, v) => contractSlot(op, v)?.opensEmpty && typeof v.value === 'string').value =
      'Say "yes"'
  })
  assert.equal(code, 'straight_quote_in_open_slot')
})

test('guard empty_text_node: an empty value at a text node', () => {
  const code = guarded((p) => {
    valueWhere(p, (op, v) => op.kind !== 'contract.apply' && (v.loc.xpath ?? '').endsWith('text()')).value =
      ''
  })
  assert.equal(code, 'empty_text_node')
})

test('guard markup_forbidden: a tag through the contract, markers at an HTML place, a tag the field does not declare', () => {
  assert.equal(
    guarded((p) => {
      valueWhere(p, (op, v) => contractSlot(op, v) && typeof v.value === 'string').value = '<b>Bold</b>'
    }),
    'markup_forbidden'
  )
  assert.equal(
    guarded((p) => {
      valueWhere(
        p,
        (op, v) => op.kind !== 'contract.apply' && v.loc.xpath && typeof v.value === 'string'
      ).value = '((em))Wild((/em))'
    }),
    'markup_forbidden'
  )
  const order = structuredClone(site.order)
  fieldEntry(order, 'home.home-b3.paragraph').value = 'Fresh <script>x</script>'
  assert.equal(
    guarded(() => {}, { order }),
    'markup_forbidden'
  )
})

test('guard icon_not_in_list: a network class the icon font lacks, an image icon not in the icon library', () => {
  assert.equal(
    guarded((p) => {
      valueWhere(p, (_, v) => v.rule === 'icon_class').value = 'fab fa-unknown-network'
    }),
    'icon_not_in_list'
  )
  const order = structuredClone(site.order)
  const icon = order.icons.find((i) => i.storage === 'image-file')
  Object.assign(icon, { source: 'library', icon: { name: 'flower-unknown' } })
  assert.equal(
    guarded(() => {}, { order, iconKeys: ['flower-rose'] }),
    'icon_not_in_list'
  )
})
