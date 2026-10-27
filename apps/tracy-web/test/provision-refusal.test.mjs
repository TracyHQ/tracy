import { test } from 'node:test'
import assert from 'node:assert/strict'
import { provisionRefusal } from '../src/sites/route.js'

// #295: tracy-host refuses a new provision while a deploy waits to replace it.
test('a host that is updating is answered with a sentence the customer can act on', () => {
  const body = provisionRefusal({ ok: false, status: 503, body: { code: 'HOST_UPDATING' } })
  assert.equal(body.code, 'HOST_UPDATING')
  assert.match(body.message, /updating/i)
  assert.match(body.message, /press again in a few minutes/i)
})

test('every other refusal is passed on as the host said it, and no answer at all is FLEET_REFUSED', () => {
  assert.deepEqual(provisionRefusal({ ok: false, status: 400, body: { error: 'refused label' } }), {
    error: 'refused label'
  })
  assert.deepEqual(provisionRefusal({ ok: false, status: 0 }), { code: 'FLEET_REFUSED' })
})
