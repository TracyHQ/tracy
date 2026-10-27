/**
 * The state of one "Create with <CMS>" button in the preview dialog.
 *
 *   node --test packages/design/tracy-design-inspiration/test/create-with.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createWith } from '../src/client/create-with.mjs'

test('a named platform is pressable; an unnamed one is greyed with a reason', () => {
  const quickstart = { id: 'tracy-base', platforms: ['joomla', 'wordpress'] }
  assert.deepEqual(createWith(quickstart, 'wordpress'), { disabled: false, title: 'dialog.createWithTitle' })
  assert.deepEqual(createWith(quickstart, 'emdash'), { disabled: true, title: 'dialog.createWithNone' })
})

test('a brand greys a CMS no quickstart can wear it on, and says so in its own words', () => {
  const brand = { id: 'brand:acme.example', platforms: ['wordpress'] }
  assert.deepEqual(createWith(brand, 'wordpress'), { disabled: false, title: 'dialog.createWithTitle' })
  assert.deepEqual(createWith(brand, 'joomla'), { disabled: true, title: 'dialog.createWithNoBrand' })
  assert.deepEqual(createWith({ id: 'brand:acme.example', platforms: [] }, 'wordpress'), {
    disabled: true,
    title: 'dialog.createWithNoBrand'
  })
})

test('a row that names no platforms leaves every button open', () => {
  assert.deepEqual(createWith({ id: 'apple' }, 'joomla'), {
    disabled: false,
    title: 'dialog.createWithTitle'
  })
})
