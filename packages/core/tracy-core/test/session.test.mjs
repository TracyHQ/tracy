import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mainSessionOf } from '../src/session/index.mjs'

test('mainSessionOf: the session the main view retains, by dsh 0.1.6-alpha.2 shape', () => {
  const list = {
    byId: {
      a: { retainedBy: {} },
      b: { retainedBy: { mainView: 1, sidebar: 2 } },
      c: { retainedBy: { sidebar: 1 } }
    }
  }
  assert.equal(mainSessionOf(list), 'b')
})

test('mainSessionOf: undefined when no session is on screen, and on rows without counts', () => {
  assert.equal(mainSessionOf({ byId: {} }), undefined)
  assert.equal(
    mainSessionOf({ byId: { a: { retainedBy: { mainView: 0 } }, b: undefined, c: {} } }),
    undefined
  )
})

test('mainSessionOf: the pre-alpha.2 `current` field is NOT read — a list that only has it answers nothing', () => {
  // A caller that still fakes the old shape learns here, not on a customer's page.
  assert.equal(mainSessionOf({ byId: { s1: { cwd: '/w' } }, current: 's1' }), undefined)
})
