/**
 * The Design system library, screenshot and support doors (`src/sites/design-system.js`), and a Refero
 * system applied through the POST — over the real emitters and contracts (`lib/ds-slot.js`), with a
 * fake host. The library is Refero's alone, every system that passes the gate (Akemi, 12/10/2026);
 * OpenDesign is refused, while a site that still wears one reads its name and undoes it.
 *
 *   node --test apps/tracy-web/test/design-system-library-door.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { mountDesignSystem } from '../src/sites/design-system.js'
import { slotIdOf, wornOf } from '../src/sites/design-system-ids.js'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  contractFor,
  DS_SLOT_DIR,
  dsLibrary,
  FEATURED_REFERO_SYSTEMS,
  orderReferoRows,
  emitFor,
  maxVersionOf,
  minVersionOf,
  rawTemplatesOf,
  referoLibrary,
  referoScreenshotPath,
  supportForNewSite,
  templateKeyOf,
  versionKeyOf
} from '../src/lib/ds-slot.js'

const MOXIE = '7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const AIRBNB = '194faa2f-2f69-4bbf-9e29-290f28fa8ca2'
/** A Refero system outside the old hand-picked twelve (pampam.city): offered now. */
const PAMPAM = '001480cb-05f4-4802-be39-84b942169481'
/** A Refero system the quality gate refuses (Lamanna: its text is its background, 1:1): never offered. */
const LAMANNA = '057d7c66-76b7-4272-849c-4058543e6799'
const CATALOG = JSON.parse(
  readFileSync(new URL('../../../vendor/tracy/refero/catalog.json', import.meta.url), 'utf8')
)

function mounted({ signedIn = true, releases = {}, wearing = null } = {}) {
  const writes = []
  const rows = []
  const app = new Hono()
  mountDesignSystem(app, {
    requireGrant: async () => ({ kind: 'session', email: 'a@x.test', grant: { role: 'owner' } }),
    // `signedIn: 'missing'`: a caller that forgot the sign-in check.
    ...(signedIn === 'missing'
      ? {}
      : {
          signedIn: async (c) =>
            signedIn ? { email: 'a@x.test' } : { error: c.json({ code: 'NOT_SIGNED_IN' }, 401) }
        }),
    releaseVersion: async (tag) => releases[tag] ?? null,
    siteByKey: async (key) => ({
      site_key: key,
      platform: 'emdash',
      quickstart_tag: 'tracy-business/emdash-0.x',
      quickstart_version: '1.7.7'
    }),
    toolsetRefusal: async () => null,
    // An EmDash host that writes what it is given and says it.
    runJob: async (_site, input) => {
      if (input.mode === 'read') return { ok: true, output: JSON.stringify({ ok: true, slot: wearing }) }
      if (input.mode === 'undo')
        return {
          ok: true,
          output: JSON.stringify({ ok: true, slot: null, changed: true })
        }
      if (input.mode === 'apply') {
        writes.push(input.payload)
        return {
          ok: true,
          output: JSON.stringify({
            ok: true,
            undoId: String(writes.length).padStart(12, '0'),
            slot: { id: input.payload.system, name: null },
            previous: null,
            changed: true
          })
        }
      }
      return { ok: false, reason: 'bad mode' }
    },
    lease: { take: async () => ({ ok: true, fresh: true }), release: async () => {} },
    record: async () => {},
    store: {
      insert: async (r) => {
        rows.push({ undo_id: r.undoId, system_id: r.systemId, system_name: r.systemName, undone_at: null })
      },
      latest: async () => rows.at(-1) ?? null,
      markUndone: async (_key, undoId) => {
        const row = rows.find((r) => r.undo_id === undoId)
        if (row) row.undone_at = new Date()
      }
    },
    ds: {
      library: dsLibrary,
      refero: referoLibrary,
      referoScreenshot: referoScreenshotPath,
      supportForNewSite,
      templateKeyOf,
      contractFor,
      rawTemplatesOf,
      versionKeyOf,
      minVersionOf,
      maxVersionOf,
      emitFor
    }
  })
  return { app, writes, rows }
}

const post = (app, path, body) =>
  app
    .request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(async (r) => ({ status: r.status, body: await r.json() }))

const getJson = (app, path) =>
  app.request(path).then(async (r) => ({ status: r.status, body: await r.json() }))

