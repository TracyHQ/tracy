// A fresh start of the build chat (`build-draft/fresh-start.js`, migration 223): the rule for a build stopped for good,
// what refuses a start over, the generation in the session ID, and `/new/build` with its start over page. No database:
// the route's account reads are injected; `build-draft-start-over.test.mjs` runs the same against Postgres. Invented
// addresses only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { START_OVER_SAY, startOverRefusal, stoppedForGood } from '../src/build-draft/fresh-start.js'
import { SAY } from '../src/build-draft/engine-state.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { buildChatRoutes } from '../src/workspace/build-chat-route.js'
import { BUILD_CHAT_PATH, buildSessionIdFor } from '../src/workspace/build-chat-session.js'

const SECRET = 'test-session-secret-0123456789abcdef'
const config = { sessionSecret: SECRET, onboardingHome: '/desk-home/onboarding' }
const OWNER = 'owner@juniper-pottery.test'
const signedIn = async (email = OWNER) => ({
  cookie: `${SESSION_COOKIE}=${await mintSession(email, SECRET)}`
})

const site = { siteKey: 'juniper-pottery', label: 'juniper-pottery' }
const ended = '2026-11-16T10:00:00.000Z'

test('the generation is part of the derived ID; generation 0 is the ID every account had before', async () => {
  const before = await buildSessionIdFor(OWNER, SECRET)
  assert.equal(await buildSessionIdFor(OWNER, SECRET, 0), before)
  const next = await buildSessionIdFor(OWNER, SECRET, 1)
  assert.notEqual(next, before)
  assert.notEqual(await buildSessionIdFor(OWNER, SECRET, 2), next)
  assert.match(next, /^session-build-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('stopped for good: a refused build with no site, or a team fault whose re-run is spent', () => {
  const teamFault = { engine: { step: 'research', state: 'stopped', say: SAY.research } }
  assert.equal(stoppedForGood(teamFault), true)
  assert.equal(stoppedForGood({ build: { refusal: { code: 'SITE_SOURCE_MISSING' }, site: null } }), true)
  for (const [why, row] of [
    ['no draft', null],
    ['in progress', { engine: { step: 'compose', state: 'done' } }],
    ['a step running', { engine: { step: 'research', state: 'running' } }],
    ['a re-run offered', { engine: { state: 'stopped', say: SAY.interrupted, rerun: true } }],
    ['an owner cancel', { engine: { state: 'stopped', reason: 'cancelled' } }],
    ['a refused change', { engine: { state: 'stopped', say: SAY.revise, reason: 'revise-failed' } }],
    ['a link asked for', { engine: { state: 'stopped', say: SAY.links } }],
    ['a build running', { build: { site: null, endedAt: null } }],
    ['a site built', { build: { site, endedAt: ended, result: 'done' } }],
    ['a site whose build stopped', { build: { site, endedAt: ended, result: 'stopped' } }]
  ])
    assert.equal(stoppedForGood(row), false, why)
})

test('a start over is refused while a build runs, once a site is built, and while a step works', () => {
  assert.equal(startOverRefusal({ build: { site: null, endedAt: null } }), 'BUILD_RUNNING')
  assert.equal(startOverRefusal({ build: { site, endedAt: null } }), 'BUILD_RUNNING')
  assert.equal(startOverRefusal({ build: { site, endedAt: ended, result: 'done' } }), 'SITE_BUILT')
  assert.equal(startOverRefusal({ engine: { state: 'running' } }), 'ENGINE_BUSY')
  assert.equal(startOverRefusal({ engine: { state: 'done' } }), null)
  assert.equal(startOverRefusal({ build: { refusal: { code: 'X' }, site: null } }), null)
  assert.equal(startOverRefusal(null), null)
  assert.match(START_OVER_SAY.SITE_BUILT, /second site is not available yet/)
  for (const sentence of Object.values(START_OVER_SAY)) assert.doesNotMatch(sentence, /[\u2013\u2014]/)
})

/** The route with an account held in memory: `stopped` says whether its build stopped for good. */
function harness({ stopped = false, refuse = null } = {}) {
  const account = { generation: 0, stopped, asked: 0 }
  const allocated = []
  const app = buildChatRoutes({
    config,
    hiddenSwitches: async () => [],
    allocate: async (payload) => {
      allocated.push(payload.nativeSession.sessionId)
      return { sessionId: payload.nativeSession.sessionId, workspaceId: 'ws-personal' }
    },
    generationOf: async () => account.generation,
    freshIfStopped: async () => {
      if (!account.stopped) return false
      account.generation += 1
      account.stopped = false
      return true
    },
    fresh: {
      confirmSay: START_OVER_SAY.confirm,
      startOver: async () => {
        account.asked += 1
        if (refuse) return { error: refuse, say: START_OVER_SAY[refuse] }
        account.generation += 1
        return { generation: account.generation }
      }
    }
  })
  return { app, account, allocated }
}

const open = async (app, path = BUILD_CHAT_PATH) =>
  (await app.request(path, { headers: await signedIn() })).headers.get('location')

test('a build in progress opens the same conversation every time', async () => {
  const { app } = harness()
  const id = await buildSessionIdFor(OWNER, SECRET)
  assert.equal(await open(app), `/new/s/${id}`)
  assert.equal(await open(app), `/new/s/${id}`)
})

test('a build stopped for good opens a new conversation, and stays on it after', async () => {
  const { app } = harness({ stopped: true })
  const next = await buildSessionIdFor(OWNER, SECRET, 1)
  assert.equal(await open(app), `/new/s/${next}`)
  assert.equal(await open(app), `/new/s/${next}`)
})

test('the ID never comes from the request', async () => {
  const { app, allocated } = harness()
  const id = await buildSessionIdFor(OWNER, SECRET)
  const forged = 'session-build-00000000-0000-4000-8000-000000000000'
  assert.equal(await open(app, `${BUILD_CHAT_PATH}?session=${forged}&generation=7`), `/new/s/${id}`)
  assert.deepEqual(allocated, [id])
})

test('start over asks first in plain words, then opens a new conversation', async () => {
  const { app, account } = harness()
  const page = await app.request(`${BUILD_CHAT_PATH}/start-over`, { headers: await signedIn() })
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes(START_OVER_SAY.confirm))
  assert.ok(html.includes('method="post" action="/new/build/start-over"'))
  assert.equal(account.asked, 0, 'reading the question starts nothing over')
  const posted = await app.request(`${BUILD_CHAT_PATH}/start-over`, {
    method: 'POST',
    headers: await signedIn()
  })
  assert.equal(posted.status, 303)
  assert.equal(posted.headers.get('location'), BUILD_CHAT_PATH)
  assert.equal(await open(app), `/new/s/${await buildSessionIdFor(OWNER, SECRET, 1)}`)
})

test('a refused start over says why and keeps the conversation', async () => {
  const { app } = harness({ refuse: 'SITE_BUILT' })
  const posted = await app.request(`${BUILD_CHAT_PATH}/start-over`, {
    method: 'POST',
    headers: await signedIn()
  })
  assert.equal(posted.status, 409)
  assert.ok((await posted.text()).includes(START_OVER_SAY.SITE_BUILT))
  assert.equal(await open(app), `/new/s/${await buildSessionIdFor(OWNER, SECRET)}`)
})

test('start over needs a signed-in person', async () => {
  const { app, account } = harness()
  const posted = await app.request(`${BUILD_CHAT_PATH}/start-over`, { method: 'POST' })
  assert.equal(posted.status, 303)
  assert.match(posted.headers.get('location'), /^\/login/)
  assert.equal(account.asked, 0)
})
