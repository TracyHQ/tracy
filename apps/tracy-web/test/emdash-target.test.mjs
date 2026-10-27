import test from 'node:test'
import assert from 'node:assert/strict'
import { siteReadOrigin, siteTarget } from '../src/sites/resolver.js'

const config = { hostName: 'local', siteDomain: 'tracy.test' }

test('local EmDash targets its Node port, not Apache', () => {
  assert.equal(
    siteTarget({ host: 'local', label: 'business', platform: 'emdash' }, config).href,
    'http://business-web-1:4321/'
  )
})

test('local PHP platforms retain their existing target', () => {
  for (const platform of ['joomla', 'wordpress', undefined]) {
    assert.equal(
      siteTarget({ host: 'local', label: 'existing', platform }, config).href,
      'http://existing-web-1/'
    )
  }
})

test('remote EmDash stays on the existing HTTPS ingress', () => {
  assert.equal(
    siteTarget({ host: 'remote', label: 'business', platform: 'emdash' }, config).href,
    'https://business.remote-sites.tracy.test/'
  )
})

// ── a long local label is dialled by the bounded alias, not the over-long container name (#165) ───
//
// Regression guard: before the fix this branch produced `http://<label>-web-1/`, and for a 60-char
// imported label that name is 66 octets — past the DNS-label cap, so the dial fails ENOTFOUND
// (measured Node 22.17). Every server-side call to a co-located site funnels through `siteTarget`
// (the bar proxy via app.js, the component-pairing door at sites/route.js, component-target.js), so
// this one assertion covers all of them.

const LONG = 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def' // synthetic #165 label, 60 chars

test('a long local label targets the tracy-web-<hash> alias, never <label>-web-1', () => {
  const target = siteTarget({ host: 'local', label: LONG, platform: 'wordpress' }, config)
  assert.equal(target.hostname, 'tracy-web-df7e98761c149c8be701bc8688f7db77')
  assert.ok(!target.href.includes(`${LONG}-web-1`), 'the over-long container name must not be dialled')
  assert.ok(target.hostname.length <= 63)
})

test('a long local EmDash label keeps :4321 on the alias', () => {
  assert.equal(
    siteTarget({ host: 'local', label: LONG, platform: 'emdash' }, config).href,
    'http://tracy-web-df7e98761c149c8be701bc8688f7db77:4321/'
  )
})

// The running site's design system preview reads through `siteReadOrigin` with the address its links point at
// (`route.js`: the row's own, or the address it was born with): a site on another host is read there.
test('siteReadOrigin: another host is read at the public address it is given, this host on its container', () => {
  const remote = { host: 'remote', label: 'shop', platform: 'joomla', address: null }
  assert.equal(siteReadOrigin(remote, config, 'https://shop.tracy.test/en/').href, 'https://shop.tracy.test/')
  assert.equal(
    siteReadOrigin({ ...remote, address: 'https://www.shop.example/' }, config).href,
    'https://www.shop.example/'
  )
  assert.equal(
    siteReadOrigin({ ...remote, host: 'local' }, config, 'https://shop.tracy.test/').href,
    'http://shop-web-1/'
  )
  assert.throws(() => siteReadOrigin(remote, config))
})
