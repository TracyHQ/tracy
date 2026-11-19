// A write plan always yields a default menu item (#575: a written site with none answered 404 at its root). Invented ids.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-default-item.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withDefaultItem } from '../domain/draft-write-skip.mjs'

const item = (key, home, menutype = 'zqmenu') => ({
  key,
  kind: 'menuItem.create',
  fields: { menutype, home }
})

test('with no default item the first page item of the main menu takes the flag, and it is listed', () => {
  const skipped = []
  const ops = withDefaultItem(
    [item('zq-foot', 0, 'zqfoot'), item('zq-a', 0), item('zq-b', 0)],
    'zqmenu',
    skipped
  )
  assert.deepEqual(
    ops.map((op) => [op.key, op.fields.home]),
    [
      ['zq-foot', 0],
      ['zq-a', 1],
      ['zq-b', 0]
    ]
  )
  assert.deepEqual(skipped, [
    { code: 'default_page_moved', op: 'zq-a', place: null, reason: null, at: 'plan' }
  ])
})

test('a plan with its default item is left as it is', () => {
  const ops = [item('zq-a', 1), item('zq-b', 0)]
  assert.equal(withDefaultItem(ops, 'zqmenu'), ops)
})
