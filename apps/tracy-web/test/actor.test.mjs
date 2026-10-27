import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { verifyActor } from '../src/lib/actor.js'
import { mintSession } from '../src/lib/session.js'
const secret = 'actor-test-only-secret'
const now = 1789156000000
const sign = (exp, email = 'Owner@Example.test', key = secret) => {
  const body = Buffer.from(JSON.stringify({ email, exp })).toString('base64url')
  return `v1.${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}
test('dsh prompter assertion verifies only with the actor key and a bounded expiry', async () => {
  const valid = sign(now / 1000 + 60)
  assert.equal(await verifyActor(valid, secret, now), 'owner@example.test')
  for (const raw of [
    sign(now / 1000 - 1),
    sign(now / 1000 + 121),
    sign(now / 1000 + 60, 'bad email'),
    valid + '.extra',
    sign(now / 1000 + 60, 'owner@example.test', 'wrong')
  ])
    assert.equal(await verifyActor(raw, secret, now), null)
  assert.equal(await verifyActor(valid, undefined, now), null)
  assert.equal(await verifyActor(await mintSession('owner@example.test', secret, now), secret, now), null)
})
