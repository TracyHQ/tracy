import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ciRepository } from '../ci/ci-repository.mjs'

test('in Actions the runner names the repository, when it is one of our two homes', () => {
  assert.equal(ciRepository({ GITHUB_REPOSITORY: 'TracyHQ/tracy' }), 'TracyHQ/tracy')
  assert.equal(
    ciRepository({ GITHUB_REPOSITORY: 'TracyHQ/tch', TRACY_SOURCE_REPO: 'TracyHQ/tracy' }),
    'TracyHQ/tch'
  )
})

test('outside Actions (or on a fork) TRACY_SOURCE_REPO decides, TracyHQ/tch until cutover', () => {
  assert.equal(ciRepository({}), 'TracyHQ/tch')
  assert.equal(ciRepository({ TRACY_SOURCE_REPO: 'TracyHQ/tracy' }), 'TracyHQ/tracy')
  assert.equal(
    ciRepository({ GITHUB_REPOSITORY: 'someone/tracy', TRACY_SOURCE_REPO: 'TracyHQ/tracy' }),
    'TracyHQ/tracy'
  )
  assert.equal(ciRepository({ GITHUB_REPOSITORY: 'someone/tracy' }), 'TracyHQ/tch')
})

test('a TRACY_SOURCE_REPO outside the two homes is refused, never silently replaced', () => {
  assert.throws(() => ciRepository({ TRACY_SOURCE_REPO: 'someone/tracy' }), /TRACY_SOURCE_REPO/)
})
