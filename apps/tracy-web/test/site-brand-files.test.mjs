/**
 * The brand-file door of "Customize your site" (plan T06): `POST /api/sites/brand-files`, table
 * `site_brand_upload`, and what a create press may do with the ids (`brandOfPress`), in
 * `src/sites/brand-files.js`.
 *
 * The pure parts run everywhere. The door cases go through `buildApp` against Postgres, with the artifact
 * store a fake S3 behind `fetchImpl` (the shape of `site-comment-attachments.test.mjs`); without
 * `TEST_DATABASE_URL` they skip.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { saveUiSwitches } from '../src/lib/ui-setting.js'
import { mintSession } from '../src/lib/session.js'
import {
  BRAND_SWITCH,
  brandIdsOf,
  brandOfPress,
  brandUploadsAvailable,
  readBrandFile,
  sweepBrandUploads
} from '../src/sites/brand-files.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
const S3 = 'http://store.test:9000'
const BUCKET = 'tracy-artifacts'
const A = '0b6f4c1e-7a1d-4c55-9c39-2f0d6c1b9a01'
const B = '7e2b9c4d-1f3a-4b8e-a6d2-5c9e0f1a2b03'

const png = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } } })
    .png()
    .toBuffer()

test('the press names a logo as one id or as variants, and a favicon as one id; anything else is no id', () => {
  assert.deepEqual(brandIdsOf({ logo: A, favicon: B }), { logo: { single: A }, favicon: B })
  assert.deepEqual(brandIdsOf({ logo: { light: A, dark: B, extra: A } }), {
    logo: { light: A, dark: B },
    favicon: null
  })
  assert.deepEqual(brandIdsOf({ logo: 'logo.png', favicon: ['x'] }), { logo: null, favicon: null })
  assert.deepEqual(brandIdsOf({ logo: { light: 'nope' } }), { logo: null, favicon: null })
  assert.deepEqual(brandIdsOf(null), { logo: null, favicon: null })
})

test('uploads are on only with an artifact store and the switch shown', () => {
  // The switch an operator presses at /ops: it has to be one the catalogue lists (CLAUDE.md §8).
  const catalogue = JSON.parse(
    readFileSync(
      new URL('../../../packages/core/tracy-core/src/ui-switches/catalogue.json', import.meta.url),
      'utf8'
    )
  )
  assert.ok(
    catalogue.switches.some((s) => s.id === BRAND_SWITCH),
    `${BRAND_SWITCH} is not in the catalogue`
  )
  assert.equal(brandUploadsAvailable({ artifactStore: {} }, []), true)
  assert.equal(brandUploadsAvailable({ artifactStore: {} }, ['site-brand-uploads']), false)
  assert.equal(brandUploadsAvailable({ artifactStore: null }, []), false)
})

test('a press naming no file needs no database', async () => {
  const never = { query: () => assert.fail('no query for a press without files') }
  const out = await brandOfPress(never, {
    answers: { name: 'X' },
    accountId: A,
    siteKey: 's',
    available: true
  })
  assert.deepEqual(out, { logo: null, favicon: null, notes: [] })
})

test('switch off: the ids of a press are dropped with a note, never read', async () => {
  const never = { query: () => assert.fail('no query while uploads are off') }
  const out = await brandOfPress(never, {
    answers: { favicon: B },
    accountId: A,
    siteKey: 's',
    available: false
  })
  assert.equal(out.favicon, null)
  assert.equal(out.notes.length, 1)
})

/** An S3 that keeps objects in memory and refuses unsigned calls. */
function fakeStore() {
  const objects = new Map()
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    const method = init.method ?? 'GET'
    assert.equal(u.origin, S3, 'only the artifact store is dialled')
    const signed =
      u.searchParams.has('X-Amz-Signature') || /AWS4-HMAC-SHA256/.test(init.headers?.authorization ?? '')
    assert.ok(signed, 'every store call is signed')
    const key = decodeURIComponent(u.pathname.slice(BUCKET.length + 2))
    if (method === 'PUT') {
      objects.set(key, new Uint8Array(await new Response(init.body).arrayBuffer()))
      return new Response('', { status: 200 })
    }
    if (method === 'GET') {
      const bytes = objects.get(key)
      return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 })
    }
    if (method === 'DELETE') {
      objects.delete(key)
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected ${method}`)
  }
  return { objects, fetchImpl }
}

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world(t, { switchOn = true, store = true } = {}) {
  const { pool } = db
  const config = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    ...(store
      ? {
          ARTIFACT_S3_ENDPOINT: S3,
          ARTIFACT_S3_BUCKET: BUCKET,
          ARTIFACT_S3_ACCESS_KEY: 'ak',
          ARTIFACT_S3_SECRET_KEY: 'sk'
        }
      : {})
  })
  if (switchOn) await saveUiSwitches(pool, { [BRAND_SWITCH]: true }, 'test')
  await createSite(pool, { siteKey: 'lantern.example', label: 'lantern', host: 'local' })
  const s3 = fakeStore()
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl: s3.fetchImpl
  })
  const upload = async (email, bytes, role) => {
    const form = new FormData()
    if (bytes) form.set('file', new File([bytes], 'logo.png', { type: 'image/png' }))
    if (role) form.set('role', role)
    const headers = email ? { cookie: `tracy_sess=${await mintSession(email, SECRET)}` } : {}
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites/brand-files', { method: 'POST', headers, body: form })
    )
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const accountId = async (email) =>
    (await pool.query('select id from account where email = $1', [email])).rows[0]?.id
  return { pool, config, s3, upload, accountId }
}

test('a valid PNG is kept: 201 {id, width, height}, bytes readable by id', opts, async (t) => {
  const { pool, config, s3, upload, accountId } = await world(t)
  const bytes = await png(800, 200)
  const up = await upload('owner@x.y', bytes, 'logo-light')
  assert.equal(up.status, 201)
  assert.deepEqual(Object.keys(up.body).sort(), ['height', 'id', 'width'])
  assert.equal(up.body.width, 800)
  assert.equal(up.body.height, 200)
  const file = await readBrandFile({ pool, store: config.artifactStore, fetchImpl: s3.fetchImpl }, up.body.id)
  assert.deepEqual(file.bytes, new Uint8Array(bytes))
  assert.equal(file.role, 'logo-light')
  assert.equal(file.owner, await accountId('owner@x.y'))
  assert.equal(file.siteKey, null)
})

test('an SVG is 422 PNG_ONLY; a small favicon 422 FAVICON_TOO_SMALL; nothing stored', opts, async (t) => {
  const { upload, s3 } = await world(t)
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"/>')
  const refused = await upload('owner@x.y', svg, 'logo')
  assert.equal(refused.status, 422)
  assert.equal(refused.body.code, 'PNG_ONLY')
  const small = await upload('owner@x.y', await png(256, 256), 'favicon')
  assert.equal(small.status, 422)
  assert.equal(small.body.code, 'FAVICON_TOO_SMALL')
  assert.equal(s3.objects.size, 0)
})

test('signed out is refused; a missing role is 400', opts, async (t) => {
  const { upload } = await world(t)
  const anon = await upload(null, await png(600, 600), 'logo')
  assert.ok(anon.status === 401 || anon.status === 302 || anon.status === 403, `status ${anon.status}`)
  assert.equal((await upload('owner@x.y', await png(600, 600), null)).status, 400)
})

test('switch off: the door is not there', opts, async (t) => {
  const { upload } = await world(t, { switchOn: false })
  const res = await upload('owner@x.y', await png(600, 600), 'logo')
  assert.equal(res.status, 404)
  assert.equal(res.body.code, 'BRAND_UPLOADS_OFF')
})

test('no artifact store: 503', opts, async (t) => {
  const { upload } = await world(t, { store: false })
  assert.equal((await upload('owner@x.y', await png(600, 600), 'logo')).status, 503)
})

test('a press keeps its own ids, claims them for the site, and drops another account’s', opts, async (t) => {
  const { pool, upload, accountId } = await world(t)
  const mine = (await upload('owner@x.y', await png(800, 200), 'logo-dark')).body.id
  const icon = (await upload('owner@x.y', await png(512, 512), 'favicon')).body.id
  const theirs = (await upload('stranger@x.y', await png(800, 200), 'logo-light')).body.id
  const out = await brandOfPress(pool, {
    answers: { logo: { light: theirs, dark: mine }, favicon: icon },
    accountId: await accountId('owner@x.y'),
    siteKey: 'lantern.example',
    available: true
  })
  assert.deepEqual(out.logo, { dark: mine })
  assert.equal(out.favicon, icon)
  assert.equal(out.notes.length, 1)
  const { rows } = await pool.query('select id, site_key from site_brand_upload where site_key is not null')
  assert.deepEqual(rows.map((r) => r.id).sort(), [mine, icon].sort())
})

test('a favicon id in the logo place, or a logo id in the favicon place, is dropped', opts, async (t) => {
  const { pool, upload, accountId } = await world(t)
  const logo = (await upload('owner@x.y', await png(800, 200), 'logo')).body.id
  const icon = (await upload('owner@x.y', await png(512, 512), 'favicon')).body.id
  const out = await brandOfPress(pool, {
    answers: { logo: icon, favicon: logo },
    accountId: await accountId('owner@x.y'),
    siteKey: 'lantern.example',
    available: true
  })
  assert.equal(out.logo, null)
  assert.equal(out.favicon, null)
  assert.equal(out.notes.length, 2)
})

test('the sweep removes unclaimed uploads after a day and claimed ones after 30 days', opts, async (t) => {
  const { pool, config, s3, upload, accountId } = await world(t)
  const loose = (await upload('owner@x.y', await png(600, 600), 'logo')).body.id
  const kept = (await upload('owner@x.y', await png(600, 600), 'logo')).body.id
  await brandOfPress(pool, {
    answers: { logo: kept },
    accountId: await accountId('owner@x.y'),
    siteKey: 'lantern.example',
    available: true
  })
  // The sweep reads ages on the database clock, so the rows are aged there, never the process clock.
  assert.deepEqual(await sweepBrandUploads(pool, config.artifactStore, s3.fetchImpl), [])
  await pool.query(`update site_brand_upload set created_at = created_at - interval '25 hours'`)
  assert.deepEqual(await sweepBrandUploads(pool, config.artifactStore, s3.fetchImpl), [loose])
  await pool.query(`update site_brand_upload set claimed_at = claimed_at - interval '31 days'`)
  assert.deepEqual(await sweepBrandUploads(pool, config.artifactStore, s3.fetchImpl), [kept])
  assert.equal(s3.objects.size, 0)
})

test(
  'POST /api/sites: the brief carries the presser’s own files as `brand`, never another account’s, and the create succeeds',
  opts,
  async (t) => {
    const { pool, config, s3, upload, accountId } = await world(t)
    const mine = (await upload('owner@x.y', await png(800, 200), 'logo-light')).body.id
    const theirs = (await upload('stranger@x.y', await png(512, 512), 'favicon')).body.id
    const started = []
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, config),
      host: { hostCall, hostJob },
      briefs: {
        start: async (input) => (started.push(input), { started: true }),
        gate: async () => ({ open: false, step: null }),
        waiting: async () => null,
        abandon: async () => {}
      },
      fetchImpl: async (input, init) => {
        const u = new URL(String(input))
        if (u.origin === S3) return s3.fetchImpl(input, init)
        if (u.pathname === '/_host/provision')
          return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
        return new Response('', { status: 404 })
      }
    })
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites', {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession('owner@x.y', SECRET)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          label: 'golden',
          platform: 'wordpress',
          brief: { answers: { name: 'Golden Crust', logo: { light: mine }, favicon: theirs } }
        })
      })
    )
    assert.equal(res.status, 202, await res.clone().text())
    assert.equal(started.length, 1)
    const { brief, siteKey } = started[0]
    assert.deepEqual(brief.brand, { logo: { light: mine }, favicon: null })
    assert.equal(brief.brandNotes.length, 1)
    assert.ok(!JSON.stringify(brief.answers ?? []).includes(mine), 'no file id among the answers')
    const { rows } = await pool.query('select site_key, uploaded_by from site_brand_upload where id = $1', [
      mine
    ])
    assert.equal(rows[0].site_key, siteKey)
    assert.equal(rows[0].uploaded_by, await accountId('owner@x.y'))
  }
)

/** `POST /api/sites` with these answers (and `extra` beside them); the brief the build was started with, or null. */
async function pressBrief(t, answers, worldOpts, extra = {}) {
  const { pool, config, s3 } = await world(t, worldOpts)
  const started = []
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    briefs: {
      start: async (input) => (started.push(input), { started: true }),
      gate: async () => ({ open: false, step: null }),
      waiting: async () => null,
      abandon: async () => {}
    },
    fetchImpl: async (input, init) => {
      const u = new URL(String(input))
      if (u.origin === S3) return s3.fetchImpl(input, init)
      if (u.pathname === '/_host/provision')
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
      return new Response('', { status: 404 })
    }
  })
  const res = await app.fetch(
    new Request('http://tracy.test/api/sites', {
      method: 'POST',
      headers: {
        cookie: `tracy_sess=${await mintSession('owner@x.y', SECRET)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ label: 'golden', platform: 'wordpress', brief: { answers, ...extra } })
    })
  )
  assert.equal(res.status, 202, await res.clone().text())
  return started[0]?.brief ?? null
}

