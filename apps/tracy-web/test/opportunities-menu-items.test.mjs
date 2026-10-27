import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menuItemsForProfile } from 'website-opportunities/src/menu-items.js'
import * as domain from '../../../packages/wo/website-opportunities/domain/index.mjs'

const AT = Date.parse('2026-10-23T10:00:00.000Z')
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const page = '<h2>Food</h2><table><tr><td>Bánh mì</td><td>65.000</td></tr></table>'

function fetchCounting(bodies) {
  const calls = []
  const fetch = async (url) => {
    calls.push(url)
    if (!(url in bodies)) throw new Error('ECONNREFUSED')
    return new Response(bodies[url], { headers: { 'content-type': 'text/html' } })
  }
  return { fetch, calls }
}

test('a profile with menu links gets the items read off them, and what each read did', async () => {
  const { fetch } = fetchCounting({ 'https://phin.test/menu': page })
  const profile = { menus: [{ url: 'https://phin.test/menu' }, { url: 'https://phin.test/down' }] }
  const out = await menuItemsForProfile({ domain, profile, deps: { fetch, resolve }, now: () => AT })
  assert.deepEqual(
    out.menuItems.map((i) => [i.name, i.price, i.verified]),
    [['Bánh mì', '65.000', true]]
  )
  assert.deepEqual(
    out.menuReads.map((r) => [r.url, r.status]),
    [
      ['https://phin.test/menu', 'complete'],
      ['https://phin.test/down', 'failed']
    ]
  )
})

test('the same menu links as the snapshot before are not read again unless the research is forced', async () => {
  const { fetch, calls } = fetchCounting({ 'https://phin.test/menu': page })
  const profile = { menus: [{ url: 'https://phin.test/menu' }] }
  const previous = await menuItemsForProfile({ domain, profile, deps: { fetch, resolve }, now: () => AT })
  const again = await menuItemsForProfile({
    domain,
    profile,
    previous: { menus: profile.menus, ...previous },
    deps: { fetch, resolve },
    now: () => AT
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(again, previous)
  await menuItemsForProfile({
    domain,
    profile,
    previous: { menus: profile.menus, ...previous },
    force: true,
    deps: { fetch, resolve },
    now: () => AT
  })
  assert.equal(calls.length, 2)
})

test('no menu link: nothing is read and nothing is added', async () => {
  const { fetch, calls } = fetchCounting({})
  assert.deepEqual(await menuItemsForProfile({ domain, profile: {}, deps: { fetch, resolve } }), {})
  assert.equal(calls.length, 0)
})

test('a reader that throws leaves the profile as it was: links only', async () => {
  const broken = {
    ...domain,
    readMenus: async () => {
      throw new Error('boom')
    }
  }
  const out = await menuItemsForProfile({
    domain: broken,
    profile: { menus: [{ url: 'https://phin.test/menu' }] },
    deps: {}
  })
  assert.deepEqual(out, {})
})

test('a menu page drawn by script goes through the rendered readers; a held needs_render read is read again once one is configured', async () => {
  const shell = '<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>'
  const { fetch } = fetchCounting({ 'https://lr.test/menu': shell })
  const profile = { menus: [{ url: 'https://lr.test/menu' }] }
  const held = await menuItemsForProfile({ domain, profile, deps: { fetch, resolve }, now: () => AT })
  assert.deepEqual(
    held.menuReads.map((r) => r.status),
    ['needs_render']
  )
  const asked = []
  const renderers = [
    {
      provider: 'jina',
      read: async (url) => {
        asked.push(url)
        return { url, html: page }
      }
    }
  ]
  const out = await menuItemsForProfile({
    domain,
    profile,
    previous: { menus: profile.menus, ...held },
    renderers,
    deps: { fetch, resolve },
    now: () => AT
  })
  assert.deepEqual(asked, ['https://lr.test/menu'])
  assert.deepEqual(
    out.menuItems.map((i) => [i.name, i.price]),
    [['Bánh mì', '65.000']]
  )
  // A spending cap a reader hits stops the step instead of reading as no menu.
  class Cap extends Error {}
  await assert.rejects(
    menuItemsForProfile({
      domain,
      profile,
      renderers: [
        {
          provider: 'jina',
          read: async () => {
            throw new Cap('over')
          }
        }
      ],
      rethrow: (e) => e instanceof Cap,
      deps: { fetch, resolve },
      now: () => AT
    }),
    Cap
  )
})
