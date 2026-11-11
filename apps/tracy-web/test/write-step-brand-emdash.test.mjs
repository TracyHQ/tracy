// The brand stage's EmDash writer (`writeBrand`, orders `via: 'emdash-setting'`) and the site actions behind it
// (`emdashBrandDoor`), against a fake EmDash REST API. The request shapes are the ones EmDash's own `settings_update`,
// `schema_create_field` and `content_update` take. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emdashBrandDoor } from '../src/write-step/emdash-brand-door.js'
import { brandAsker, writeBrand } from '../src/write-step/brand-writes.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const order = (spot, key, file) => ({ item: 'logo', slot: spot, spot, file, via: 'emdash-setting', key })

/** A fake door: records every call, answers uploads with a media id per path. */
function fakeAsk(over = {}) {
  const calls = []
  const ask = async (action, params) => {
    calls.push({ action, params })
    if (over[action]) return over[action](params)
    if (action === 'media.upload') return { ok: true, id: `m-${calls.length}`, url: '/u', path: '/u' }
    return { ok: true }
  }
  return { ask, calls }
}

async function run(orders, over) {
  const site = fakeAsk(over)
  const results = new Map()
  const pictures = new Map([['a.png', PNG]])
  await writeBrand({ orders, plan: {}, pictures, accent: null, ask: site.ask, results })
  return { ...site, results, of: (o) => results.get(o) }
}

test('the logo and the favicon go in one settings call, each as a media reference', async () => {
  const logo = order('logo-header-1', 'settings.logo', 'a.png')
  const icon = {
    item: 'favicon',
    slot: 'favicon-setting',
    file: 'a.png',
    via: 'emdash-setting',
    key: 'settings.favicon'
  }
  const r = await run([logo, icon])
  const set = r.calls.filter((c) => c.action === 'emdash.settings')
  assert.equal(set.length, 1)
  assert.deepEqual(set[0].params, {
    operation: 'set',
    fields: { logo: { mediaId: logo.mediaId }, favicon: { mediaId: icon.mediaId } }
  })
  assert.equal(
    r.calls.filter((c) => c.action === 'media.upload').length,
    2,
    'each place has its own file name'
  )
  assert.equal(r.of(logo).status, 'written')
  assert.deepEqual(r.of(logo).readFrom, {
    action: 'emdash.settings',
    params: { operation: 'read' },
    path: ['fields', 'logo', 'mediaId']
  })
  assert.equal(r.of(logo).ordered, logo.mediaId)
})

test('the dark logo goes to the image field of the chrome entry, and is read back from it', async () => {
  const dark = order('logo-header-2', 'chrome.logo_dark', 'a.png')
  const r = await run([dark])
  const call = r.calls.find((c) => c.action === 'emdash.entryField')
  assert.deepEqual(call.params, {
    operation: 'set',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark',
    label: 'Logo for dark backgrounds',
    media: dark.mediaId
  })
  assert.equal(
    r.calls.some((c) => c.action === 'emdash.settings'),
    false,
    'no settings call for a field'
  )
  assert.deepEqual(r.of(dark).readFrom.params, {
    operation: 'read',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark'
  })
})

test('a refused settings call fails the logo in the site words; a failed upload is never written', async () => {
  const logo = order('logo-header-1', 'settings.logo', 'a.png')
  const r = await run([logo], {
    'emdash.settings': () => ({ ok: false, error: 'site_refused', message: 'HTTP 403' })
  })
  assert.deepEqual([r.of(logo).status, r.of(logo).reason], ['failed', 'site_refused: HTTP 403'])
  const lost = order('logo-header-1', 'settings.logo', 'a.png')
  const u = await run([lost], { 'media.upload': () => ({ ok: false, error: 'BAD_PICTURE' }) })
  assert.equal(u.of(lost).status, 'failed')
  assert.equal(
    u.calls.some((c) => c.action === 'emdash.settings'),
    false
  )
})

test('an order the site holds already is not sent again', async () => {
  const logo = order('logo-header-1', 'settings.logo', 'a.png')
  const site = fakeAsk()
  const results = new Map()
  await writeBrand({
    orders: [logo],
    plan: {},
    pictures: new Map([['a.png', PNG]]),
    accent: null,
    ask: site.ask,
    results,
    kept: new Map([[logo, { ordered: 'x', readFrom: null }]])
  })
  assert.equal(site.calls.filter((c) => c.action === 'emdash.settings').length, 0)
  assert.equal(results.get(logo).status, 'written')
})

