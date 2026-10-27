import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mountSiteSettings } from '../src/sites/settings.js'

test('site Settings only exposes known CMS fields and full admin URL to a current seat', async () => {
  const app = new Hono()
  mountSiteSettings(app, {
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    siteByKey: async () => ({ platform: 'wordpress', label: 'example' }),
    address: () => 'http://example.sidebar.tracy.test:18080/',
    read: async () => ({
      platform: 'wordpress',
      version: '7.0',
      title: 'Example',
      language: 'en_US',
      password: 'never expose',
      theme: 'Tracy'
    })
  })
  const response = await app.request('/api/sites/example.test/settings')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.adminUrl, 'http://example.sidebar.tracy.test:18080/wp-admin/')
  assert.equal(body.values.version, '7.0')
  assert.equal(body.values.password, undefined)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})

for (const [platform, path, values] of [
  ['joomla', 'administrator/', { version: '6.0', sef: false, languages: 3 }],
  ['emdash', '_emdash/admin/', { version: '0.37.0', postsPerPage: 12, tagline: '', titleSeparator: '·' }]
])
  test(`${platform} Settings preserves false/empty values and uses that CMS admin`, async () => {
    const app = new Hono()
    mountSiteSettings(app, {
      requireGrant: async () => ({ grant: { role: 'editor' } }),
      siteByKey: async () => ({ platform }),
      address: () => 'https://site.example/',
      read: async () => ({ platform, ...values, token: 'secret' })
    })
    const body = await (await app.request('/api/sites/site.example/settings')).json()
    assert.equal(body.adminUrl, `https://site.example/${path}`)
    assert.deepEqual(body.values, values)
  })

test('Settings refuses missing/revoked seats before touching the host', async () => {
  const app = new Hono()
  mountSiteSettings(app, {
    requireGrant: async (c) => ({ error: c.json({ code: 'NO_SEAT' }, 403) }),
    siteByKey: () => {
      assert.fail('must not read another site')
    },
    read: () => {
      assert.fail('must not contact the host')
    }
  })
  assert.equal((await app.request('/api/sites/other.example/settings')).status, 403)
})

test('failed or mismatched CMS read shows unavailable without substituting quickstart data', async () => {
  for (const read of [
    async () => {
      throw Error('host down')
    },
    async () => ({ platform: 'joomla', version: '6.0' })
  ]) {
    const app = new Hono()
    mountSiteSettings(app, {
      requireGrant: async () => ({ grant: { role: 'owner' } }),
      siteByKey: async () => ({ platform: 'wordpress', platformVersion: '6.9' }),
      address: () => 'https://site.example/',
      read
    })
    const body = await (await app.request('/api/sites/site.example/settings')).json()
    assert.equal(body.state, 'unavailable')
    assert.deepEqual(body.values, {})
  }
})

test('the address and the admin link come from the snapshot taken AFTER the CMS answered, with everything read beside it', async () => {
  // The order is the contract: the row read at the door, the CMS read (slow), and only then the
  // one snapshot the address, the admin link and the extra fields are all taken from.
  const order = []
  let cmsDone
  const cms = new Promise((resolve) => {
    cmsDone = resolve
  })
  const app = new Hono()
  mountSiteSettings(app, {
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    siteByKey: async () => {
      order.push('door')
      return { platform: 'wordpress', address: 'https://old.example/' }
    },
    address: (site) => site.address,
    read: async () => {
      order.push('cms:start')
      await cms
      order.push('cms:end')
      return { platform: 'wordpress', version: '7.0' }
    },
    current: async (site, grant) => {
      order.push('snapshot')
      assert.equal(site.address, 'https://old.example/', 'handed the row read at the door')
      assert.equal(grant.role, 'owner')
      return {
        site: { platform: 'wordpress', address: 'https://new.example/' },
        extra: { currentSiteUrl: 'https://new.example/', publishing: { publish: 'published' } }
      }
    }
  })
  const pending = app.request('/api/sites/site.example/settings')
  // Held on a barrier: the snapshot has not been taken while the CMS is still being read.
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(order, ['door', 'cms:start'])
  cmsDone()
  const body = await (await pending).json()
  assert.deepEqual(order, ['door', 'cms:start', 'cms:end', 'snapshot'])
  assert.equal(body.siteUrl, 'https://new.example/')
  assert.equal(body.adminUrl, 'https://new.example/wp-admin/')
  assert.equal(body.currentSiteUrl, 'https://new.example/')
  assert.deepEqual(body.publishing, { publish: 'published' })
  assert.equal(body.values.version, '7.0')
})

