// The door client lives in the Website Opportunities domain (ticket #585); the old scripts path re-exports it, and the
// domain index exports it the way its siblings are.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as domain from '../../packages/wo/website-opportunities/domain/index.mjs'
import * as moved from '../../packages/wo/website-opportunities/domain/site-doors.mjs'
import * as old from '../ai-quickstart/site-doors.mjs'

test('the door client is one module: the domain path, the domain index and the old scripts path', () => {
  assert.equal(old.siteDoors, moved.siteDoors)
  assert.equal(domain.siteDoors, moved.siteDoors)
  assert.equal(domain.DOOR_NOT_AVAILABLE, 'DOOR_NOT_AVAILABLE')
  assert.deepEqual(Object.keys(old).sort(), Object.keys(moved).sort())
})
