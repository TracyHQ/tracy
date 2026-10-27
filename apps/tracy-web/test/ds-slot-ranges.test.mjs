/**
 * A template line may hold several slot contracts, each for its own releases (15/10/2026: JA Podcast's
 * two-mode contract from the release whose script opens the system's side, its first contract kept for the
 * releases before): the door picks the one whose range holds the site's release.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  contractFor,
  maxVersionOf,
  minVersionOf,
  quickstartContractOf,
  quickstartTemplateOf
} from '../src/lib/ds-slot.js'

const TAG = 'quickstart/ja-podcast/j6'
const site = (version) => ({ key: TAG, version })

test('a site gets the contract whose range holds its release; outside every range, the answer that says most', () => {
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.4')), { contract: 'joomla-ja-podcast' })
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.5')), { contract: 'joomla-ja-podcast-modes' })
  // 16/10/2026: 1.0.6 reads the role variables at the source and has its own contract (dark button words)
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.6')), { contract: 'joomla-ja-podcast-roles' })
  // 21/10/2026 (TEXT-1 batch 3): 1.0.7 reads the text and hover roles on the same contract
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.7')), { contract: 'joomla-ja-podcast-roles' })
  // before every range: the line's first release; past every range: the newest one confirmed
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.1')), {
    reason: 'TEMPLATE_NEEDS_UPDATE',
    need: '1.0.2',
    have: '1.0.1'
  })
  assert.deepEqual(contractFor('joomla/ja-podcast', site('1.0.8')), {
    reason: 'TEMPLATE_VERSION_UNCHECKED',
    upTo: '1.0.7',
    have: '1.0.8'
  })
  // without a site, the line's first contract (tooling)
  assert.deepEqual(contractFor('joomla/ja-podcast'), { contract: 'joomla-ja-podcast' })
})

test('the line’s range is every contract’s together', () => {
  assert.deepEqual(minVersionOf('joomla/ja-podcast'), { [TAG]: '1.0.2' })
  assert.deepEqual(maxVersionOf('joomla/ja-podcast'), { [TAG]: '1.0.7' })
  const fit = quickstartContractOf({ platform: 'joomla', tag: TAG, version: '1.0.5' })
  assert.deepEqual(fit, { contract: 'joomla-ja-podcast-modes', need: '1.0.2', template: 'joomla/ja-podcast' })
})

// 16/10/2026: Tracy Apple (tracy-apple/j6, template element `tracy`) is named by two contracts: its own,
// joomla-tracy-base, and joomla-tracy-airbnb, the Airbnb design pack laid over an Apple base, which extends
// it. The quickstart's own template is the base one: its Add site preview and its customer lock are the
// joomla/tracy-base ones (the key readyTemplates derives from the release, template `tracy`), never the
// pack's, whose range stops at the Apple release it was measured on.
test('a quickstart named by a contract and by a design pack extending it is the base contract’s', () => {
  const APPLE = 'tracy-apple/j6'
  assert.equal(quickstartTemplateOf({ platform: 'joomla', tag: APPLE }), 'joomla/tracy-base')
  for (const version of ['1.3.0', maxVersionOf('joomla/tracy-base')[APPLE]])
    assert.deepEqual(quickstartContractOf({ platform: 'joomla', tag: APPLE, version }), {
      contract: 'joomla-tracy-base',
      need: '1.3.0',
      template: 'joomla/tracy-base'
    })
})
