/**
 * `POST /api/ops/templates/:templateId/capture` — the operations end of "Capture shots from demo".
 *
 * The browser lives on the demo host (tracy-host), so this door only ever asks it over a stubbed
 * `host.hostCall` and then stores what came back through the real picture store. What these assert
 * is the door's contract: it shoots the live demo of the tag, names every returned picture with the
 * shared `shotName`, hands back absolute addresses, and refuses in words when there is nothing to
 * shoot or no host to shoot from — and never for a caller who may not write.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { getShot, MAX_PICTURE_BYTES } from '../src/lib/template-shots.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h',
  SEAT_demo_SECRET: 'k'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const TAG = 'tracy-business/j6'
const TEMPLATE = 'tracy-business'

/** A one-pixel PNG's worth of bytes, base64 — enough for the store to keep and serve. */
const PNG = (tag) => Buffer.from(`png-${tag}`).toString('base64')

/** A fake tracy-host: answers `/capture` with a shot per layout×viewport, remembers the call. */
function fakeHost(shotsFor) {
  const calls = []
  return {
    calls,
    hostCall: async (_config, hostName, path, body) => {
      calls.push({ hostName, path, body })
      if (path !== '/capture') return { ok: false, status: 404, body: { error: 'unexpected' } }
      return { ok: true, status: 200, body: { shots: shotsFor(body) } }
    }
  }
}

function harness(pool, host) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config)
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  const get = (path, cookie) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: 'manual'
      })
    )
  return { app, send, get, cookieFor, config }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

async function seedRelease(pool, { tag = TAG, platform = 'joomla' } = {}) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({
        name: 'Quickstart: Tracy Business / Joomla 6',
        kind: 'quickstart',
        github: 'published',
        publishedAt: '2026-09-13T11:21:00Z',
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform,
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '6.1.1',
        install: {},
        template: TEMPLATE
      })
    ]
  )
}

/** A live demo of the tag on this server: the row `liveDemoOf` reads (label + host). */
async function seedLiveDemo(
  pool,
  { label = 'business-joomla', host = 'demo', tag = TAG, platform = 'joomla' } = {}
) {
  await pool.query(
    `insert into site (site_key, label, host, platform, publish, address, demo, quickstart_tag, quickstart_version)
     values ($1, $2, $3, $6, 'published', $4, true, $5, '1.0.0')`,
    [`${label}.tracy.test`, label, host, `https://${label}.tracy.test/`, tag, platform]
  )
}

const LAYOUTS = [
  { key: 'home', path: '/' },
  { key: 'services', path: '/services' }
]

/** The shot list a real tracy-host would return for a body: one per layout × the two viewports. */
const shotsFor = (body) =>
  body.layouts.flatMap((l) => [
    { key: l.key, width: 1440, ok: true, png: PNG(`${l.key}-1440`) },
    { key: l.key, width: 390, ok: true, png: PNG(`${l.key}-390`) }
  ])