test('library: every Refero system that passes the gate, nothing else, in one shape', async () => {
  const { app } = mounted()
  const { status, body } = await getJson(app, '/api/design-system/library')
  assert.equal(status, 200)
  assert.ok(body.systems.length > 1000, `${body.systems.length} systems offered`)
  assert.ok(body.systems.length < CATALOG.systems.length, 'the gate leaves some out')
  assert.ok(
    body.systems.every((s) => s.kind === 'refero' && s.id.startsWith('refero:') && s.ok === true),
    'Refero only, and only what passes'
  )
  assert.equal(new Set(body.systems.map((s) => s.id)).size, body.systems.length, 'each system once')
  // Akemi's twelve and the three David added (13/10/2026) first, in that order, then the rest A to Z by name.
  assert.deepEqual(
    body.systems.slice(0, 15).map((s) => s.name),
    [
      'Moxie',
      // Notion, Airbnb and Spotify share their name with another offered system: a suffix tells them apart.
      'Notion · notion.so',
      'Airbnb · airbnb.org',
      'Eddie',
      'MotherDuck',
      'Toggl Track',
      'Voiceflow',
      'ElevenLabs',
      'Figma',
      'Mailchimp',
      'Spotify · Dark',
      'Pitch',
      'Stripe',
      'Apple · apple.com',
      'Linear'
    ]
  )
  assert.deepEqual(
    body.systems.slice(0, 15).map((s) => s.id),
    FEATURED_REFERO_SYSTEMS.map((u) => `refero:${u}`)
  )
  // No two offered systems share a name (Akemi, 12/10/2026: a suffix from the source data).
  const names = body.systems.map((s) => s.name)
  assert.equal(new Set(names).size, names.length, 'each name once')
  assert.ok(names.includes('Apple · iPhone 18 Pro'), 'a page tells same-site systems apart')
  assert.ok(
    names.includes('Coda · coda.io') && names.includes('Coda · coda.co'),
    'a domain tells sites apart'
  )
  // The rest sorts by the catalogue's name, so a suffixed name sorts by what comes before " · ".
  const key = (n) => n.split(' · ')[0].replace(/^[\s\p{P}\p{S}]+/u, '') || n
  const collator = new Intl.Collator('en', { sensitivity: 'accent' })
  const rest = body.systems.slice(15)
  assert.ok(
    rest.every((s, i) => i === 0 || collator.compare(key(rest[i - 1].name), key(s.name)) <= 0),
    'the rest A to Z'
  )
  assert.ok(!rest.some((s) => FEATURED_REFERO_SYSTEMS.includes(s.id.slice(7))), 'a featured system once')
  for (const s of body.systems) {
    assert.deepEqual(Object.keys(s).sort(), [
      'colors',
      'description',
      'fonts',
      'group',
      'id',
      'image',
      'kind',
      'name',
      'ok',
      'theme'
    ])
    assert.ok(['light', 'dark', 'mixed'].includes(s.theme), `${s.id}: theme ${s.theme}`)
    assert.ok(Array.isArray(s.fonts))
    assert.ok(Array.isArray(s.colors))
    for (const hex of s.colors) assert.match(hex, /^#[0-9a-f]{3,8}$/)
    assert.equal(new Set(s.colors).size, s.colors.length, `${s.id}: each colour once`)
    assert.equal(s.image, `/api/design-system/library/refero/${s.id.slice(7)}/screenshot.jpg`)
  }
  assert.ok(!body.systems.some((s) => s.id.startsWith('od:')), 'no OpenDesign system')
  assert.ok(!body.systems.some((s) => s.id === `refero:${LAMANNA}`), 'a refused system is left out')
  assert.ok(
    body.systems.some((s) => s.id === `refero:${PAMPAM}`),
    'beyond the old twelve'
  )
  const moxie = body.systems.find((s) => s.id === `refero:${MOXIE}`)
  assert.equal(moxie.name, 'Moxie')
  assert.match(moxie.description, /Editorial darkroom/)
  assert.ok(moxie.colors.length > 0, 'a Refero system has its palette')
  const airbnb = body.systems.find((s) => s.id === `refero:${AIRBNB}`)
  assert.deepEqual(airbnb.fonts, [{ use: 'Inter', for: 'Airbnb Cereal VF' }])
  assert.equal(typeof airbnb.group, 'string')
  // The catalogue's theme, passed on as it is.
  const byUuid = new Map(CATALOG.systems.map((r) => [r.id, r.theme]))
  assert.ok(
    body.systems.every((s) => s.theme === byUuid.get(s.id.slice(7))),
    'theme from the catalogue'
  )
})

test('library order: featured first in the given order, a featured id not offered skipped, rest A to Z', () => {
  const row = (uuid, name) => ({ id: `refero:${uuid}`, uuid, name })
  const u = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const rows = [
    row(u(1), 'zeta'),
    row(u(2), 'Moxie'),
    row(u(3), '  "alpha'),
    row(u(4), 'Beta'),
    row(u(5), 'beta'),
    row(u(6), 'Notion'),
    row(u(7), 'Émile')
  ]
  // u(9) is featured but not offered (missing, or refused by the gate): skipped.
  const out = orderReferoRows(rows, [u(6), u(9), u(2)])
  assert.deepEqual(
    out.map((r) => r.name),
    ['Notion', 'Moxie', '  "alpha', 'Beta', 'beta', 'Émile', 'zeta']
  )
  assert.deepEqual(
    out.slice(3, 5).map((r) => r.uuid),
    [u(4), u(5)],
    'a tie by id'
  )
  assert.equal(rows[0].name, 'zeta', 'the input is left alone')
})

test('library order: a featured system the gate refuses is never offered', async () => {
  const offered = await referoLibrary()
  const withLamanna = orderReferoRows(offered, [LAMANNA, MOXIE])
  assert.equal(withLamanna[0].uuid, MOXIE)
  assert.ok(!withLamanna.some((s) => s.uuid === LAMANNA))
})

test('library and support: a person who is not signed in reads nothing', async () => {
  const { app } = mounted({ signedIn: false })
  assert.equal((await app.request('/api/design-system/library')).status, 401)
  assert.equal((await app.request('/api/design-system/support?quickstart=x&platform=joomla')).status, 401)
})

test('library and support: a mount without the sign-in check fails closed (401)', async () => {
  const { app } = mounted({ signedIn: 'missing' })
  for (const path of [
    '/api/design-system/library',
    '/api/design-system/support?quickstart=x&platform=joomla'
  ]) {
    const res = await app.request(path)
    assert.equal(res.status, 401, path)
    assert.equal((await res.json()).code, 'NOT_SIGNED_IN', path)
  }
})

test('screenshot: served for an offered uuid only, as the small WebP thumbnail', async () => {
  const { app } = mounted()
  const ok = await app.request(`/api/design-system/library/refero/${MOXIE}/screenshot.jpg`)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('content-type'), 'image/webp')
  const bytes = new Uint8Array(await ok.arrayBuffer())
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b))
  assert.ok(ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP', 'a WebP')
  assert.ok(bytes.length < 60_000, `a thumbnail, not the 1440-px original (${bytes.length} bytes)`)
  const more = await app.request(`/api/design-system/library/refero/${PAMPAM}/screenshot.jpg`)
  assert.equal(more.status, 200, 'a system beyond the old twelve')
  const refused = await app.request(`/api/design-system/library/refero/${LAMANNA}/screenshot.jpg`)
  assert.equal(refused.status, 404, 'a system the gate refuses')
  assert.equal(
    (await app.request('/api/design-system/library/refero/..%2F..%2Fx/screenshot.jpg')).status,
    404
  )
})

