import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createDoneBefore,
  createEntryStep,
  createNextStep,
  createStepIds
} from '../src/client/create-navigation.mjs'

test('create pages follow the approved order and omit unsupported design systems entirely', () => {
  assert.deepEqual(createStepIds(true), [
    'source',
    'platform',
    'design',
    'system',
    'address',
    'customize',
    'review'
  ])
  assert.deepEqual(createStepIds(false), ['source', 'platform', 'design', 'address', 'customize', 'review'])
})

test('entry points continue after the choices the customer has already supplied', () => {
  assert.equal(createEntryStep({}), 'source')
  assert.equal(createEntryStep({ pressedOrigin: 'create' }), 'platform')
  assert.equal(createEntryStep({ pressedPlatform: 'wordpress' }), 'design')
  assert.equal(createEntryStep({ pressedDesign: 'tracy' }), 'system')
  assert.equal(createEntryStep({ addressDesign: 'tracy' }), 'system')
  assert.equal(createEntryStep({ keptStep: 'customize', pressedOrigin: 'create' }), 'customize')
})

test('answered entry steps become available to revisit', () => {
  assert.deepEqual(createDoneBefore('system', createStepIds(true)), ['source', 'platform', 'design'])
  assert.deepEqual(createDoneBefore('address', createStepIds(true)), [
    'source',
    'platform',
    'design',
    'system'
  ])
  assert.deepEqual(createDoneBefore('address', createStepIds(false)), ['source', 'platform', 'design'])
  assert.deepEqual(createDoneBefore('source', createStepIds(true)), [])
})

test('ordinary Continue advances once and a review edit returns directly to Review', () => {
  const steps = createStepIds(true)
  assert.equal(createNextStep('design', steps), 'system')
  assert.equal(createNextStep('system', steps), 'address')
  assert.equal(createNextStep('design', createStepIds(false)), 'address')
  assert.equal(createNextStep('address', steps), 'customize')
  assert.equal(createNextStep('system', steps, true), 'review')
  assert.equal(createNextStep('address', steps, true), 'review')
  assert.equal(createNextStep('customize', createStepIds(false)), 'review')
  assert.equal(createNextStep('customize', steps), 'review')
})
