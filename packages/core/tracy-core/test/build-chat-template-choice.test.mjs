// The build chat's template choice as data (#605): only templates with a released AI quickstart that fit the business
// are offered, and the choice is what the build draft stores.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { templateChoiceOf, templateOfChoice } from '../src/build-chat/index.mjs'
import { TEMPLATES } from './fixtures/build-chat/stages.mjs'

test('only a released, fitting template is offered; one fits, so one card with its reason', () => {
  const choice = templateChoiceOf(TEMPLATES)
  assert.deepEqual(
    choice.options.map((o) => o.name),
    ['JA Boxing']
  )
  const [boxing] = choice.options
  assert.ok(boxing.reason.length > 0)
  assert.ok(boxing.picture.length > 0)
  assert.equal(choice.chosen, 'ja-boxing')
  assert.equal(choice.none, false)
})

test('a template without a released AI quickstart is never offered, even when it fits', () => {
  const unreleased = TEMPLATES.filter((t) => t.quickstart !== 'released')
  assert.ok(unreleased.length > 0, 'the sample keeps templates that are not ready')
  assert.ok(unreleased.some((t) => t.fits))
  const names = templateChoiceOf(TEMPLATES).options.map((o) => o.name)
  for (const t of unreleased) assert.ok(!names.includes(t.name), t.name)
})

test('a released template that does not fit the business is not offered', () => {
  const choice = templateChoiceOf(TEMPLATES.map((t) => ({ ...t, fits: false })))
  assert.deepEqual(choice.options, [])
  assert.equal(choice.none, true)
  assert.equal(choice.chosen, null)
  assert.equal(templateChoiceOf(undefined).none, true)
})

test('the recommended template is chosen first; with none recommended the first one is', () => {
  const two = [
    { ...TEMPLATES[0], slug: 'a', name: 'A', recommended: false },
    { ...TEMPLATES[0], slug: 'b', name: 'B', recommended: true }
  ]
  assert.equal(templateChoiceOf(two).chosen, 'b')
  assert.equal(templateChoiceOf(two.map((t) => ({ ...t, recommended: false }))).chosen, 'a')
})

test('the choice is the build draft template body: slug, name, version, nothing else', () => {
  const [boxing] = templateChoiceOf(TEMPLATES).options
  assert.deepEqual(templateOfChoice(boxing), { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.0' })
})
