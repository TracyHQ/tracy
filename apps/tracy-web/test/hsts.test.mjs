// HSTS on Tracy's own hostname, and nowhere else (J1.4, 11/10/2026).
//
// HSTS binds a whole HOSTNAME for a year, so the deciding question is which hostname answered, not
// which code drew the page: a Tracy error page on a customer's own domain must not pin that domain
// to https (RFC 6797 §6.1.2). Only the configured Tracy origin's host, and only when it is https.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'

const base = {
  SITE_DOMAIN: 'tracy.example',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

function app(origin) {
  return buildApp({
    config: readConfig({ ...base, TRACY_ORIGIN: origin }),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} }
  })
}

const HSTS = 'max-age=31536000'

test('Tracy’s own https hostname answers with HSTS: a page, a JSON door and a 404', async () => {
  const a = app('https://cowork.tracy.example')
  for (const path of ['/login', '/auth/me', '/no-such-door']) {
    const res = await a.fetch(new Request(`https://cowork.tracy.example${path}`))
    assert.equal(res.headers.get('strict-transport-security'), HSTS, path)
  }
})

test('HSTS never names includeSubDomains or preload: customer sites live under the same domain', async () => {
  const res = await app('https://cowork.tracy.example').fetch(
    new Request('https://cowork.tracy.example/login')
  )
  assert.doesNotMatch(res.headers.get('strict-transport-security') ?? '', /includesubdomains|preload/i)
})

test('a customer site’s hostname and a customer’s own domain never get HSTS', async () => {
  const a = app('https://cowork.tracy.example')
  for (const url of [
    'https://shop.tracy.example/',
    'https://shop.tracy.example/__tracy/errors',
    'https://www.customer-shop.test/',
    'https://tracy.example/'
  ]) {
    const res = await a.fetch(new Request(url))
    assert.equal(res.headers.get('strict-transport-security'), null, url)
  }
})

test('a laptop stand on http never gets HSTS, not even on its own hostname', async () => {
  for (const origin of ['http://tracy.test:8080', 'http://localhost:8080']) {
    const res = await app(origin).fetch(new Request(`${origin}/login`))
    assert.equal(res.headers.get('strict-transport-security'), null, origin)
  }
})

test('an answer relayed straight from fetch (immutable headers) still carries HSTS on Tracy’s host', async () => {
  const { Hono } = await import('hono')
  const { strictTransportSecurity } = await import('../src/lib/security-headers.js')
  const relay = new Hono()
  relay.use('*', strictTransportSecurity('https://cowork.tracy.example'))
  relay.get('*', () => fetch('data:text/plain,relayed'))
  const own = await relay.fetch(new Request('https://cowork.tracy.example/x'))
  assert.equal(own.headers.get('strict-transport-security'), HSTS)
  assert.equal(await own.text(), 'relayed')
  const customer = await relay.fetch(new Request('https://shop.tracy.example/x'))
  assert.equal(customer.headers.get('strict-transport-security'), null)
  assert.equal(await customer.text(), 'relayed')
})
