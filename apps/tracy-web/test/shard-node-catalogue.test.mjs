// apps/tracy-web/test/shard-node-catalogue.test.mjs
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { test } from 'node:test'
import { MASTER_HOST, masterCatalogue, rebaseUrls, shardCatalogueDoors } from '../src/shard/catalogue.js'
// Step 0, branch A (origin/develop b6253fa3dd has it, checked 16/10/2026). Branch B imports
// `demoReadOrigin` from '../src/shard/catalogue.js' instead and the assertion below changes with it.
import { siteReadOrigin } from '../src/sites/resolver.js'

const MASTER = 'https://cowork.tracy.ai'
const cards = {
  readAt: '2026-10-16T08:00:00.000Z',
  templates: [
    {
      id: 'tracy-business',
      card: {
        image: `${MASTER}/api/templates/tracy-business/shots/home.png?v=1`,
        demo: { url: 'https://business-joomla.tracy.ai/', version: '1.0.2' }
      },
      platforms: [
        {
          platform: 'joomla',
          tag: 'tracy-business/j6',
          version: '1.0.2',
          demo: { url: 'https://business-joomla.tracy.ai/', version: '1.0.2' }
        },
        { platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '0.3.0', demo: null }
      ]
    }
  ]
}

test('rebaseUrls moves only the master’s picture addresses to this shard', () => {
  const out = rebaseUrls(cards, `${MASTER}/api/templates/`, 'https://s2.tracy.ai/api/templates/')
  assert.equal(
    out.templates[0].card.image,
    'https://s2.tracy.ai/api/templates/tracy-business/shots/home.png?v=1'
  )
  assert.equal(out.templates[0].card.demo.url, 'https://business-joomla.tracy.ai/')
})

test('the list is kept a minute, the last one is served while the master does not answer, and none before a first read', async () => {
  let clock = 0
  let calls = 0
  let up = true
  const fetchImpl = async () => {
    calls++
    if (!up) throw new TypeError('fetch failed')
    return Response.json(cards)
  }
  const never = masterCatalogue({
    masterOrigin: MASTER,
    fetchImpl: async () => {
      throw new TypeError('down')
    },
    now: () => clock
  })
  assert.equal(await never.templates(), null)
  const catalogue = masterCatalogue({ masterOrigin: MASTER, fetchImpl, now: () => clock })
  assert.equal((await catalogue.templates()).templates.length, 1)
  await catalogue.templates()
  assert.equal(calls, 1)
  clock += 61_000
  up = false
  assert.equal((await catalogue.templates()).templates.length, 1)
  assert.equal(calls, 2)
})

test('the demo of a release is read at its public address, never as a container of this shard', async () => {
  const catalogue = masterCatalogue({
    masterOrigin: MASTER,
    fetchImpl: async () => Response.json(cards),
    now: () => 0
  })
  const demo = await catalogue.demoOf('tracy-business/j6')
  assert.deepEqual(demo, {
    host: MASTER_HOST,
    label: 'business-joomla',
    port: null,
    publish: 'published',
    address: 'https://business-joomla.tracy.ai/',
    platform: 'joomla',
    quickstart_version: '1.0.2',
    quickstart_sha256: null
  })
  assert.equal(
    siteReadOrigin(demo, { hostName: 's2', siteDomain: 'tracy.ai' }).href,
    'https://business-joomla.tracy.ai/'
  )
  assert.equal(await catalogue.demoOf('tracy-business/emdash-0.x'), null)
})

test('the doors answer the list from the master and pass pictures through with their cache headers', async () => {
  const asked = []
  const fetchImpl = async (input) => {
    asked.push(String(input))
    if (String(input).endsWith('/api/templates')) return Response.json(cards)
    return new Response('PNG', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=3600',
        etag: '"abc"',
        'set-cookie': 'x=1'
      }
    })
  }
  const config = { origin: 'https://s2.tracy.ai', shard: { masterOrigin: MASTER } }
  const catalogue = masterCatalogue({ masterOrigin: MASTER, fetchImpl, now: () => 0 })
  const app = new Hono()
  app.use('*', shardCatalogueDoors({ config, catalogue, fetchImpl }))
  app.all('*', (c) => c.text('next'))
  const list = await app.request('https://s2.tracy.ai/api/templates')
  assert.equal(list.headers.get('cache-control'), 'no-store')
  assert.equal(
    (await list.json()).templates[0].card.image,
    'https://s2.tracy.ai/api/templates/tracy-business/shots/home.png?v=1'
  )
  const shot = await app.request('https://s2.tracy.ai/api/templates/tracy-business/shots/home.png?w=480')
  assert.equal(await shot.text(), 'PNG')
  assert.equal(shot.headers.get('etag'), '"abc"')
  assert.equal(shot.headers.get('set-cookie'), null)
  assert.equal(asked.at(-1), `${MASTER}/api/templates/tracy-business/shots/home.png?w=480`)
  assert.equal(await (await app.request('https://s2.tracy.ai/api/sites/questions')).text(), 'next')
  assert.equal(
    await (await app.request('https://s2.tracy.ai/api/templates', { method: 'POST' })).text(),
    'next'
  )
})
