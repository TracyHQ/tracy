// The creation workspace's build chat (TracyHQ/tracy#602): `/new/build` opens the account's own build
// session, allocated through the signed seat door with the build agent and the creation seat only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildChatRoutes } from '../src/workspace/build-chat-route.js'
import {
  BUILD_AGENT_PRESET,
  BUILD_CHAT_PATH,
  BUILD_CHAT_SWITCH,
  buildSessionIdFor
} from '../src/workspace/build-chat-session.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { onboardingGrant } from '../src/workspace/scope.js'

const SECRET = 'test-session-secret-0123456789abcdef'
const config = { sessionSecret: SECRET, onboardingHome: '/desk-home/onboarding' }
const DOOR_ID = /^session-build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const signedIn = async (email) => ({ cookie: `${SESSION_COOKIE}=${await mintSession(email, SECRET)}` })

/** The app under test with a fake door; `hidden` is what the operator switched off. */
function harness({ hidden = [], answer } = {}) {
  const calls = []
  const app = buildChatRoutes({
    config,
    hiddenSwitches: async () => hidden,
    allocate: async (payload) => {
      calls.push(payload)
      return answer
        ? answer(payload)
        : { sessionId: payload.nativeSession.sessionId, workspaceId: 'ws-personal' }
    }
  })
  return { app, calls }
}

test('one stable build session per account, in the only shape the seat door mints for the build chat', async () => {
  const first = await buildSessionIdFor('Owner@Example.test', SECRET)
  assert.match(first, DOOR_ID)
  assert.equal(await buildSessionIdFor('owner@example.test', SECRET), first, 'the address is one account')
  assert.notEqual(await buildSessionIdFor('other@example.test', SECRET), first)
  assert.notEqual(await buildSessionIdFor('owner@example.test', `${SECRET}-other`), first)
})

test('a signed-in account opens its build chat: the door is asked for the creation seat and the build agent only', async () => {
  const { app, calls } = harness()
  const email = 'new-owner@example.test'
  const res = await app.request(BUILD_CHAT_PATH, { headers: await signedIn(email) })
  assert.equal(res.status, 302)
  const id = await buildSessionIdFor(email, SECRET)
  assert.equal(res.headers.get('location'), `/new/s/${id}`)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(calls, [
    { ...onboardingGrant(email, config), nativeSession: { sessionId: id, agentPreset: BUILD_AGENT_PRESET } }
  ])
  assert.deepEqual(calls[0].toolsets, ['content'], 'no toolset beyond the creation seat')
  assert.deepEqual(calls[0].folders, [], 'no site folder')
})

test('opening it again lands in the same conversation', async () => {
  const { app, calls } = harness()
  const headers = await signedIn('again@example.test')
  const a = await app.request(BUILD_CHAT_PATH, { headers })
  const b = await app.request(BUILD_CHAT_PATH, { headers })
  assert.equal(a.headers.get('location'), b.headers.get('location'))
  assert.equal(calls[0].nativeSession.sessionId, calls[1].nativeSession.sessionId)
})

test('signed out, the door sends the person to sign in and back here', async () => {
  const { app, calls } = harness()
  const res = await app.request(BUILD_CHAT_PATH)
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(BUILD_CHAT_PATH)}`)
  assert.equal(calls.length, 0)
})

test('switched off by the operator, or refused by the door, the person lands where they did before', async () => {
  const off = harness({ hidden: [BUILD_CHAT_SWITCH] })
  const res = await off.app.request(BUILD_CHAT_PATH, { headers: await signedIn('off@example.test') })
  assert.equal(res.headers.get('location'), '/new/')
  assert.equal(off.calls.length, 0, 'nothing is allocated while the switch is off')
  for (const answer of [
    () => null,
    () => ({ sessionId: 'session-build-other', workspaceId: 'ws' }),
    () => {
      throw new Error('door down')
    }
  ]) {
    const refused = harness({ answer })
    const r = await refused.app.request(BUILD_CHAT_PATH, { headers: await signedIn('refused@example.test') })
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), '/new/')
  }
})

test('the build chat door is a navigation only: no other method opens a session', async () => {
  const { app, calls } = harness()
  const res = await app.request(BUILD_CHAT_PATH, {
    method: 'POST',
    headers: await signedIn('post@example.test')
  })
  assert.equal(res.status, 404)
  assert.equal(calls.length, 0)
})
