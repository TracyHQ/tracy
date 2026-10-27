// The names a built site answers to, one shape for every host call that opens it in a browser (`/demo-qa` and the
// vision look's `/capture`): the look sent only a published hostname, so on the stand its shots of every page but
// home followed WordPress's redirect to `<label>-web-1:8080` and failed (24/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoSelfNames } from '../src/ops/quickstarts.js'

const stand = { origin: 'http://tracy.test:8080', siteDomain: 'tracy.test', demoTargets: [] }

test('demoSelfNames: an unpublished site on the stand names its label host and its born address', () => {
  assert.deepEqual(demoSelfNames(stand, { label: 'barb-wire-saigon-2', address: null }), {
    host: 'barb-wire-saigon-2.tracy.test',
    publicOrigin: 'http://barb-wire-saigon-2.tracy.test:8080'
  })
})

test('demoSelfNames: a published https demo names its public host; a recorded address wins over the born one', () => {
  const prod = {
    origin: 'https://cowork.tracy.site',
    siteDomain: 'tracy.site',
    demoTargets: [{ kind: 'host' }]
  }
  assert.deepEqual(
    demoSelfNames(prod, { label: 'acme', publish: 'published', address: 'https://acme.tracy.site/' }),
    { host: 'acme.tracy.site', publicOrigin: 'https://acme.tracy.site' }
  )
})
