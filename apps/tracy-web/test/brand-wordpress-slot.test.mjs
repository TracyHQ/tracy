// The brand step finds the design system slot of a WordPress release by its WordPress slot name (#462). A Joomla
// release keeps `joomla-<product>-modes` then `joomla-<product>`; a WordPress release with no slot is a problem,
// never a Joomla slot (JA Diner has both a Joomla slot and a WordPress one, so a fallback would be caught here).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contractOfKit } from '../src/brand-step/brand-wiring.js'
import { toolByName } from '../src/brand-step/tools/index.js'
import { dsSlotModule, quickstartContractOf } from '../src/lib/ds-slot.js'
import { KIT, makeCtx } from './_brand-tool-fixtures.mjs'

/** A WordPress kit as the kit stamp writes it: the contract id is `<product>/wp<n>/<version>`, the product is JA Diner's. */
const wpKit = (contract, release) => ({
  ...structuredClone(KIT),
  contract,
  quickstart: { product: 'ja-diner', version: '1.0.1', cms: '7.1.3', ...(release ? { release } : {}) }
})
const DINER_WP7 = wpKit('ja-diner/wp7/1.0.1')
const NO_SLOT = wpKit('ja-ghost/wp7/1.0.0')

test('a WordPress release resolves the slot made for its theme', async () => {
  const library = await dsSlotModule('library')
  const got = contractOfKit(library, DINER_WP7, quickstartContractOf)
  assert.equal(got?.template, 'wordpress/wp-ja-diner')
  assert.equal(
    contractOfKit(library, wpKit('x/y/1', 'quickstart/ja-diner/wp7'), quickstartContractOf)?.template,
    'wordpress/wp-ja-diner'
  )
})

test('a Joomla release is looked up as before', async () => {
  const library = await dsSlotModule('library')
  assert.equal(
    contractOfKit(library, KIT, quickstartContractOf)?.template,
    library.loadContract('joomla-ja-boxing-modes').template
  )
  assert.equal(contractOfKit(library, KIT)?.template, library.loadContract('joomla-ja-boxing-modes').template)
})

test('a WordPress release with no slot gets no contract, not the Joomla slot of the same product', async () => {
  const library = await dsSlotModule('library')
  assert.ok(library.loadContract('joomla-ja-diner'), 'the Joomla slot of the same product exists')
  assert.equal(contractOfKit(library, NO_SLOT, quickstartContractOf), null)
})

test('build_design_system names the problem for a WordPress release with no slot', async () => {
  await assert.rejects(
    toolByName('build_design_system').run({ accent: '#c8693f' }, makeCtx({ kit: NO_SLOT })),
    /no WordPress template contract for ja-ghost\/wp7.*TEMPLATE_NOT_READY/s
  )
})

test('build_design_system finds the WordPress slot of JA Diner WP7', async () => {
  const r = await toolByName('build_design_system')
    .run({ accent: '#c8693f' }, makeCtx({ kit: DINER_WP7 }))
    .catch((e) => e)
  // Whatever the Joomla emitter makes of a WordPress contract, the lookup must not be what fails.
  assert.doesNotMatch(String(r?.message ?? ''), /no (WordPress )?template contract/)
  if (r?.module) assert.match(r.module.slot, /^wordpress-wp-ja-diner@/)
})
