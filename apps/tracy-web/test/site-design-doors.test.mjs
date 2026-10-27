/**
 * The two doors of the design record (ADR 0023, "Addendum 29/09"), mounted with their dependencies
 * handed in — the pattern of `site-settings.test.mjs`. No database: the store is a Map.
 *
 * GET  /api/sites/:key/design — any live grant on the site; always 200, `{design: …|null}`.
 * PUT  /api/sites/:key/design — ONLY a verified actor assertion (the build's `check` stage, signed by
 *      the lane) whose seat holds `theme.style`'s toolset; `wrote_by` is the server's word, `build`,
 *      never the payload's.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { mountSiteDesign } from '../src/sites/design.js'
import { styleRecord, tokensFor } from '../src/lib/site-design.js'

function mounted({ kind = 'actor', refused = null, toolset = null } = {}) {
  const store = new Map()
  const app = new Hono()
  mountSiteDesign(app, {
    requireGrant: async () =>
      refused
        ? { error: new Response(JSON.stringify({ code: refused }), { status: 403 }) }
        : { kind, grant: { role: 'owner' } },
    toolsetRefusal: async () => toolset,
    read: async (key) =>
      store.has(key)
        ? { design: { ...store.get(key).record, updatedAt: '2026-09-29T00:00:00.000Z' } }
        : { design: null },
    write: async (key, record, wroteBy) => store.set(key, { record, wroteBy })
  })
  return { app, store }
}
const RECORD = {
  id: 'apple',
  source: 'catalog',
  name: 'Apple',
  platform: 'wordpress',
  tokens: { '--bg': '#fff' },
  tokensFrom: '/x/tokens.css'
}
const put = (app, body, key = 'lantern.localhost') =>
  app.request(`/api/sites/${key}/design`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

test('GET answers 200 {design: null} for a site that wears none recorded, and the record once there is one', async () => {
  const { app, store } = mounted({ kind: 'session' })
  const empty = await app.request('/api/sites/lantern.localhost/design')
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), { design: null })
  assert.equal(empty.headers.get('cache-control'), 'private, no-store')
  store.set('lantern.localhost', { record: RECORD, wroteBy: 'build' })
  assert.equal((await (await app.request('/api/sites/lantern.localhost/design')).json()).design.id, 'apple')
})

test('GET without a grant is the grant door’s own refusal', async () => {
  const { app } = mounted({ refused: 'SEAT_NOT_AUTHORIZED' })
  assert.equal((await app.request('/api/sites/lantern.localhost/design')).status, 403)
})

test('PUT from the build’s signed actor stores the record with wrote_by=build, whatever the payload says', async () => {
  const { app, store } = mounted({ kind: 'actor' })
  const res = await put(app, { ...RECORD, wroteBy: 'someone-else', wrote_by: 'someone-else' })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).design.id, 'apple')
  assert.equal(store.get('lantern.localhost').wroteBy, 'build')
  assert.equal(store.get('lantern.localhost').record.wroteBy, undefined)
})

test('PUT from a browser session or an api key is refused: a seat is not the build', async () => {
  for (const kind of ['session', 'key']) {
    const { app, store } = mounted({ kind })
    const res = await put(app, RECORD)
    assert.equal(res.status, 403)
    assert.equal((await res.json()).code, 'DESIGN_RECORD_BUILD_ONLY')
    assert.equal(store.size, 0)
  }
})

test('PUT from an actor whose seat lacks theme.style’s toolset is refused with the Apply door’s word', async () => {
  const { app, store } = mounted({ toolset: { toolset: 'code', role: 'editor' } })
  const res = await put(app, RECORD)
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'TOOLSET_NOT_GRANTED', toolset: 'code', role: 'editor' })
  assert.equal(store.size, 0)
})

test('PUT with a malformed record says which field, and stores nothing', async () => {
  const { app, store } = mounted({ kind: 'actor' })
  const res = await put(app, { ...RECORD, source: 'invented' })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.code, 'DESIGN_RECORD_INVALID')
  assert.match(body.error, /source/)
  assert.equal(store.size, 0)
})

test('styleRecord: an ok theme.style names the catalogue system with its tokens; anything else is no record', () => {
  const r = styleRecord({
    action: 'theme.style',
    params: { style: 'airbnb', apply_id: 'a1' },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.equal(r.record.id, 'airbnb')
  assert.equal(r.record.source, 'catalog')
  assert.equal(r.record.name, 'Airbnb')
  assert.equal(Object.keys(r.record.tokens).length, 56)
  assert.equal(r.wroteBy, 'apply:a1')
  // A brand variation (PR 8): the site wears the brand; its values live in the variation, not the map.
  const brand = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-acme-com', variation: { version: 3 } },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.deepEqual(
    { id: brand.record.id, source: brand.record.source, tokens: brand.record.tokens },
    { id: 'brand-acme-com', source: 'brand', tokens: null }
  )
  assert.equal(brand.wroteBy, 'apply')
  assert.equal(
    styleRecord({
      action: 'theme.style',
      params: { style: 'airbnb' },
      answer: { ok: false },
      platform: 'wordpress'
    }),
    null
  )
  assert.equal(
    styleRecord({ action: 'content.update', params: {}, answer: { ok: true }, platform: 'wordpress' }),
    null
  )
  assert.equal(
    styleRecord({
      action: 'theme.style',
      params: { style: 'Not An Id' },
      answer: { ok: true },
      platform: 'wordpress'
    }),
    null
  )
})

// Review of the data contract (API session, 29/09): four corrections to what a theme.style records.
test('a style the token map does not know, and that is no brand, is recorded as the template’s own look — not a catalogue system with no tokens', () => {
  const r = styleRecord({
    action: 'theme.style',
    params: { style: 'tracy-business' },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.deepEqual(r.record, {
    id: null,
    source: 'template',
    name: null,
    platform: 'wordpress',
    tokens: null,
    tokensFrom: null
  })
})

test('a brand variation carries its values: palette, fonts, sizes and spaces come back as tokens', () => {
  const variation = {
    version: 3,
    settings: {
      color: {
        palette: [
          { slug: 'bg', color: '#fffaf0' },
          { slug: 'accent', color: '#b4232a' }
        ]
      },
      typography: {
        fontFamilies: [{ slug: 'body', fontFamily: 'Inter, sans-serif' }],
        fontSizes: [
          { slug: 'base', size: '1rem' },
          { slug: 'xxl', size: '2.5rem' }
        ]
      },
      spacing: { spacingSizes: [{ slug: '4', size: '16px' }] }
    }
  }
  const r = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-acme-com', variation },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.equal(r.record.source, 'brand')
  assert.deepEqual(r.record.tokens, {
    '--bg': '#fffaf0',
    '--accent': '#b4232a',
    '--font-body': 'Inter, sans-serif',
    '--text-base': '1rem',
    '--text-2xl': '2.5rem',
    '--space-4': '16px'
  })
  assert.equal(r.record.tokensFrom, 'theme.style:variation')
})

test('a brand re-applied without values keeps the values already recorded for that same brand', () => {
  const before = { id: 'brand-acme-com', tokens: { '--bg': '#fffaf0' }, tokensFrom: 'theme.style:variation' }
  const same = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-acme-com', variation: {} },
    answer: { ok: true },
    platform: 'wordpress',
    before
  })
  assert.deepEqual(
    { tokens: same.record.tokens, tokensFrom: same.record.tokensFrom },
    { tokens: { '--bg': '#fffaf0' }, tokensFrom: 'theme.style:variation' }
  )
  const other = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-other-com', variation: {} },
    answer: { ok: true },
    platform: 'wordpress',
    before
  })
  assert.equal(other.record.tokens, null, 'another brand does not inherit this one’s values')
})

// Measured 30/09 on the stand `dsgnm` (site `dfbrandwp1`, brand basecamp.com): the build PUT the
// brand's record (`brand:basecamp.com`, 56 tokens from `Brand/<host>/tokens.css`), then its `style`
// stage sent `theme.style {style: brand-basecamp-com, variation}`, and this door replaced the record
// with the slug as the id and the 35 tokens a variation carries — while the folder's `design.json`
// kept `brand:basecamp.com`. The slug is how the theme names the brand, not which brand it is.
test('a theme.style wearing the brand the site already wears keeps the brand record the build sent', () => {
  const tokens = Object.fromEntries(Array.from({ length: 56 }, (_, i) => [`--t${i}`, `${i}px`]))
  const before = {
    id: 'brand:basecamp.com',
    source: 'brand',
    name: 'Basecamp',
    platform: 'wordpress',
    tokens,
    tokensFrom: '/site/dfbrandwp1/Brand/basecamp.com/tokens.css'
  }
  const variation = { version: 3, settings: { color: { palette: [{ slug: 'bg', color: '#0a0a0a' }] } } }
  const r = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-basecamp-com', variation, apply_id: 'a7' },
    answer: { ok: true },
    platform: 'wordpress',
    before
  })
  assert.deepEqual(r.record, before)
  assert.equal(r.wroteBy, 'apply:a7')
  // Another brand's slug is a new look: the record follows the variation, not the old brand.
  const other = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-other-com', variation },
    answer: { ok: true },
    platform: 'wordpress',
    before
  })
  assert.equal(other.record.id, 'brand-other-com')
  assert.deepEqual(other.record.tokens, { '--bg': '#0a0a0a' })
  // A brand record whose values were not read yet takes the variation's.
  const unread = styleRecord({
    action: 'theme.style',
    params: { style: 'brand-basecamp-com', variation },
    answer: { ok: true },
    platform: 'wordpress',
    before: { ...before, tokens: null, tokensFrom: null }
  })
  assert.deepEqual(
    { id: unread.record.id, tokens: unread.record.tokens, tokensFrom: unread.record.tokensFrom },
    { id: 'brand:basecamp.com', tokens: { '--bg': '#0a0a0a' }, tokensFrom: 'theme.style:variation' }
  )
})

test('wrote_by names the apply id the ANSWER carries first, then the one the caller sent', () => {
  const byAnswer = styleRecord({
    action: 'theme.style',
    params: { style: 'airbnb', apply_id: 'sent-1' },
    answer: { ok: true, applyId: 'issued-9' },
    platform: 'wordpress'
  })
  assert.equal(byAnswer.wroteBy, 'apply:issued-9')
  const snake = styleRecord({
    action: 'theme.style',
    params: { style: 'airbnb' },
    answer: { ok: true, apply_id: 'issued-8' },
    platform: 'wordpress'
  })
  assert.equal(snake.wroteBy, 'apply:issued-8')
  const bySent = styleRecord({
    action: 'theme.style',
    params: { style: 'airbnb', apply_id: 'api-k1-1790000000000' },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.equal(bySent.wroteBy, 'apply:api-k1-1790000000000')
  const bad = styleRecord({
    action: 'theme.style',
    params: { style: 'airbnb', apply_id: 'has spaces' },
    answer: { ok: true },
    platform: 'wordpress'
  })
  assert.equal(bad.wroteBy, 'apply')
})

// ADR 0023, "Addendum 29/09/2026 (afternoon)": a quickstart's tokens exist only as the build sent them — the
// generated map has no copy (Tracy Business's profile file, an EmDash site's own tokens.css) — so
// nothing tracy-web regenerates may overwrite them.
test('a quickstart re-applied by theme.style keeps the tokens the build recorded, name and source too', () => {
  const before = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokens: { '--color-forest': '#14483a', '--font-sans': '"Archivo", system-ui' },
    tokensFrom: 'site:/app/src/styles/tokens.css'
  }
  const same = styleRecord({
    action: 'theme.style',
    params: { style: 'tracy-business' },
    answer: { ok: true, applyId: 'a7' },
    platform: 'emdash',
    before
  })
  assert.deepEqual(same, {
    record: {
      id: 'tracy-business',
      source: 'quickstart',
      name: 'Tracy Business',
      platform: 'emdash',
      tokens: before.tokens,
      tokensFrom: 'site:/app/src/styles/tokens.css'
    },
    wroteBy: 'apply:a7'
  })
  // A catalogue system replaces it: the look really changed.
  const moved = styleRecord({
    action: 'theme.style',
    params: { style: 'apple' },
    answer: { ok: true },
    platform: 'joomla',
    before
  })
  assert.equal(moved.record.source, 'catalog')
  assert.equal(moved.record.tokens['--accent'], tokensFor('apple')['--accent'])
  // Another unknown style is not that quickstart: the template's own look, no values borrowed.
  const other = styleRecord({
    action: 'theme.style',
    params: { style: 'tracy-saas' },
    answer: { ok: true },
    platform: 'joomla',
    before
  })
  assert.deepEqual(
    { id: other.record.id, source: other.record.source, tokens: other.record.tokens },
    { id: null, source: 'template', tokens: null }
  )
})

test('PUT keeps a quickstart record with exactly the tokens the build sent, and GET answers them', async () => {
  const tokens = Object.fromEntries(
    Array.from({ length: 77 }, (_, i) => [`--t${i}`, `#${String(i).padStart(6, '0')}`])
  )
  const { app, store } = mounted()
  const record = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    platform: 'emdash',
    tokens,
    tokensFrom: 'site:/app/src/styles/tokens.css'
  }
  const res = await put(app, record, 'granite.localhost')
  assert.equal(res.status, 200)
  assert.deepEqual(store.get('granite.localhost')?.record.tokens, tokens)
  const got = await (await app.request('/api/sites/granite.localhost/design')).json()
  assert.deepEqual(got.design.tokens, tokens)
  assert.equal(got.design.source, 'quickstart')
})
