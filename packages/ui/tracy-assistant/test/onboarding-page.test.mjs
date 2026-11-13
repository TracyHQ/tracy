// The creation workspace's chat box: Help only, except in the chats whose agent the seat door chose.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { helpOnlyComposer } from '../src/client/onboarding-page.ts'

const BUILD = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const at = (pathname, base = 'https://tracy.example.test/new/', extra = {}) =>
  helpOnlyComposer({ widget: false, pathname, base, audience: null, ...extra })

test('the creation workspace keeps its Help-only composer, as before', () => {
  assert.equal(at('/new/'), true)
  assert.equal(at('/new/s/session-1'), true, 'an ordinary session of that workspace still asks Help only')
  assert.equal(at('/elsewhere/', 'https://tracy.example.test/elsewhere/', { audience: 'onboarding' }), true)
})

test('the build chat keeps the agent composer (TracyHQ/tracy#602)', () => {
  assert.equal(at(`/new/s/${BUILD}`), false)
})

test("the widget's native conversation and a site's workspace keep theirs", () => {
  assert.equal(
    at('/new/s/session-widget-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e', undefined, { widget: true }),
    false
  )
  assert.equal(at('/site.example.test/', 'https://tracy.example.test/site.example.test/'), false)
  assert.equal(at(`/site.example.test/s/${BUILD}`, 'https://tracy.example.test/site.example.test/'), false)
})
