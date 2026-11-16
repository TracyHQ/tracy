// A fresh start of the build chat against Postgres (`build-draft/fresh-start.js`, migration 223), through the app's
// own doors: start over discards the draft (research, answers, plan, pictures and their stored objects) and moves the
// account to a new build session; a build running or a site built refuses it; `/new/build`'s move of a build stopped
// for good. Invented business and data only.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const OWNER = 'owner@juniper-pottery.test'
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** The stored objects the picture rows name; a start over must delete them. */
let deleted = []
const objects = { get: async () => null, delete: async (key) => (deleted.push(key), true) }
const newApp = () =>
  buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: { loadKit: () => null, skipped: [], templatesFor: () => [] },
    buildEngine: { pictureDoors: { objects } }
  })

async function call(method, path, body, session) {
  const headers = {
    'sec-fetch-site': 'same-origin',
    cookie: `tracy_sess=${await mintSession(OWNER, config.sessionSecret)}`
  }
  if (session) headers['x-tracy-session'] = session
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await newApp().fetch(
    new Request(`${config.origin}/api/build-draft${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  )
  return { status: res.status, body: await res.json() }
}

const accountId = async () =>
  (await db.pool.query('select id from account where email = $1', [OWNER])).rows[0].id

/** A draft the old conversation shaped: research, an answer, a plan, an engine state and one stored picture. */
async function shapedDraft({ build = null, engine = { step: 'compose', state: 'done' } } = {}) {
  const made = await call('POST', '')
  assert.equal(made.status, 201)
  const id = await accountId()
  await db.pool.query(
    `update build_draft set research = $2, answers = $3, plan = $4, engine = $5, build = $6 where account_id = $1`,
    [
      id,
      JSON.stringify({ schema: 'invented-research/v1', pictureRun: '11111111-1111-4111-8111-111111111111' }),
      JSON.stringify([{ question: 'site-name', value: 'Juniper Pottery' }]),
      JSON.stringify({ id: 'plan-juniper', revision: 1, pages: [] }),
      JSON.stringify(engine),
      build === null ? null : JSON.stringify(build)
    ]
  )
  await db.pool.query(
    `insert into build_draft_picture (account_id, research_run, kind, source, source_url, sha256, object_key, mime, bytes)
     values ($1, '11111111-1111-4111-8111-111111111111', 'image', 'site', 'https://juniper-pottery.test/kiln.jpg',
             'abc123', 'build-drafts/juniper/abc123.jpg', 'image/jpeg', 10)`,
    [id]
  )
  return made.body.draft.id
}

const pictureCount = async () =>
  Number((await db.pool.query('select count(*) from build_draft_picture')).rows[0].count)

test('start over discards everything the old draft held and moves to a new build session', opts, async () => {
  deleted = []
  const oldDraft = await shapedDraft()
  const oldSession = await buildSessionIdFor(OWNER, config.sessionSecret)
  assert.equal((await call('POST', '/start-over', {})).status, 400, 'the owner must have confirmed')
  const started = await call('POST', '/start-over', { confirm: true })
  assert.equal(started.status, 200)
  assert.equal(started.body.open, '/new/build')
  assert.equal((await call('GET', '')).body.draft, null)
  assert.equal(await pictureCount(), 0)
  assert.deepEqual(deleted, ['build-drafts/juniper/abc123.jpg'])

  const fresh = await call('POST', '')
  assert.equal(fresh.status, 201)
  assert.notEqual(fresh.body.draft.id, oldDraft)
  assert.deepEqual(fresh.body.draft.answers, [])
  assert.equal(fresh.body.draft.plan, null)

  // The new conversation is the account's build session now; the old one can no longer touch the draft.
  const newSession = await buildSessionIdFor(OWNER, config.sessionSecret, 1)
  assert.notEqual(newSession, oldSession)
  assert.equal((await call('GET', '', undefined, oldSession)).status, 403)
  assert.equal((await call('GET', '', undefined, newSession)).status, 200)
  assert.equal(await newApp().buildChatFresh.generationOf(OWNER), 1)
})

test('a site built from the draft keeps it: start over is refused with a plain sentence', opts, async () => {
  const draft = await shapedDraft({
    build: { id: 'b1', site: { siteKey: 'juniper' }, endedAt: '2026-11-16T10:00:00Z', result: 'done' }
  })
  const refused = await call('POST', '/start-over', { confirm: true })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'SITE_BUILT')
  assert.match(refused.body.say, /second site is not available yet/)
  assert.equal((await call('GET', '')).body.draft.id, draft)
  assert.equal(await pictureCount(), 1)
  assert.equal(await newApp().buildChatFresh.generationOf(OWNER), 0)
  assert.equal(
    await newApp().buildChatFresh.freshIfStopped(OWNER),
    false,
    'a built site is never stopped for good'
  )
})

test('a build running is never discarded', opts, async () => {
  await shapedDraft({ build: { id: 'b1', site: null, refusal: null, endedAt: null } })
  const refused = await call('POST', '/start-over', { confirm: true })
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'BUILD_RUNNING')
  assert.equal(await pictureCount(), 1)
})

test(
  '/new/build moves a build stopped for good to a new generation, and leaves one in progress',
  opts,
  async () => {
    await shapedDraft()
    const app = newApp()
    assert.equal(await app.buildChatFresh.freshIfStopped(OWNER), false)
    assert.equal(await app.buildChatFresh.generationOf(OWNER), 0)
    await db.pool.query(`update build_draft set engine = $1`, [
      JSON.stringify({
        step: 'research',
        state: 'stopped',
        say: 'Something went wrong on our side, so I stopped here.',
        endedAt: '2026-11-16T10:00:00Z'
      })
    ])
    assert.equal(await app.buildChatFresh.freshIfStopped(OWNER), true)
    assert.equal(await app.buildChatFresh.generationOf(OWNER), 1)
    assert.equal((await call('GET', '')).body.draft, null)
    assert.equal(await pictureCount(), 0)
  }
)

test(
  'the start over page form passes the same-origin guard and opens the next generation',
  opts,
  async () => {
    await shapedDraft()
    const res = await newApp().fetch(
      new Request(`${config.origin}/new/build/start-over`, {
        method: 'POST',
        headers: {
          origin: config.origin,
          cookie: `tracy_sess=${await mintSession(OWNER, config.sessionSecret)}`,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': '0'
        }
      })
    )
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/new/build')
    assert.equal(await newApp().buildChatFresh.generationOf(OWNER), 1)
    assert.equal(await pictureCount(), 0)
  }
)