test('screenshot: the thumbnails shipped are exactly the offered systems (none of a refused one)', async () => {
  // `refero-thumbs/` is what the image copies, and the Dockerfile keeps a system's data files only
  // when it has a thumbnail: one picture per offered system, and not one for a system the gate refuses.
  const offered = new Set((await referoLibrary()).map((r) => `${r.uuid}.webp`))
  const have = readdirSync(path.join(DS_SLOT_DIR, 'refero-thumbs')).filter((f) => f.endsWith('.webp'))
  const missing = [...offered].filter((f) => !have.includes(f))
  const refused = have.filter((f) => !offered.has(f))
  assert.deepEqual(missing, [], 'an offered system without its thumbnail')
  assert.deepEqual(refused, [], 'a thumbnail of a system the gate refuses')
  assert.ok(!have.includes(`${LAMANNA}.webp`))
})

test('support: a new site from the newest release of a quickstart, judged by its contract', async () => {
  const { app } = mounted({
    releases: {
      'quickstart/ja-kinetic/j6': '1.0.4',
      'quickstart/ja-vega/j6': '1.0.3',
      'tracy-business/emdash-0.x': '1.7.10'
    }
  })
  const ask = (q) => getJson(app, `/api/design-system/support?${q}`).then((r) => r.body)
  assert.deepEqual(await ask('quickstart=quickstart/ja-kinetic/j6&platform=joomla'), {
    supported: true,
    reason: null,
    need: '1.0.4',
    have: '1.0.4'
  })
  assert.deepEqual(await ask('quickstart=quickstart/ja-vega/j6&platform=joomla'), {
    supported: false,
    reason: 'TEMPLATE_NEEDS_UPDATE',
    need: '1.0.4',
    have: '1.0.3'
  })
  assert.equal((await ask('quickstart=tracy-business/emdash-0.x&platform=emdash')).supported, true)
  assert.deepEqual(await ask('quickstart=nobody/j6&platform=joomla'), {
    supported: false,
    reason: 'TEMPLATE_NOT_READY',
    need: null,
    have: null
  })
  // WordPress: judged by the theme's contract; the theme version is read at apply time.
  const wp = await ask('quickstart=quickstart/ja-essence/wp7&platform=wordpress')
  assert.equal(wp.supported, true)
  assert.equal(wp.have, null)
})

