import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEP_CHAIN_TEMPLATES, STEP_CHAIN_WORKFLOW, stepChainEnabled } from '../src/lib/step-chain-switch.js'

const on = { STEP_CHAIN_ENABLED: '1' }

test('the contract names the chain workflow and the candidate templates', () => {
  // test-quality: contract the workflow marker is part of the POST /api/sites contract
  assert.equal(STEP_CHAIN_WORKFLOW, 'step-chain/1')
  // test-quality: contract only the individually verified Boxing and Diner Joomla candidates are on the chain
  assert.deepEqual(STEP_CHAIN_TEMPLATES, ['ja-boxing/j6', 'ja-diner/j6'])
})

test('a listed template runs the chain only while the master switch is on', () => {
  for (const quickstart of STEP_CHAIN_TEMPLATES) {
    assert.equal(stepChainEnabled({ quickstart, env: on }), true)
    assert.equal(stepChainEnabled({ quickstart, env: {} }), false)
    assert.equal(stepChainEnabled({ quickstart, env: { STEP_CHAIN_ENABLED: '0' } }), false)
  }
})

test('a version or release prefix on the quickstart does not change the template', () => {
  for (const quickstart of [
    'quickstart/ja-boxing/j6',
    'ja-boxing/j6/1.0.10',
    'ja-boxing/j6@1.0.10',
    'quickstart/ja-diner/j6',
    'ja-diner/j6/1.0.11',
    'ja-diner/j6@1.0.11'
  ])
    assert.equal(stepChainEnabled({ quickstart, env: on }), true, quickstart)
})

test('a template that is not listed, or no quickstart, never runs the chain', () => {
  assert.equal(stepChainEnabled({ quickstart: 'ja-kinetic/j6', env: on }), false)
  assert.equal(stepChainEnabled({ quickstart: 'ja-diner/wp7', env: on }), false)
  assert.equal(stepChainEnabled({ quickstart: 'ja-restaurant/j6', env: on }), false)
  assert.equal(stepChainEnabled({ quickstart: 'ja-boxing/j6-extra', env: on }), false)
  assert.equal(stepChainEnabled({ quickstart: undefined, env: on }), false)
  assert.equal(stepChainEnabled({ env: on }), false)
})
