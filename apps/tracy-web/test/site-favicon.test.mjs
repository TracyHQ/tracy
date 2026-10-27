import assert from 'node:assert/strict'
import { test } from 'node:test'
import { declaredSiteIcon } from '../src/sites/favicon.js'

const config = { hostName: 'local', siteDomain: 'tracy.test' }
const site = {
  label: 'owned-site',
  host: 'local',
  platform: 'emdash',
  address: 'http://owned-site.tracy.test:18080/'
}

test('the declared favicon resolves against the public site address', async () => {
  const icon = await declaredSiteIcon(site, config, async (target, options) => {
    assert.equal(target.href, 'http://owned-site-web-1:4321/')
    assert.equal(options.headers['x-forwarded-host'], 'owned-site.tracy.test:18080')
    assert.equal(options.redirect, 'manual')
    return new Response('<head><link rel="shortcut icon" href="/favicon.svg"></head>')
  })
  assert.equal(icon, 'http://owned-site.tracy.test:18080/favicon.svg')
})

test('a homepage redirect is not followed to another host', async () => {
  const icon = await declaredSiteIcon(site, config, async (_target, options) => {
    assert.equal(options.redirect, 'manual')
    return new Response(null, { status: 302, headers: { location: 'http://other-host/private' } })
  })
  assert.equal(icon, null)
})
