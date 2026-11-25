// The chain's kit step (step-chain-steps.js `kit`): a run on a Joomla release carries the profile that seals it, and its kit
// is that profile's; a run on an EmDash release carries none (the site needs no Claude Cowork plugin), so its kit is the kit
// index's at the site's release and version. Dev 25/11/2026: the first EmDash Diner chain build stopped here with "no
// readable template kit for tracy-diner/emdash-0.x". Fake pool: no database, no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainSteps } from '../src/step-chain-steps.js'

/** A pool with no WO settings and one site row; it keeps every site it was asked for. */
function fakePool(site) {
  const asked = []
  return {
    asked,
    async query(sql, params = []) {
      if (/from wo_ops_setting/.test(sql)) return { rows: [] }
      if (/from site where site_key/.test(sql)) {
        asked.push(params[0])
        return { rows: site ? [site] : [] }
      }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

const steps = (pool) =>
  createStepChainSteps({ config: {}, pool, kitImages: { ensure: async () => ({ ok: true, images: null }) } })

test('an EmDash run with no sealing profile takes the kit and content map of the site release', async () => {
  const pool = fakePool({
    site_key: 'harbour.tracy.site',
    platform: 'emdash',
    quickstart_tag: 'tracy-diner/emdash-0.x',
    quickstart_version: '0.1.4'
  })
  const ctx = {
    runId: 'kit-emdash',
    siteKey: 'harbour.tracy.site',
    contract: null,
    quickstart: 'tracy-diner/emdash-0.x'
  }
  const { value } = await steps(pool).kit(ctx)
  assert.equal(value.ref, 'tracy-diner/emdash-0.x/0.1.4')
  assert.equal(value.platform, 'emdash')
  assert.ok(value.contentMap.slots.length > 400)
  assert.deepEqual(pool.asked, ['harbour.tracy.site'])
})

test('a run that carries its profile keeps that kit and never reads the site; an unknown release still stops', async () => {
  const pool = fakePool(null)
  const ctx = { runId: 'kit-joomla', siteKey: 'boxing.tracy.site', contract: { id: 'ja-boxing/j6/1.0.10' } }
  const { value } = await steps(pool).kit(ctx)
  assert.equal(value.ref, 'ja-boxing/j6/1.0.10')
  assert.equal(value.platform, 'joomla')
  assert.deepEqual(pool.asked, [])
  const none = fakePool({
    site_key: 'x.tracy.site',
    quickstart_tag: 'tracy-nowhere/emdash-0.x',
    quickstart_version: '0.1.0'
  })
  await assert.rejects(
    steps(none).kit({
      runId: 'kit-none',
      siteKey: 'x.tracy.site',
      contract: null,
      quickstart: 'tracy-nowhere/emdash-0.x'
    }),
    /no readable template kit for tracy-nowhere\/emdash-0\.x/
  )
})