test('apply: an offered Refero system goes on by `refero:<uuid>`; OpenDesign and refused ones are unknown', async () => {
  const { app, writes, rows } = mounted()
  const at = '/api/sites/dsbtn.localhost/design-system'
  const r = await post(app, at, { id: `refero:${MOXIE}` })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(writes[0].system, `refero:${MOXIE}`)
  assert.match(writes[0].css, new RegExp(`tracy-ds-slot: refero:${MOXIE}`))
  assert.deepEqual(r.body.worn, { id: `refero:${MOXIE}`, slotId: `refero:${MOXIE}`, name: 'Moxie' })
  assert.equal(rows[0].system_id, `refero:${MOXIE}`)
  const more = await post(app, at, { id: `refero:${PAMPAM}` })
  assert.equal(more.status, 200, 'a system beyond the old twelve')
  assert.equal(writes[1].system, `refero:${PAMPAM}`)
  for (const id of [
    'od:stripe',
    'stripe',
    `refero:${LAMANNA}`,
    'refero:00000000-0000-0000-0000-000000000000'
  ]) {
    const no = await post(app, at, { id })
    assert.equal(no.status, 400, id)
    assert.equal(no.body.code, 'DS_UNKNOWN', id)
  }
  assert.equal(writes.length, 2, 'nothing written for a refused id')
})

test('a site that still wears an OpenDesign system reads its name and undoes it', async () => {
  const { app, rows } = mounted({ wearing: { id: 'od:stripe', name: null } })
  // The apply was made while OpenDesign was offered: its row is the store's.
  rows.push({
    undo_id: 'a1b2c3d4e5f6',
    system_id: 'stripe',
    system_name: 'Stripe',
    previous_id: null,
    previous_name: null,
    undone_at: null
  })
  const read = await getJson(app, '/api/sites/dsbtn.localhost/design-system')
  assert.equal(read.status, 200, JSON.stringify(read.body))
  assert.deepEqual(read.body.worn, { id: 'stripe', slotId: 'od:stripe', name: 'Stripe' })
  assert.equal(read.body.last.applyId, 'a1b2c3d4e5f6')
  assert.equal(read.body.last.undone, false)
  const undo = await post(app, '/api/sites/dsbtn.localhost/design-system/undo', { applyId: 'a1b2c3d4e5f6' })
  assert.equal(undo.status, 200, JSON.stringify(undo.body))
  assert.equal(undo.body.ok, true)
  assert.equal(undo.body.worn, null)
  assert.ok(rows[0].undone_at, 'the apply is marked undone')
})

test('slot ids and worn names cover both libraries', () => {
  assert.equal(slotIdOf('stripe'), 'od:stripe')
  assert.equal(slotIdOf(`refero:${MOXIE}`), `refero:${MOXIE}`)
  const names = new Map([[`refero:${MOXIE}`, 'Moxie']])
  assert.deepEqual(wornOf({ id: `refero:${MOXIE}`, name: null }, names), {
    id: `refero:${MOXIE}`,
    slotId: `refero:${MOXIE}`,
    name: 'Moxie'
  })
})