test('capture shoots the tag’s live demo and stores every picture under the shared name', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  await seedLiveDemo(pool)
  const host = fakeHost(shotsFor)
  const { send, cookieFor, config } = harness(pool, host)
  const cookie = await cookieFor('owner@tracy.test')

  const res = await send(
    'POST',
    `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)

  // The demo host was asked, with the demo's own label and the release's platform.
  assert.equal(host.calls.length, 1)
  assert.equal(host.calls[0].hostName, 'demo')
  assert.equal(host.calls[0].path, '/capture')
  assert.equal(host.calls[0].body.label, 'business-joomla')
  assert.equal(host.calls[0].body.platform, 'joomla')

  // Four pictures, each named `<template>-<release>-<key>-<width>.png` and handed back as an
  // absolute URL. The release part is the tag's last segment (`j6`), so another CMS of the same
  // template never lands on these names.
  assert.equal(body.stored.length, 4)
  const files = body.stored.map((s) => s.file).sort()
  assert.deepEqual(files, [
    'tracy-business-j6-home-1440.png',
    'tracy-business-j6-home-390.png',
    'tracy-business-j6-services-1440.png',
    'tracy-business-j6-services-390.png'
  ])
  for (const s of body.stored) {
    assert.ok(s.url.startsWith(`${config.origin}/api/templates/${TEMPLATE}/shots/`), s.url)
    assert.ok(s.url.endsWith(s.file))
  }
  // The bytes really landed in the store, under that name.
  const held = await getShot(pool, TEMPLATE, 'tracy-business-j6-home-1440.png')
  assert.ok(held)
  assert.equal(held.bytes.toString(), 'png-home-1440')
})

test(
  'two CMSes of one template shoot the same page key into two pictures, and an older card keeps its own',
  opts,
  async () => {
    // 12/10/2026: tracy-business wp7 and emdash both stored `tracy-business-home-1440.png`, so the
    // EmDash card's Home showed the WordPress page, and an agent had to invent keys (wp-services,
    // emdash-about) to keep the two apart.
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    await seedRelease(pool)
    await seedRelease(pool, { tag: 'tracy-business/emdash-0.x', platform: 'emdash' })
    await seedLiveDemo(pool)
    await seedLiveDemo(pool, {
      label: 'business-emdash',
      tag: 'tracy-business/emdash-0.x',
      platform: 'emdash'
    })
    // A card published before this change names the old shared picture; that row must survive.
    await pool.query(
      `insert into template_shots (template_id, file, content_type, bytes, sha256, updated_at)
     values ($1, 'tracy-business-home-1440.png', 'image/png', $2, 'old', now())`,
      [TEMPLATE, Buffer.from('png-old-home')]
    )
    const shootAs = (who) =>
      fakeHost((b) =>
        b.layouts.map((l) => ({ key: l.key, width: 1440, ok: true, png: PNG(`${who}-${l.key}`) }))
      )
    const press = async (tag, host) => {
      const { send, cookieFor } = harness(pool, host)
      const res = await send(
        'POST',
        `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(tag)}`,
        await cookieFor('owner@tracy.test'),
        { layouts: [{ key: 'home', path: '/' }] }
      )
      assert.equal(res.status, 200)
      return (await res.json()).stored.map((s) => s.file)
    }
    const joomla = await press(TAG, shootAs('joomla'))
    const emdash = await press('tracy-business/emdash-0.x', shootAs('emdash'))
    assert.deepEqual(joomla, ['tracy-business-j6-home-1440.png'])
    assert.deepEqual(emdash, ['tracy-business-emdash-0-x-home-1440.png'])
    assert.equal((await getShot(pool, TEMPLATE, joomla[0])).bytes.toString(), 'png-joomla-home')
    assert.equal((await getShot(pool, TEMPLATE, emdash[0])).bytes.toString(), 'png-emdash-home')
    assert.equal(
      (await getShot(pool, TEMPLATE, 'tracy-business-home-1440.png')).bytes.toString(),
      'png-old-home',
      'a picture an existing card names is never overwritten by a new capture'
    )
  }
)

test('a per-picture failure from the host is reported, and the rest are still stored', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  await seedLiveDemo(pool)
  const host = fakeHost((b) =>
    b.layouts.flatMap((l) =>
      l.key === 'services'
        ? [
            {
              key: 'services',
              width: 1440,
              ok: false,
              error: 'navigation timed out',
              ms: 30000,
              timings: { goto: 30000 }
            },
            { key: 'services', width: 390, ok: false, error: 'navigation timed out' }
          ]
        : [
            { key: l.key, width: 1440, ok: true, png: PNG('h1440') },
            { key: l.key, width: 390, ok: true, png: PNG('h390') }
          ]
    )
  )
  const { send, cookieFor } = harness(pool, host)
  const cookie = await cookieFor('owner@tracy.test')
  const res = await send(
    'POST',
    `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.stored.length, 2)
  assert.equal(body.failed.length, 2)
  assert.match(body.failed[0].error, /timed out/)
  // The host's own account of where the time went reaches the screen with the failure.
  assert.equal(body.failed[0].ms, 30000)
  assert.deepEqual(body.failed[0].timings, { goto: 30000 })
})

test('capture refuses in words when this server has no live demo of the tag', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  // No live demo seeded.
  const host = fakeHost(shotsFor)
  const { send, cookieFor } = harness(pool, host)
  const cookie = await cookieFor('owner@tracy.test')
  const res = await send(
    'POST',
    `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'NO_DEMO')
  assert.equal(host.calls.length, 0, 'the browser is never asked when there is nothing to shoot')
})

test('capture refuses when the demo host is not one this server can reach', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  await seedLiveDemo(pool, { host: 'a-host-not-in-config' })
  const host = fakeHost(shotsFor)
  const { send, cookieFor } = harness(pool, host)
  const cookie = await cookieFor('owner@tracy.test')
  const res = await send(
    'POST',
    `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error, 'NO_DEMO_HOST')
})

test('capture refuses a template id that is not the tag’s', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  await seedLiveDemo(pool)
  const { send, cookieFor } = harness(pool, fakeHost(shotsFor))
  const cookie = await cookieFor('owner@tracy.test')
  const res = await send(
    'POST',
    `/api/ops/templates/not-this-template/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'TEMPLATE_MISMATCH')
})

test('an editor may read the ops page but not press capture', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'editor@tracy.test', 'editor')
  await seedRelease(pool)
  await seedLiveDemo(pool)
  const { send, cookieFor } = harness(pool, fakeHost(shotsFor))
  const cookie = await cookieFor('editor@tracy.test')
  const res = await send(
    'POST',
    `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`,
    cookie,
    {
      layouts: LAYOUTS
    }
  )
  assert.equal(res.status, 403)
})

test('capture tells the host the store’s own ceiling, so a heavy page is shot smaller', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool)
  await seedLiveDemo(pool)
  const host = fakeHost(shotsFor)
  const { send, cookieFor } = harness(pool, host)
  const cookie = await cookieFor('owner@tracy.test')

  await send('POST', `/api/ops/templates/${TEMPLATE}/capture?tag=${encodeURIComponent(TAG)}`, cookie, {
    layouts: LAYOUTS
  })

  // 🔒 The number is the store's, sent rather than restated: tracy-host's image cannot import
  // `template-shots.js`, so the only way the two cannot drift is for the owner of the rule to
  // say it on every call. Without it a page that obeys the height clip can still come back over
  // the limit and be dropped — measured 25/09 on ja-resort, two of six desktop shots lost (#344).
  assert.equal(host.calls[0].body.maxBytes, MAX_PICTURE_BYTES)
})