test(
  'POST /api/sites: collected contact facts travel with the brief, so the identity writers receive them',
  opts,
  async (t) => {
    const facts = {
      phone: { value: '+84 235 5550 134', source: 'business.phone', fetchedAt: '2026-10-19T10:00:00.000Z' },
      hours: { value: 'Mon: 8 AM – 9 PM', source: 'business.hours' },
      fax: { value: '1', source: 'x' }
    }
    const brief = await pressBrief(t, { name: 'Golden Crust' }, undefined, { facts })
    assert.deepEqual(brief.facts, { phone: facts.phone, hours: facts.hours })
  }
)

test(
  'POST /api/sites: switch on and no logo given, the brief carries no brand, so the template keeps its logo (LOGO-4 dropped)',
  opts,
  async (t) => {
    const brief = await pressBrief(t, { name: 'Golden Crust' })
    assert.ok(brief, 'the build still starts with the answers')
    assert.equal(brief.brand, undefined)
    assert.equal(brief.facts, undefined, 'no facts sent, none carried')
  }
)

test(
  'POST /api/sites: switch off, the Logo question was never asked, so the brief carries no brand and the template is left alone',
  opts,
  async (t) => {
    const brief = await pressBrief(t, { name: 'Golden Crust' }, { switchOn: false })
    assert.ok(brief, 'the build still starts with the answers')
    assert.equal(brief.brand, undefined)
  }
)