test('a site that is gone by the time the snapshot is taken reads 404, and a failed CMS read still takes the snapshot', async () => {
  const gone = new Hono()
  mountSiteSettings(gone, {
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    siteByKey: async () => ({ platform: 'wordpress', address: 'https://old.example/' }),
    address: (site) => site.address,
    read: async () => ({ platform: 'wordpress' }),
    current: async () => null
  })
  const res = await gone.request('/api/sites/site.example/settings')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'SITE_UNKNOWN' })

  const down = new Hono()
  mountSiteSettings(down, {
    requireGrant: async () => ({ grant: { role: 'editor' } }),
    siteByKey: async () => ({ platform: 'joomla', address: 'https://old.example/' }),
    address: (site) => site.address,
    read: async () => {
      throw Error('host down')
    },
    current: async () => ({
      site: { platform: 'joomla', address: 'https://new.example/' },
      extra: { publishing: { publish: 'draft' } }
    })
  })
  const body = await (await down.request('/api/sites/site.example/settings')).json()
  assert.equal(body.state, 'unavailable')
  assert.equal(body.siteUrl, 'https://new.example/')
  assert.equal(body.adminUrl, 'https://new.example/administrator/')
  assert.deepEqual(body.publishing, { publish: 'draft' })
})

test('without a snapshot reader the door keeps its old shape: the row it read, plus `extra` for the role', async () => {
  const app = new Hono()
  mountSiteSettings(app, {
    requireGrant: async () => ({ grant: { role: 'editor' } }),
    siteByKey: async () => ({ platform: 'wordpress', address: 'https://site.example/' }),
    address: (site) => site.address,
    read: async () => ({ platform: 'wordpress' }),
    extra: async (site, role) => ({ seen: `${site.address} as ${role}` })
  })
  const body = await (await app.request('/api/sites/site.example/settings')).json()
  assert.equal(body.siteUrl, 'https://site.example/')
  assert.equal(body.seen, 'https://site.example/ as editor')
})

// #1037: a connected domain of the customer's own never becomes where the back office is opened.
// The CMS keeps its Tracy address (that is where the Tracy Access sign-in and an EmDash passkey
// work), so "Open admin" goes there whatever the site's public name is.
for (const [platform, path] of [
  ['wordpress', 'wp-admin/'],
  ['joomla', 'administrator/'],
  ['emdash', '_emdash/admin/']
]) {
  test(`#1037 ${platform}: with an own domain connected, the admin link stays on the Tracy address`, async () => {
    const app = new Hono()
    const connected = { name: 'www.customer-shop.com', kind: 'custom', state: 'connected' }
    mountSiteSettings(app, {
      requireGrant: async () => ({ grant: { role: 'owner' } }),
      siteByKey: async () => ({ platform, label: 'shop', address: 'https://shop.tracy.site/' }),
      address: (site) => site.address,
      read: async () => ({ platform }),
      extra: async () => ({ addressChange: { status: 'ready', connected: [connected] } })
    })
    const body = await (await app.request('/api/sites/shop.tracy.site/settings')).json()
    assert.equal(body.siteUrl, 'https://shop.tracy.site/')
    assert.equal(body.adminUrl, `https://shop.tracy.site/${path}`)
    assert.equal(JSON.stringify([body.siteUrl, body.adminUrl]).includes('customer-shop.com'), false)
    assert.deepEqual(body.addressChange.connected, [connected])
  })
}
