/** Image-only execution exercises real selection/cropping and native CAS without a model or a site. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import {
  emdashPictureInventory,
  planEmdashPictures,
  writeEmdashPictures
} from '../src/sites/brief-engines/emdash-real-pictures.js'

const roots = []
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const nativeHash = (bytes) => `sha1:${createHash('sha1').update(bytes).digest('hex')}`
const photo = (width = 1600, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: '#655f44' } })
    .jpeg()
    .toBuffer()

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-picture-stage-'))
  roots.push(root)
  mkdirSync(path.join(root, 'media'))
  const bytes = await photo()
  writeFileSync(path.join(root, 'media', 'hero.jpg'), bytes)
  const fields = [
    { slug: 'hero_image', type: 'image' },
    { slug: 'title', type: 'string' },
    { slug: 'gallery', type: 'repeater', validation: { subFields: [{ slug: 'image', type: 'image' }] } }
  ]
  const seed = {
    defaultLocale: 'en',
    collections: [{ slug: 'home', fields }],
    content: {
      home: [
        { slug: 'home', locale: 'en', data: { title: 'Keep this title', gallery: [{ _rowId: 'row-1' }] } }
      ]
    }
  }
  writeFileSync(path.join(root, 'seed.json'), JSON.stringify(seed))
  writeFileSync(
    path.join(root, 'personalize.json'),
    JSON.stringify({
      images: {
        targets: [{ collection: 'home', slug: 'home', field: 'hero_image', what: 'The restaurant interior' }]
      }
    })
  )
  const target = { collection: 'home', slug: 'home', locale: 'en', path: 'hero_image' }
  writeFileSync(
    path.join(root, 'media-map.json'),
    JSON.stringify({ items: [{ key: 'hero', file: 'hero.jpg', mime: 'image/jpeg', targets: [target] }] })
  )
  writeFileSync(
    path.join(root, 'content-api-map.json'),
    JSON.stringify({ collections: { home: { type: 'page', urlPattern: '/' } } })
  )
  const inventory = await emdashPictureInventory({ seedDir: root, locales: ['en'] })
  const source = {
    id: 'real-1',
    sha256: sha(bytes),
    width: 1600,
    height: 900,
    vision: {
      subject: 'interior',
      quality: 'good',
      textPresence: 'none',
      oneLine: 'A dining room with wooden tables.',
      heroWorthy: true
    }
  }
  const real = {
    buildId: 'build-1',
    plan: null,
    receipts: {},
    pictures: [source],
    bytes: async (id) => (id === source.id ? bytes : null)
  }
  const calls = [],
    outcomes = []
  let savedPlan = null,
    uploads = 0,
    rev = 'r1'
  const item = {
    id: 'home-1',
    type: 'home',
    slug: 'home',
    locale: 'en',
    status: 'published',
    data: { title: 'Keep this title', hero_image: { id: 'demo' } },
    liveData: { title: 'Keep this title', hero_image: { id: 'demo' } }
  }
  const media = new Map([
    ['demo', { id: 'demo', status: 'ready', contentHash: nativeHash(bytes), storageKey: 'demo.jpg' }]
  ])
  const capability = {
    schemaVersion: 'emdash-conditional-writes/1',
    backend: 'node-sqlite',
    conditionalContentWrite: true,
    conditionalPublish: true,
    mutationRevisionReceipts: true
  }
  const state = { item, capability, media, fields }
  const api = async (method, route, body) => {
    calls.push({ method, route, body: structuredClone(body) })
    if (route.endsWith('/write-capabilities')) return capability
    if (route.includes('/schema/collections/')) return { item: { fields, supports: ['revisions'] } }
    if (route.includes('/media/'))
      return { item: structuredClone(media.get(decodeURIComponent(route.split('/').at(-1)))) }
    if (method === 'GET') return { item: structuredClone(item), _rev: rev }
    assert.equal(body._rev, rev, 'every mutation names its exact predecessor')
    if (method === 'PUT') {
      item.data = structuredClone(body.data)
      item.draftRevisionId = 'owned-draft'
      rev = 'r2'
      return { _mutationRev: rev }
    }
    if (route.includes('/publish?')) {
      item.liveData = structuredClone(item.data)
      item.draftRevisionId = null
      rev = 'r3'
      return { _mutationRev: rev }
    }
    throw new Error(`unexpected ${method} ${route}`)
  }
  const realPictures = {
    recordPlan: async (_id, plan) => {
      savedPlan ??= structuredClone(plan)
      real.plan = savedPlan
      return savedPlan
    },
    recordOutcome: async (_id, outcome) => {
      outcomes.push(structuredClone(outcome))
      real.receipts = structuredClone(outcome.receipts)
    }
  }
  const upload = async ({ bytes }) => {
    uploads++
    media.set('uploaded', {
      id: 'uploaded',
      status: 'ready',
      contentHash: nativeHash(bytes),
      storageKey: 'real.jpg'
    })
    return { ok: true, id: 'uploaded' }
  }
  return { root, inventory, real, state, calls, outcomes, api, realPictures, upload, uploads: () => uploads }
}
const write = (f, overrides = {}) =>
  writeEmdashPictures({
    inventory: f.inventory,
    real: f.real,
    realPictures: f.realPictures,
    api: f.api,
    upload: f.upload,
    ...overrides
  })

test('a real photo beyond the first 24 is eligible, without a text plan or a model call', async () => {
  const f = await fixture()
  f.real.pictures.unshift(
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `tiny-${i}`,
      width: 80,
      height: 80,
      sha256: 'a'.repeat(64)
    }))
  )
  const plan = await planEmdashPictures({ inventory: f.inventory, real: f.real })
  assert.equal(plan.placements[0].mediaId, 'real-1')
  const result = await write(f)
  assert.equal(result.placed, 1)
  assert.equal(f.state.item.liveData.title, 'Keep this title')
  assert.equal(f.state.item.liveData.hero_image.id, 'uploaded')
  assert.equal(f.state.item.liveData.hero_image.width, 1600)
  assert.equal(f.outcomes.at(-1).receipts[f.inventory.slots[0].id].state, 'verified')
})

test('a retry reuses the frozen plan and upload and does not write the same image twice', async () => {
  const f = await fixture()
  await write(f)
  const count = f.calls.filter((c) => c.method !== 'GET').length
  await write(f)
  assert.equal(f.uploads(), 1)
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, count)
})

test('an editor image or open draft is rejected before the first upload', async () => {
  for (const kind of ['image', 'draft']) {
    const f = await fixture()
    if (kind === 'draft') f.state.item.draftRevisionId = 'editor-draft'
    else f.state.media.get('demo').contentHash = 'sha1:changed-by-editor'
    await assert.rejects(write(f), {
      code: kind === 'draft' ? 'PICTURE_LIVE_STATE_CHANGED' : 'PICTURE_EDITOR_CHANGED'
    })
    assert.equal(f.uploads(), 0)
  }
})

test('missing native CAS, cancelled work and changed source bytes write nothing', async () => {
  const f = await fixture()
  f.state.capability.conditionalPublish = false
  await assert.rejects(write(f), { code: 'PICTURE_CONDITIONAL_WRITES_REQUIRED' })
  f.state.capability.conditionalPublish = true
  await assert.rejects(write(f, { signal: AbortSignal.abort(new Error('stopped')) }), /stopped/)
  f.real.bytes = async () => Buffer.from('different bytes')
  await assert.rejects(write(f), { code: 'PICTURE_SOURCE_CHANGED' })
  assert.equal(f.uploads(), 0)
})

test('unfit sources are explicit gaps with a neutral placeholder, never another business photo', async () => {
  const f = await fixture()
  f.real.pictures[0].vision = { subject: 'poster', quality: 'good', textPresence: 'present' }
  f.real.bytes = async () => {
    throw new Error('an unfit source must not be used')
  }
  const result = await write(f)
  assert.equal(result.placed, 0)
  assert.equal(result.placeholders, 1)
  assert.equal(result.gaps.length, 1)
  assert.equal(result.verified, false)
  assert.equal(f.uploads(), 1)
  assert.equal(f.state.item.liveData.title, 'Keep this title')
})

test('a different release inventory cannot reuse the old plan', async () => {
  const f = await fixture()
  await write(f)
  f.inventory.hash = 'a different release'
  await assert.rejects(write(f), { code: 'PICTURE_PLAN_CHANGED' })
})

test('inventory protects logos and people; gallery paths retain their declared row binding', async () => {
  const f = await fixture()
  const map = {
    items: [
      {
        key: 'photo',
        file: 'hero.jpg',
        mime: 'image/jpeg',
        targets: [
          { collection: 'home', slug: 'home', locale: 'en', path: 'gallery[0].image' },
          { collection: 'home', slug: 'home', locale: 'en', path: 'title' }
        ]
      }
    ]
  }
  writeFileSync(path.join(f.root, 'media-map.json'), JSON.stringify(map))
  const inventory = await emdashPictureInventory({ seedDir: f.root, locales: ['en'] })
  assert.equal(inventory.slots.length, 1)
  assert.equal(inventory.slots[0].role, 'gallery')
  assert.equal(inventory.slots[0].rowId, 'row-1')
  assert.equal(inventory.excluded.length, 1)
})

test('a recorded owned draft resumes publication without uploading again', async () => {
  const f = await fixture(),
    api = f.api
  let failOnce = true
  const interrupted = async (method, route, body) => {
    if (method === 'POST' && route.includes('/publish?') && failOnce) {
      failOnce = false
      throw new Error('temporary transport failure before publish')
    }
    return api(method, route, body)
  }
  await assert.rejects(write(f, { api: interrupted }), /temporary transport failure/)
  assert.equal(f.real.receipts[f.inventory.slots[0].id].state, 'written')
  await write(f)
  assert.equal(f.uploads(), 1)
  assert.equal(f.state.item.liveData.hero_image.id, 'uploaded')
})

test('schema drift and unrelated readback changes cannot be counted as a successful image write', async () => {
  const f = await fixture()
  f.state.fields[0].type = 'string'
  await assert.rejects(write(f), { code: 'PICTURE_SCHEMA_CHANGED' })
  assert.equal(f.uploads(), 0)
  f.state.fields[0].type = 'image'
  const api = f.api
  await assert.rejects(
    write(f, {
      api: async (method, route, body) => {
        const result = await api(method, route, body)
        if (method === 'POST' && route.includes('/publish?'))
          f.state.item.liveData.title = 'unexpected data loss'
        return result
      }
    }),
    { code: 'PICTURE_UNRELATED_DATA_CHANGED' }
  )
  assert.notEqual(f.real.receipts[f.inventory.slots[0].id].state, 'verified')
})

test('the EmDash engine exposes pictures without preparing prose or loading model credentials', async () => {
  const { createEmdashEngine } = await import('../src/sites/brief-engines/emdash.js')
  const f = await fixture()
  const engine = createEmdashEngine({
    models: async () => {
      throw new Error('the picture phase must not load generic models')
    },
    realPictures: f.realPictures,
    siteAccess: async () => ({ origin: 'http://fixture.test', token: 'fixture-token' }),
    applyFor: () => async (call) => {
      assert.equal(call.action, 'media.upload')
      return f.upload({ bytes: Buffer.from(call.params.content_b64, 'base64') })
    },
    fetchImpl: async (input, init) =>
      new Response(
        JSON.stringify({
          data: await f.api(
            init.method,
            new URL(input).pathname + new URL(input).search,
            init.body ? JSON.parse(init.body) : undefined
          )
        }),
        { headers: { 'content-type': 'application/json' } }
      )
  })
  const result = await engine.pictures(
    {
      siteKey: 'fixture.test',
      email: 'owner@example.test',
      normalized: {},
      brief: {},
      time() {},
      note() {},
      signal: new AbortController().signal
    },
    { tool: { seedDir: f.root }, pictureInventory: f.inventory, realPictures: f.real }
  )
  assert.equal(result.placed, 1)
})

test('an editor clearing an image before a retry is never filled back in', async () => {
  const f = await fixture()
  await write(f)
  f.state.item.liveData.hero_image = null
  f.state.item.data.hero_image = null
  const mutations = f.calls.filter((c) => c.method !== 'GET').length
  await assert.rejects(write(f), { code: 'PICTURE_EDITOR_CHANGED' })
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, mutations)
})

test('a lost PUT response is uncertain and cannot be adopted as an owned draft', async () => {
  const f = await fixture(),
    api = f.api
  await assert.rejects(
    write(f, {
      api: async (method, route, body) => {
        const result = await api(method, route, body)
        if (method === 'PUT') throw new Error('response lost after commit')
        return result
      }
    }),
    /response lost/
  )
  assert.equal(f.real.receipts[f.inventory.slots[0].id].state, 'unknown')
  const mutations = f.calls.filter((c) => c.method !== 'GET').length
  await assert.rejects(write(f), { code: 'PICTURE_MUTATION_UNCERTAIN' })
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, mutations)
})

test('a hidden parent page excludes image targets on its detail routes', async () => {
  const { readFileSync } = await import('node:fs')
  const f = await fixture(),
    seed = JSON.parse(readFileSync(path.join(f.root, 'seed.json')))
  seed.collections.push(
    { slug: 'projects_page', fields: [] },
    { slug: 'projects', fields: [{ slug: 'image', type: 'image' }] }
  )
  seed.content.projects_page = [{ slug: 'projects', locale: 'en', data: {} }]
  seed.content.projects = [{ slug: 'a-detail', locale: 'en', data: {} }]
  writeFileSync(path.join(f.root, 'seed.json'), JSON.stringify(seed))
  writeFileSync(
    path.join(f.root, 'content-api-map.json'),
    JSON.stringify({
      collections: {
        home: { type: 'page', urlPattern: '/' },
        projects_page: { type: 'page', urlPattern: '/projects' },
        projects: { type: 'project', urlPattern: '/projects/{slug}' }
      }
    })
  )
  writeFileSync(
    path.join(f.root, 'media-map.json'),
    JSON.stringify({
      items: [
        {
          key: 'detail',
          file: 'hero.jpg',
          mime: 'image/jpeg',
          targets: [{ collection: 'projects', slug: 'a-detail', locale: 'en', path: 'image' }]
        }
      ]
    })
  )
  const inventory = await emdashPictureInventory({ seedDir: f.root, hiddenPageIds: ['projects'] })
  assert.equal(inventory.slots.length, 0)
})

test('the final read-only fence rejects images replaced by a later prose writer', async () => {
  const { verifyEmdashPictureBindings } = await import('../src/sites/brief-engines/emdash-real-pictures.js')
  const f = await fixture(),
    result = await write(f)
  assert.equal((await verifyEmdashPictureBindings({ api: f.api, bindings: result.bindings })).verified, 1)
  f.state.item.liveData.hero_image = null
  await assert.rejects(verifyEmdashPictureBindings({ api: f.api, bindings: result.bindings }), {
    code: 'PICTURE_BINDING_CHANGED'
  })
})

test('a published gallery receipt reconciles generated row UUIDs after a failed readback', async () => {
  const f = await fixture()
  const oldId = '12345678-1234-4234-8234-123456789abc',
    newId = '87654321-4321-4321-8321-cba987654321'
  const target = { collection: 'home', slug: 'home', locale: 'en', path: 'gallery[0].image' }
  writeFileSync(
    path.join(f.root, 'media-map.json'),
    JSON.stringify({ items: [{ key: 'gallery', file: 'hero.jpg', mime: 'image/jpeg', targets: [target] }] })
  )
  f.inventory = await emdashPictureInventory({ seedDir: f.root })
  f.state.item.data.gallery = [{ _rowId: oldId, image: { id: 'demo' } }]
  f.state.item.liveData = structuredClone(f.state.item.data)
  const api = f.api
  let published = false
  await assert.rejects(
    write(f, {
      api: async (method, route, body) => {
        if (published && method === 'GET' && route.includes('/content/'))
          throw new Error('readback unavailable')
        const result = await api(method, route, body)
        if (method === 'POST' && route.includes('/publish?')) {
          f.state.item.data.gallery[0]._rowId = newId
          f.state.item.liveData.gallery[0]._rowId = newId
          published = true
        }
        return result
      }
    }),
    /readback unavailable/
  )
  assert.equal(f.real.receipts[f.inventory.slots[0].id].state, 'published')
  const mutations = f.calls.filter((c) => c.method !== 'GET').length
  await write(f)
  assert.equal(f.real.receipts[f.inventory.slots[0].id].state, 'verified')
  assert.equal(f.real.receipts[f.inventory.slots[0].id].rowId, newId)
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, mutations)
})
