import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseChoices, readBuildBase, saveBuildBase } from '../src/lib/build-base.js'
import { loadDesignRegistry, resolveDesignPlan } from '../src/lib/joomla-designs.js'

const loaded = loadDesignRegistry()
test('a missing profile preserves the requested design and selects the released Base for construction', () => {
  const plan = resolveDesignPlan(loaded, 'stripe')
  assert.equal(plan.requestedDesign, 'stripe')
  assert.equal(plan.effectiveDesign, 'stripe')
  assert.equal(plan.baseQuickstart, 'tracy-base/j6')
  assert.equal(plan.workflow, 'template-build')
  assert.equal(plan.contractProfile, 'tracy-base/j6/1.0.1')
  assert.equal(resolveDesignPlan(loaded, 'apple').baseQuickstart, 'tracy-apple/j6')
  assert.equal(resolveDesignPlan(loaded, 'airbnb').effectiveDesign, 'airbnb')
  assert.equal(resolveDesignPlan(loaded, '../unknown'), null)
  assert.throws(() => resolveDesignPlan(loaded, 'stripe', 'https://evil.test/base'))
})
const joomla = baseChoices('joomla', loaded, [])

test('the running environment defaults to Base, and refuses a configured artifact missing from its image', async () => {
  assert.equal(
    (await readBuildBase({ query: async () => ({ rows: [] }) }, 'joomla', joomla)).quickstart,
    'tracy-base/j6'
  )
  await assert.rejects(
    readBuildBase({ query: async () => ({ rows: [{ quickstart: 'missing' }] }) }, 'joomla', joomla)
  )
})

/** The releases this server has read, as `readReleases` hands them over. */
const RELEASES = [
  {
    tag: 'tracy-business/emdash-0.x',
    platform: 'emdash',
    choosable: true,
    setting: { label: 'Tracy Business', version: '1.0.0' }
  },
  // Read, but a draft: it may not be a base, and the list must not offer it.
  {
    tag: 'tracy-base/wp7',
    platform: 'wordpress',
    choosable: false,
    setting: { label: 'Tracy Base', version: '1.0.0' }
  }
]

test('EmDash offers the releases this server can install, and one of them is already the answer', async () => {
  const emdash = baseChoices('emdash', loaded, RELEASES)
  assert.deepEqual(
    emdash.options.map((o) => [o.id, o.name]),
    [['tracy-business/emdash-0.x', 'Tracy Business']]
  )
  assert.equal(emdash.revision, null, 'nothing generates this list, so there is no revision to assert')
  assert.equal(
    (await readBuildBase({ query: async () => ({ rows: [] }) }, 'emdash', emdash)).quickstart,
    'tracy-business/emdash-0.x',
    'a single archive is a choice already made — the screen must not need a press to be right'
  )
})

test('a platform whose only release is not installable has no setting, and saving one is refused', async () => {
  const none = baseChoices('wordpress', loaded, RELEASES)
  assert.deepEqual(none.options, [], 'a draft is read but never offered as a base')
  await assert.rejects(readBuildBase({ query: async () => ({ rows: [] }) }, 'wordpress', none))
  assert.equal(
    (await saveBuildBase({ query: async () => ({ rows: [] }) }, 'wordpress', none, 'x', 0, 'o@t.test')).error,
    'INVALID_BASE'
  )
})
test('admin settings accept only catalog ids and use revision checks for competing saves', async () => {
  let calls = 0
  const pool = {
    query: async () => {
      calls++
      return { rows: [] }
    }
  }
  assert.equal(
    (await saveBuildBase(pool, 'joomla', joomla, 'unknown', 0, 'owner@example.test')).error,
    'INVALID_BASE'
  )
  assert.equal(calls, 0)
  assert.equal(
    (await saveBuildBase(pool, 'joomla', joomla, 'tracy-base/j6', 2, 'owner@example.test')).error,
    'BASE_CHANGED'
  )
  assert.equal(calls, 1)
})
