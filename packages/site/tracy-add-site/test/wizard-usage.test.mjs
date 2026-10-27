import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wizardStepName } from '../src/client/wizard-usage.mjs'

const at = (input) =>
  wizardStepName({
    stageAt: 'form',
    currentStep: 'platform',
    activeStep: 'platform',
    origin: 'create',
    businessOn: true,
    importPage: null,
    ...input
  })

test('usage names the page an opening shows as <origin>:<page>, and nothing once the build console is up', () => {
  assert.equal(at({ currentStep: 'source', activeStep: 'source', origin: 'import' }), 'start:source')
  assert.equal(at({ currentStep: 'design', activeStep: 'design' }), 'create:design')
  assert.equal(at({ origin: 'import', currentStep: 'address', importPage: 'access' }), 'import:access')
  assert.equal(at({ origin: 'business', currentStep: 'platform' }), 'business:start')
  assert.equal(at({ stageAt: 'building', currentStep: 'review', activeStep: 'review' }), null)
})

test('the import wizard says nothing until it has told its page, and a business press with the switch off is Create', () => {
  assert.equal(at({ origin: 'import', currentStep: 'address', importPage: null }), null)
  assert.equal(at({ origin: 'business', businessOn: false, activeStep: 'design' }), 'create:design')
})
