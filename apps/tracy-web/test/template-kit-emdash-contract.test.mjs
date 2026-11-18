/**
 * The contract id an EmDash kit names (`contract` of template-kit.json) must be the one Road to live expects for the
 * release (`contractOfRelease`): the kit tool makes the manifest of a theme's `contracts/<version>` folder from its
 * content map (`template-kit/lib/contract-manifest.mjs`), and a different id would read `kit-stale` for ever.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readManifest } from '../../../packages/cms/tracy-quickstart-tools/template-kit/lib/contract-manifest.mjs'
import { defaultContracts } from '../src/lib/contracts.js'
import { contractOfRelease } from '../src/lib/slot-roles-of-release.js'

test('the kit tool and Road to live name the EmDash contract of a release the same way', () => {
  const release = {
    tag: 'tracy-restaurant/emdash-0.x',
    platform: 'emdash',
    setting: { version: '1.0.1', template: 'tracy-restaurant' }
  }
  const contract = contractOfRelease(release, defaultContracts())
  assert.ok(contract?.dir, 'the theme folder holds contracts/1.0.1')
  const manifest = readManifest(contract.dir)
  assert.equal(manifest.id, contract.id)
  assert.equal(manifest.platform, 'emdash')
  assert.equal(manifest.quickstart.version, release.setting.version)
})
