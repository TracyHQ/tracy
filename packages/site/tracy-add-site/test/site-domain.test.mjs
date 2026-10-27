// The suffix the Address field shows while somebody names a new site.
//
// 🔒 MEASURED 10/09, AND THIS IS THE WHOLE POINT: on a local build the field read `.tracy.ai`
// while the real address of the site being created was `<label>.localhost:8080`. Two ways that
// hurts — it hands the person the wrong link for the thing they just made, and `.tracy.ai` on a
// laptop reads as though the wizard is about to publish to production.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressSuffix, DEFAULT_ZONE } from '../src/client/site-domain.ts'

test('local: the port is part of the address, so it is shown', () => {
  assert.equal(addressSuffix('localhost', '8080'), 'localhost:8080')
})

test('production: no port to type, so the suffix is just the zone', () => {
  assert.equal(addressSuffix('tracy.ai', ''), 'tracy.ai')
})

test('a dev lane on its own zone and port reads as itself, not as production', () => {
  assert.equal(addressSuffix('tracy.test', '8080'), 'tracy.test:8080')
  assert.notEqual(addressSuffix('tracy.test', '8080'), DEFAULT_ZONE)
})
