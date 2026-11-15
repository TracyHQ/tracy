// Whether a file a revision uploaded is still on the site, read three valued (#599): only a 404 or 410 of the public
// read says absent, a 200 present, and anything else (another status, a redirect, a network error, no reader) is
// unread, so the restore or the abandon keeps the file (`presence_unread`, `delete_unknown` after a failed delete) and
// never counts it gone. Through `app.js` (the `presence` door the draft site wiring gives) and through the media delete
// (`step-chain-draft-media-delete.js`). Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-media-presence.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteDoors } from 'website-opportunities/domain/site-doors.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { deleteUpload } from '../src/step-chain-draft-media-delete.js'
import { siteDoorsFor } from '../src/step-chain-draft-site.js'

const SITE = 'site-larkspur-1'
const PATH = 'images/tracy/posy-invented.jpg'
const ENV = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const ROW = {
  site_key: SITE,
  label: 'larkspur',
  address: 'http://larkspur-florist.example/',
  host: 'elsewhere'
}

/** The draft doors of `app.js` over a site whose public read answers `answer()` (a Response, or a throw). */
async function appDoors(answer) {
  const app = buildApp({
    config: readConfig(ENV),
    pool: { query: async () => ({ rows: [ROW] }) },
    host: {},
    mail: { send: async () => {} },
    fetchImpl: async () => answer()
  })
  return app.draftSiteDoorsFor({ siteKey: SITE, email: 'owner@larkspur-florist.example', runId: 'restore-1' })
}

test('app.js reads presence three valued: 200 present, 404 and 410 absent, anything else unread', async () => {
  const cases = [
    [() => new Response('x', { status: 200 }), 'present'],
    [() => new Response('', { status: 404 }), 'absent'],
    [() => new Response('', { status: 410 }), 'absent'],
    [() => new Response('', { status: 503 }), 'unread'],
    [() => new Response('', { status: 403 }), 'unread'],
    [() => new Response('', { status: 301, headers: { location: '/elsewhere' } }), 'unread'],
    [
      () => {
        throw new TypeError('network down')
      },
      'unread'
    ]
  ]
  for (const [answer, want] of cases)
    assert.equal(await (await appDoors(answer)).presence({ path: PATH }), want)
})

test('app.js with no such site reads presence unread', async () => {
  const app = buildApp({
    config: readConfig(ENV),
    pool: { query: async () => ({ rows: [] }) },
    host: {},
    mail: { send: async () => {} }
  })
  const doors = await app.draftSiteDoorsFor({
    siteKey: SITE,
    email: 'owner@larkspur-florist.example',
    runId: 'r-1'
  })
  assert.equal(await doors.presence({ path: PATH }), 'unread')
})

/** The real door client over an invented plugin holding the file, with `filePresence` answering `presence`. */
async function restoreDoors(presence, { deleteFails = false } = {}) {
  const calls = []
  const apply = () => async (call) => {
    const { operation, payload } = { operation: call.action, payload: call.params }
    calls.push(`${operation}${payload?.dry_run ? ':dry' : ''}`)
    if (operation === 'media.delete' && !payload.dry_run && deleteFails)
      return { ok: false, code: 'write_failed', message: 'write_failed' }
    if (operation === 'media.delete') return payload.dry_run ? { ok: true, usedIn: [] } : { ok: true }
    return { ok: true }
  }
  const site = {
    siteDoors,
    publicFile: async () => new Uint8Array([1, 2, 3]),
    ...(presence === undefined ? {} : { filePresence: async () => presence() })
  }
  const doors = await siteDoorsFor({ site, applyFor: apply })({
    siteKey: SITE,
    email: 'owner@larkspur-florist.example',
    runId: 'restore-1'
  })
  return { doors, calls }
}

test('a file whose presence is unread is kept, never counted deleted, and no delete is sent', async () => {
  for (const presence of [
    () => 'unread',
    () => 'maybe',
    undefined,
    () => {
      throw new Error('read failed')
    }
  ]) {
    const { doors } = await restoreDoors(presence)
    const left = []
    await deleteUpload({ path: PATH, mine: [] }, doors, 'restore-1:media', left)
    assert.deepEqual(
      left.map((l) => l.why),
      ['presence_unread']
    )
  }
})

test('a file read absent is done; read present it goes through the dry run and the delete', async () => {
  const absent = await restoreDoors(() => 'absent')
  const leftAbsent = []
  await deleteUpload({ path: PATH, mine: [] }, absent.doors, 'restore-1:media', leftAbsent)
  assert.deepEqual(leftAbsent, [])
  assert.equal(
    absent.calls.some((c) => c.startsWith('media.delete')),
    false
  )
  const present = await restoreDoors(() => 'present')
  const leftPresent = []
  await deleteUpload({ path: PATH, mine: [] }, present.doors, 'restore-1:media', leftPresent)
  assert.deepEqual([leftPresent, present.calls], [[], ['media.delete:dry', 'media.delete']])
})

test('a failed delete read unread after is kept as delete_unknown', async () => {
  let reads = 0
  const { doors } = await restoreDoors(() => (reads++ === 0 ? 'present' : 'unread'), { deleteFails: true })
  const left = []
  await deleteUpload({ path: PATH, mine: [] }, doors, 'restore-1:media', left)
  assert.deepEqual(
    left.map((l) => l.why),
    ['delete_unknown']
  )
})
