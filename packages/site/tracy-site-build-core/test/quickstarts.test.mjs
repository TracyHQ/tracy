/** Which quickstart a press carries — one function for both platforms, pinned. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { quickstartFor, TEMPLATES, templateIds } from '../src/quickstarts.mjs'

test('Joomla takes the base the fleet plan resolved, and nothing without a plan', () => {
  assert.equal(quickstartFor('joomla', 'airbnb', { baseQuickstart: 'tracy-apple/j6' }), 'tracy-apple/j6')
  assert.equal(quickstartFor('joomla', 'stripe', { baseQuickstart: 'tracy-base/j6' }), 'tracy-base/j6')
  assert.equal(quickstartFor('joomla', 'apple', null), null)
  assert.equal(quickstartFor('joomla', 'apple', undefined), null)
  // A template id means nothing on Joomla: the plan decides, and there is none here.
  assert.equal(quickstartFor('joomla', 'tracy-base', null), null)
})

test('WordPress: known templates map to wp7 archives; every design system restores nothing', () => {
  assert.equal(quickstartFor('wordpress', 'tracy-base', null), 'tracy-base/wp7')
  assert.equal(
    quickstartFor('wordpress', 'tracy-base', { baseQuickstart: 'tracy-apple/j6' }),
    'tracy-base/wp7'
  )
  assert.equal(quickstartFor('wordpress', 'tracy-business', null), 'tracy-business/wp7')
  assert.equal(quickstartFor('wordpress', 'airbnb', null), null)
  assert.equal(quickstartFor('wordpress', 'apple', null), null)
  assert.equal(quickstartFor('wordpress', 'brand:example.com', null), null)
  assert.equal(quickstartFor('wordpress', 'constructor', null), null)
  assert.equal(quickstartFor('emdash', 'tracy-base', null), null)
})

test('the template list is beside the catalog: two WordPress templates, none elsewhere', () => {
  assert.deepEqual([...templateIds('wordpress')], ['tracy-base', 'tracy-business'])
  assert.deepEqual([...templateIds('joomla')], [])
  assert.equal(TEMPLATES['tracy-base'].name, 'Tracy Base')
  assert.equal(TEMPLATES['tracy-business'].name, 'Tracy Business')
  assert.throws(() => {
    // @ts-expect-error frozen on purpose
    TEMPLATES['tracy-base'].quickstart = 'x'
  })
})