test('reading through an EmDash action is not a write: no apply id is added', async () => {
  const seen = []
  const ask = brandAsker({
    apply: async (c) => (seen.push(c), { ok: true }),
    siteKey: 's',
    applyId: 'brand-1',
    sleep: async () => {}
  })
  await ask('emdash.settings', { operation: 'read' })
  await ask('emdash.settings', { operation: 'set', fields: {} })
  assert.equal(seen[0].params.apply_id, undefined)
  assert.equal(seen[1].params.apply_id, 'brand-1')
})

/** A fake EmDash REST API with a chrome entry in two languages (one a draft), a schema and a media library. */
function fakeSite({ withField = false } = {}) {
  const log = []
  const state = {
    settings: { title: 'T' },
    fields: withField ? [{ slug: 'logo_dark' }] : [{ slug: 'title' }],
    entries: [
      { id: 'e-en', slug: 'chrome', locale: 'en', status: 'published', data: { title: 'C' } },
      { id: 'e-fr', slug: 'chrome', locale: 'fr', status: 'draft', data: { title: 'C' } }
    ]
  }
  const api = async (method, route, body) => {
    log.push([method, route, body])
    if (route === '/_emdash/api/settings') {
      if (method === 'POST') Object.assign(state.settings, body)
      return state.settings
    }
    if (route === '/_emdash/api/media/upload-url') return { mediaId: 'm1', existing: true }
    if (/^\/_emdash\/api\/media\/m1$/.test(route))
      return { item: { filename: 'a.png', mimeType: 'image/png', storageKey: 'K.png' } }
    if (route.endsWith('schema/collections/chrome/fields')) {
      if (method === 'POST') state.fields.push({ slug: body.slug })
      return { items: state.fields }
    }
    if (route === '/_emdash/api/content/chrome') return { items: state.entries }
    const one = /^\/_emdash\/api\/content\/chrome\/(?:chrome|(e-\w+))(\/publish)?\?locale=(\w+)$/.exec(route)
    if (one) {
      const entry = state.entries.find((e) => e.locale === one[3])
      if (method === 'PUT') Object.assign(entry.data, body.data)
      return { item: entry, _rev: `r-${entry.locale}` }
    }
    throw new Error(`unexpected ${method} ${route}`)
  }
  return { api, log, state }
}

test('the door sets a media reference in the settings, takes it back, and refuses any other setting', async () => {
  const site = fakeSite()
  const ask = emdashBrandDoor({ api: site.api, siteUrl: 'http://x', token: 't' })
  assert.deepEqual(await ask('emdash.settings', { operation: 'set', fields: { logo: { mediaId: 'm1' } } }), {
    ok: true
  })
  assert.deepEqual(site.state.settings.logo, { mediaId: 'm1' })
  assert.deepEqual((await ask('emdash.settings', { operation: 'read' })).fields.logo, { mediaId: 'm1' })
  const bad = await ask('emdash.settings', { operation: 'set', fields: { title: 'Other' } })
  assert.equal(bad.ok, false)
  assert.equal(site.state.settings.title, 'T', 'the title is not this door’s to write')
})

test('the door makes the dark logo field when the schema lacks it and writes the published languages only', async () => {
  const site = fakeSite()
  const ask = emdashBrandDoor({ api: site.api, siteUrl: 'http://x', token: 't' })
  const where = { collection: 'chrome', slug: 'chrome', field: 'logo_dark' }
  const set = await ask('emdash.entryField', { operation: 'set', ...where, media: 'm1' })
  assert.deepEqual(set, { ok: true, locales: ['en'] })
  assert.ok(
    site.log.some(
      ([m, r, b]) => m === 'POST' && r.endsWith('/fields') && b.slug === 'logo_dark' && b.type === 'image'
    )
  )
  assert.equal(site.state.entries[0].data.logo_dark.id, 'm1')
  assert.equal(site.state.entries[0].data.logo_dark.meta.storageKey, 'K.png')
  assert.equal(site.state.entries[1].data.logo_dark, undefined, 'a draft language stays as it is')
  assert.ok(site.log.some(([m, r]) => m === 'POST' && r.includes('/e-en/publish?locale=en')))
  const put = site.log.find(([m]) => m === 'PUT')
  assert.equal(put[2]._rev, 'r-en', 'the write carries the revision it read')
  assert.equal((await ask('emdash.entryField', { operation: 'read', ...where })).mediaId, 'm1')
})

