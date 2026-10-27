/**
 * "Use my location" never blocks the page: every way the browser can say no becomes a named state the
 * Find step shows, and the place field stays usable.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { askLocation } from '../src/client/location.ts'

const geo = (behaviour) => ({
  getCurrentPosition: (ok, fail) => behaviour(ok, fail)
})

test('a position comes back as a point', async () => {
  const answer = await askLocation({
    secure: true,
    geolocation: geo((ok) => ok({ coords: { latitude: 15.88, longitude: 108.33 } }))
  })
  assert.deepEqual(answer, { state: 'found', lat: 15.88, lon: 108.33 })
})

test('an insecure page (http on a test host) never asks', async () => {
  let asked = false
  const answer = await askLocation({ secure: false, geolocation: geo(() => (asked = true)) })
  assert.deepEqual(answer, { state: 'insecure' })
  assert.equal(asked, false)
})

test('no geolocation at all is unavailable', async () => {
  assert.deepEqual(await askLocation({ secure: true, geolocation: undefined }), { state: 'unavailable' })
})

test('the three browser errors map to denied, unavailable and timeout', async () => {
  const fail = (code) => askLocation({ secure: true, geolocation: geo((_ok, no) => no({ code })) })
  assert.deepEqual(await fail(1), { state: 'denied' })
  assert.deepEqual(await fail(2), { state: 'unavailable' })
  assert.deepEqual(await fail(3), { state: 'timeout' })
})

test('a browser that throws while asking is unavailable, not a crash', async () => {
  const answer = await askLocation({
    secure: true,
    geolocation: geo(() => {
      throw new Error('blocked by policy')
    })
  })
  assert.deepEqual(answer, { state: 'unavailable' })
})

test('findLocation: the browser position wins; otherwise the network city, like a map', async () => {
  const { findLocation } = await import('../src/client/location.ts')
  const geo = (ok) => ({
    getCurrentPosition: (yes, no) => (ok ? yes({ coords: { latitude: 1, longitude: 2 } }) : no({ code: 1 }))
  })
  let asked = 0
  const approx = async () => {
    asked++
    return { ok: true, body: { lat: 25.07, lon: 55.3, label: 'Dubai, United Arab Emirates' } }
  }
  assert.deepEqual(await findLocation({ secure: true, geolocation: geo(true) }, approx), {
    state: 'found',
    lat: 1,
    lon: 2
  })
  assert.equal(asked, 0)
  assert.deepEqual(await findLocation({ secure: false, geolocation: geo(true) }, approx), {
    state: 'approx',
    lat: 25.07,
    lon: 55.3,
    label: 'Dubai, United Arab Emirates'
  })
  assert.equal((await findLocation({ secure: true, geolocation: geo(false) }, approx)).state, 'approx')
})

test('findLocation: a failed or empty fallback keeps the browser reason', async () => {
  const { findLocation } = await import('../src/client/location.ts')
  const env = { secure: false, geolocation: undefined }
  assert.deepEqual(await findLocation(env, async () => ({ ok: false })), { state: 'insecure' })
  assert.deepEqual(await findLocation(env, async () => ({ ok: true, body: { lat: 'x' } })), {
    state: 'insecure'
  })
  assert.deepEqual(
    await findLocation(env, async () => {
      throw new Error('down')
    }),
    { state: 'insecure' }
  )
})

test('quietLocation: opening Find never asks for the location; the browser’s is used only when already allowed', async () => {
  const { quietLocation } = await import('../src/client/location.ts')
  const approx = async () => ({ ok: true, body: { lat: 21, lon: 105.8, label: 'Hanoi, VN' } })
  let asked = 0
  const geolocation = {
    getCurrentPosition: (ok) => {
      asked += 1
      ok({ coords: { latitude: 10, longitude: 106 } })
    }
  }
  const env = (permission) => ({ secure: true, geolocation, permission })
  assert.deepEqual(await quietLocation(env('prompt'), approx), {
    state: 'approx',
    lat: 21,
    lon: 105.8,
    label: 'Hanoi, VN'
  })
  assert.equal(asked, 0)
  assert.deepEqual(await quietLocation(env('granted'), approx), { state: 'found', lat: 10, lon: 106 })
  assert.equal(asked, 1)
  const none = await quietLocation(env('denied'), async () => ({ ok: false }))
  assert.equal(none.state, 'unavailable')
})
