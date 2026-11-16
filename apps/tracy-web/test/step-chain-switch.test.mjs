import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { pinnedAiQuickstarts } from 'website-opportunities/domain'
import { AI_QUICKSTARTS_DIR } from '../src/build-draft/ai-quickstarts.js'
import * as chainSwitch from '../src/lib/step-chain-switch.js'
import { STEP_CHAIN_WORKFLOW, stepChainEnabled } from '../src/lib/step-chain-switch.js'
import { fakePinnedKits } from './_fake-ai-quickstart-pin.mjs'

const on = { STEP_CHAIN_ENABLED: '1' }
/** Invented pinned AI quickstarts: the chain reads data, never a list of names (#598). */
const aiQuickstarts = pinnedAiQuickstarts({
  templates: [
    {
      slug: 'example-ring',
      cms: 'j6',
      pin: { ok: true, version: '2.0.1' },
      manifest: { released: true, template: { slug: 'example-ring', version: '2.0.1' }, trades: ['fitness'] }
    }
  ]
})

test('the contract names the chain workflow, and no template list is left', () => {
  // test-quality: contract the workflow marker is part of the POST /api/sites contract
  assert.equal(STEP_CHAIN_WORKFLOW, 'step-chain/1')
  // test-quality: contract the chain is enabled by data (#598): the module exports no template list
  assert.equal('STEP_CHAIN_TEMPLATES' in chainSwitch, false)
})

test('a template with a pinned AI quickstart runs the chain only while the master switch is on', () => {
  const quickstart = 'quickstart/example-ring/j6'
  assert.equal(stepChainEnabled({ quickstart, env: on, aiQuickstarts }), true)
  assert.equal(stepChainEnabled({ quickstart, env: {}, aiQuickstarts }), false)
  assert.equal(stepChainEnabled({ quickstart, env: { STEP_CHAIN_ENABLED: '0' }, aiQuickstarts }), false)
})

test('a version or release prefix on the quickstart does not change the template', () => {
  for (const quickstart of ['quickstart/example-ring/j6', 'example-ring/j6/2.0.1', 'example-ring/j6@2.0.1'])
    assert.equal(stepChainEnabled({ quickstart, env: on, aiQuickstarts }), true, quickstart)
})

test('a template without a pinned AI quickstart, or no quickstart, never runs the chain', () => {
  for (const quickstart of ['example-other/j6', 'example-ring/wp7', 'example-ring/j6-extra', undefined])
    assert.equal(stepChainEnabled({ quickstart, env: on, aiQuickstarts }), false, String(quickstart))
  assert.equal(stepChainEnabled({ env: on, aiQuickstarts }), false)
  assert.equal(
    stepChainEnabled({ quickstart: 'quickstart/example-ring/j6', env: on, aiQuickstarts: [] }),
    false
  )
})

test('the shipped data: the pins file is empty, so no template runs the chain until one is pinned', () => {
  // test-quality: contract no kit has passed the release gate yet, so nothing is pinned (#588)
  for (const quickstart of ['quickstart/ja-boxing/j6', 'quickstart/ja-diner/j6', 'ja-kinetic/j6'])
    assert.equal(stepChainEnabled({ quickstart, env: on }), false, quickstart)
  // JA Boxing's kit with a fake pin runs it; JA Diner ships no AI quickstart, so a pin cannot exist for it.
  const boxing = fakePinnedKits([
    { slug: 'ja-boxing', version: '1.0.11', from: path.join(AI_QUICKSTARTS_DIR, 'ja-boxing', 'j6', '1.0.11') }
  ])
  try {
    const pinned = boxing.read.pinned
    assert.equal(
      stepChainEnabled({ quickstart: 'quickstart/ja-boxing/j6', env: on, aiQuickstarts: pinned }),
      true
    )
    assert.equal(
      stepChainEnabled({ quickstart: 'quickstart/ja-diner/j6', env: on, aiQuickstarts: pinned }),
      false
    )
  } finally {
    boxing.cleanup()
  }
})