test('the door does not make a field that exists, and refuses what it cannot place', async () => {
  const site = fakeSite({ withField: true })
  const ask = emdashBrandDoor({ api: site.api, siteUrl: 'http://x', token: 't' })
  await ask('emdash.entryField', {
    operation: 'set',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark',
    media: 'm1'
  })
  assert.equal(
    site.log.some(([m, r]) => m === 'POST' && r.endsWith('/fields')),
    false
  )
  assert.equal(
    (
      await ask('emdash.entryField', {
        operation: 'set',
        collection: '../x',
        slug: 'a',
        field: 'b',
        media: 'm1'
      })
    ).ok,
    false
  )
  assert.equal((await ask('content.update', {})).error, 'unsupported')
  const none = fakeSite()
  none.state.entries.forEach((e) => (e.status = 'draft'))
  const refused = await emdashBrandDoor({ api: none.api, siteUrl: 'http://x', token: 't' })(
    'emdash.entryField',
    {
      operation: 'set',
      collection: 'chrome',
      slug: 'chrome',
      field: 'logo_dark',
      media: 'm1'
    }
  )
  assert.equal(refused.error, 'NO_PUBLISHED_ENTRY')
})

test('the site token goes to the site’s own upload route only, never to a signed URL on another origin', async () => {
  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init.headers)),
      redirect: init.redirect
    })
    return { ok: true, status: 200 }
  }
  const upload = async (uploadUrl, headers) => {
    const api = async (method, route) => {
      if (route === '/_emdash/api/media/upload-url')
        return { mediaId: 'm1', uploadUrl, method: 'PUT', headers }
      if (route.endsWith('/confirm')) return {}
      return { item: { filename: 'a.png', mimeType: 'image/png', storageKey: 'K.png' } }
    }
    const ask = emdashBrandDoor({ api, siteUrl: 'http://site.test', token: 'SECRET', fetchImpl })
    return ask('media.upload', { path: 'x/a.png', content_b64: PNG.toString('base64') })
  }
  const signed = await upload('https://bucket.storage.example/put?sig=abc', {
    'x-amz-meta': '1',
    Authorization: 'Bearer SECRET'
  })
  assert.equal(signed.ok, true)
  assert.equal(sent[0].url, 'https://bucket.storage.example/put?sig=abc')
  assert.equal(sent[0].headers.authorization, undefined, 'no bearer to a foreign origin')
  assert.equal(sent[0].headers['x-emdash-request'], undefined)
  assert.equal(sent[0].headers['x-amz-meta'], '1', 'the signed headers still go')
  assert.equal(sent[0].redirect, 'error')
  await upload('/_emdash/api/media/m1/upload', {})
  assert.equal(sent[1].url, 'http://site.test/_emdash/api/media/m1/upload')
  assert.equal(sent[1].headers.authorization, 'Bearer SECRET', 'the site’s own route takes the token')
  await upload('http://site.test.evil.example/put', {})
  assert.equal(sent[2].headers.authorization, undefined, 'a look-alike host is another origin')
})

test('the dark logo is read back from the published languages only, and every one must hold the picture', async () => {
  const site = fakeSite({ withField: true })
  const ask = emdashBrandDoor({ api: site.api, siteUrl: 'http://x', token: 't' })
  const where = { collection: 'chrome', slug: 'chrome', field: 'logo_dark' }
  // The published language holds an old picture; the draft language holds the requested one.
  site.state.entries[0].data.logo_dark = { id: 'old' }
  site.state.entries[1].data.logo_dark = { id: 'new' }
  site.state.entries.reverse() // the draft is listed first
  const read = await ask('emdash.entryField', { operation: 'read', ...where })
  assert.equal(read.mediaId, 'old', 'the draft holding the requested picture is not what reads back')
  assert.deepEqual(read.locales, { en: 'old' })
  // Two published languages, one of them stale: no common picture.
  site.state.entries.find((e) => e.locale === 'fr').status = 'published'
  assert.equal((await ask('emdash.entryField', { operation: 'read', ...where })).mediaId, null)
  site.state.entries.find((e) => e.locale === 'en').data.logo_dark = { id: 'new' }
  assert.equal((await ask('emdash.entryField', { operation: 'read', ...where })).mediaId, 'new')
  // Nothing published: nothing was written, so nothing reads back.
  site.state.entries.forEach((e) => (e.status = 'draft'))
  assert.equal((await ask('emdash.entryField', { operation: 'read', ...where })).mediaId, null)
})
