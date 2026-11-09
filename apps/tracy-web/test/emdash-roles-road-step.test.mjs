// The Road to live reads an EmDash release's slot roles from its theme's field map, though no contract folder seals it
// (ADR 0038 decision 5): `rolesOfRelease` answered "none" for a release whose reader said "field-map, ready".
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentCoverageStep } from '../src/lib/content-coverage/road-step.js'
import { rolesOfRead, rolesOfRelease } from '../src/lib/content-coverage/roles.js'

const emdash = (template, version) => ({
  tag: `${template}/emdash-0.x`,
  platform: 'emdash',
  setting: { template, version }
})
const put = (step, state, code, params) => ({ step, state, code, params })

for (const [template, version] of [
  ['tracy-diner', '0.1.0'],
  ['tracy-restaurant', '1.0.1'],
  ['tracy-base', '0.5.8']
]) {
  test(`${template} ${version}: roles read from the theme's field map are ready`, () => {
    assert.deepEqual(rolesOfRelease(emdash(template, version), new Map()), { state: 'ready' })
  })
}

test('an EmDash release whose roles are ready passes Content coverage, new or live', () => {
  const release = emdash('tracy-diner', '0.1.0')
  const roles = rolesOfRelease(release, new Map())
  const run = (rel) =>
    contentCoverageStep(put, () => undefined, {
      release: rel,
      version: '0.1.0',
      coverage: { state: 'none' },
      roles,
      fit: { state: 'none' }
    })
  assert.deepEqual([run(release).state, run(release).code], ['done', 'coverage-not-needed'])
})

test('a field-map read: fields without a role are the missing group, any other fault is invalid', () => {
  const read = (errors, state = 'invalid') => ({ source: 'field-map', state, errors, gaps: [] })
  assert.deepEqual(rolesOfRead(read([], 'ready'), null), { state: 'ready' })
  assert.deepEqual(
    rolesOfRead(
      read([
        'field "chrome.copyright" has no role',
        'repeater sub-field "menu.items.dish_name" has no role',
        'settings field "title" has no role'
      ]),
      null
    ),
    {
      state: 'missing',
      count: 3,
      shown: ['chrome.copyright', 'menu.items.dish_name', 'title'],
      reason: null
    }
  )
  assert.deepEqual(rolesOfRead(read(['field "a.b" has unknown role "x"']), null), {
    state: 'invalid',
    reason: 'field "a.b" has unknown role "x"'
  })
})
