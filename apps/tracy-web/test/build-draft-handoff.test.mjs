// The hand off of a done build to the new site's chat (#611, `build-draft/build-route.js` and `build-draft/handoff.js`):
// once the build is done, the build chat asks `POST /api/build-draft/build/handoff` with the conversation as it was
// said; the door opens a chat on the site ahead of time (the Website Opportunities hand off's mechanism,
// `lib/site-session-ahead.js`, faked here), queues ONE first message carrying the conversation and the approved plan,
// and answers the address the screen moves to. A build that stopped or was cancelled moves nothing. The site chat and
// the step chain record are fakes; the draft, the build and its gates are the real ones. Every value is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-handoff.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { handoffOfText } from '../../../packages/core/tracy-core/src/build-chat/index.mjs'
import { buildApp } from '../src/app.js'
import { draftSiteChat } from '../src/build-draft-build-wiring.js'
import { readBuild } from '../src/build-draft/build-store.js'
import { createDraft, putComposed } from '../src/build-draft/store.js'
import { ensureAccount, grantSite } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
const SITE = 'larkfen.localhost'
const SESSION = 'session-7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const CONVERSATION = [
  { role: 'user', text: 'Build a website for my racquet club. https://larkfen-racquets.example/' },
  { role: 'assistant', text: 'I found 3 services. Here is the plan.' },
  { role: 'user', text: 'Approved' }
]
const STEPS = ['doors', 'kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order', 'write']
const line = (step, outcome = 'done') => ({ step, attempt: 1, outcome })

/** The site chat the door opens ahead of time and prompts, as `siteSessionAhead` and `promptSiteSession` would. */
function fakeSiteChat({ openFails = false, promptFails = false } = {}) {
  const opened = []
  const prompted = []
  return {
    opened,
    prompted,
    openSiteChat: async ({ siteKey, email }) => {
      opened.push({ siteKey, email })
      return openFails ? null : SESSION
    },
    promptSiteChat: async (input) => {
      prompted.push(input)
      return !promptFails
    }
  }
}

function server({ chat = fakeSiteChat(), runs = new Map() } = {}) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: {
      buildChatOn: async () => true,
      startSite: async ({ build }) => ({
        site: { siteKey: SITE, label: 'larkfen', jobId: `job-${build.id}` }
      }),
      readRun: async (siteKey) => runs.get(siteKey) ?? { brief: null, job: null },
      prunePictures: async () => {},
      openSiteChat: chat.openSiteChat,
      promptSiteChat: chat.promptSiteChat
    }
  })
  async function call(method, path, body) {
    const headers = {
      'x-tracy-actor': actor(OWNER),
      'x-tracy-session': await buildSessionIdFor(OWNER, config.sessionSecret)
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${config.origin}/api/build-draft${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
    return { status: res.status, body: await res.json() }
  }
  return { app, call, chat, runs }
}

/** A draft with the invented club's plan, approved: its build has its site. */
async function approvedBuild(s) {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const composed = await composePlan({
    blockStore: club.blockStore(),
    pageRecipes: club.pageRecipes(),
    library: club.library(),
    template: club.template(),
    brand: club.brand(),
    profile: club.clubProfile(),
    planId: 'plan-club',
    model: club.scriptedModel(JSON.stringify(club.goodComposition()))
  })
  const research = {
    links: ['https://larkfen-racquets.example/'],
    trade: 'fitness',
    profile: club.clubProfile()
  }
  assert.equal((await putComposed(db.pool, id, composed, { research })).error, undefined)
  const approved = await s.call('POST', '/build', {
    plan: { id: composed.plan.id, revision: composed.plan.revision }
  })
  assert.equal(approved.body.build.siteKey, SITE)
  return { accountId: id, plan: composed.plan }
}

/** The run as the step chain records it: every step done, or stopped at `stopAt`. */
function endRun(s, { stopAt = null } = {}) {
  const steps = stopAt === null ? STEPS.map((st) => line(st)) : [line('doors'), line(stopAt, 'failed')]
  s.runs.set(SITE, {
    brief: {
      state: stopAt === null ? 'applied' : 'failed',
      timings: {
        chain: {
          ending: stopAt === null ? 'complete' : 'stopped',
          steps,
          ...(stopAt === null ? {} : { stop: { step: stopAt, attempts: 2, code: 'X', error: 'invented' } })
        }
      }
    },
    job: null
  })
}

test(
  'a done build opens a chat on the site, carries the whole conversation and the approved plan, and answers where to move',
  opts,
  async () => {
    const s = server()
    const { accountId, plan } = await approvedBuild(s)
    endRun(s)
    assert.equal((await s.call('GET', '/build')).body.build.state, 'done')

    const moved = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
    assert.equal(moved.status, 200)
    // The site's own workspace, on the chat made ahead, with the Browser tab opened on the live site.
    assert.equal(moved.body.next, `/${SITE}/s/${SESSION}?open=browser&page=%2F`)
    assert.deepEqual(s.chat.opened, [{ siteKey: SITE, email: OWNER }])

    // One first message, as the owner, holding every earlier message and the plan the build ran.
    assert.equal(s.chat.prompted.length, 1)
    const [sent] = s.chat.prompted
    assert.equal(sent.siteKey, SITE)
    assert.equal(sent.sessionId, SESSION)
    assert.equal(sent.email, OWNER)
    const carried = handoffOfText(sent.text)
    assert.deepEqual(carried.conversation, CONVERSATION)
    assert.equal(carried.plan.id, plan.id)
    assert.equal(carried.plan.revision, plan.revision)
    assert.deepEqual(carried.plan.pages, plan.pages)
    assert.equal(carried.site.siteKey, SITE)
    // The agent is told what the block is: context, nothing to change yet.
    assert.match(sent.text, /built from this conversation/i)
    assert.equal(DASHES.test(sent.text), false)

    // Kept on the build: the build door answers where the chat went, and a second ask sends nothing again.
    const build = await readBuild(db.pool, accountId)
    assert.equal(build.handoff.sessionId, SESSION)
    assert.ok(build.handoff.promptedAt)
    assert.equal((await s.call('GET', '/build')).body.build.next, moved.body.next)
    const again = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
    assert.equal(again.status, 200)
    assert.equal(again.body.next, moved.body.next)
    assert.equal(s.chat.opened.length, 1)
    assert.equal(s.chat.prompted.length, 1)
  }
)

test('a stopped build, or one still running, moves nothing', opts, async () => {
  const s = server()
  await approvedBuild(s)
  const running = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
  assert.equal(running.status, 409)
  assert.equal(running.body.code, 'BUILD_NOT_DONE')
  endRun(s, { stopAt: 'pictures' })
  assert.equal((await s.call('GET', '/build')).body.build.state, 'stopped')
  const stopped = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
  assert.equal(stopped.status, 409)
  assert.equal(stopped.body.code, 'BUILD_NOT_DONE')
  assert.equal(DASHES.test(JSON.stringify(stopped.body)), false)
  assert.deepEqual(s.chat.opened, [])
  assert.deepEqual(s.chat.prompted, [])
})

test('no build, or a conversation that is not one, is refused', opts, async () => {
  const s = server()
  const none = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
  assert.equal(none.status, 409)
  await approvedBuild(s)
  endRun(s)
  await s.call('GET', '/build')
  for (const conversation of [
    null,
    'hello',
    [{ role: 'system', text: 'x' }],
    [{ role: 'user', text: 'x'.repeat(40_001) }]
  ]) {
    const bad = await s.call('POST', '/build/handoff', { conversation })
    assert.equal(bad.status, 400, JSON.stringify(conversation)?.slice(0, 40))
    assert.equal(bad.body.code, 'INVALID_REQUEST')
  }
  assert.deepEqual(s.chat.opened, [])
})

test(
  'a chat that could not be opened or prompted is asked again on the next try, in the same chat',
  opts,
  async () => {
    const closed = server({ chat: fakeSiteChat({ openFails: true }) })
    await approvedBuild(closed)
    endRun(closed)
    await closed.call('GET', '/build')
    const failed = await closed.call('POST', '/build/handoff', { conversation: CONVERSATION })
    assert.equal(failed.status, 503)
    assert.equal(failed.body.code, 'HANDOFF_SESSION_FAILED')

    // The chat opened but did not take the message: the next try prompts the same chat, opens no second one.
    const chat = fakeSiteChat({ promptFails: true })
    const s = server({ chat, runs: closed.runs })
    const refused = await s.call('POST', '/build/handoff', { conversation: CONVERSATION })
    assert.equal(refused.status, 503)
    assert.equal(refused.body.code, 'HANDOFF_PROMPT_FAILED')
    const retry = server({ chat: fakeSiteChat(), runs: closed.runs })
    const moved = await retry.call('POST', '/build/handoff', { conversation: CONVERSATION })
    assert.equal(moved.status, 200)
    assert.deepEqual(retry.chat.opened, [], 'the chat made before is used again')
    assert.equal(retry.chat.prompted[0].sessionId, SESSION)
    // The same request id both times: dsh holds one accepted message per request id.
    assert.equal(retry.chat.prompted[0].requestId, chat.prompted[0].requestId)
  }
)

test(
  'the real site chat doors open a chat only for the site owner, on a seat minted for that owner',
  opts,
  async () => {
    const { id } = await ensureAccount(db.pool, OWNER)
    const stranger = await ensureAccount(db.pool, 'someone@elsewhere.example')
    await db.pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
      SITE,
      'larkfen',
      'local',
      'joomla'
    ])
    await grantSite(db.pool, { siteKey: SITE, accountId: id, role: 'owner', grantedBy: id, activate: true })
    const minted = []
    // No token: the mechanism fails open with no chat, as it does for the Website Opportunities hand off.
    const seatDoor = { mintSeatSession: async ({ grant }) => (minted.push(grant), null) }
    const chat = draftSiteChat({ pool: db.pool, config, seatDoor, fetchImpl: async () => new Response('{}') })
    assert.equal(await chat.openSiteChat({ siteKey: SITE, email: 'someone@elsewhere.example' }), null)
    assert.equal(minted.length, 0, 'no seat for someone who does not own the site')
    assert.equal(stranger.id === id, false)
    assert.equal(await chat.openSiteChat({ siteKey: SITE, email: OWNER }), null)
    assert.equal(minted.length, 1)
    assert.equal(minted[0].role, 'owner')
    assert.equal(minted[0].email, OWNER)
    assert.equal(
      await chat.promptSiteChat({
        siteKey: SITE,
        email: 'someone@elsewhere.example',
        sessionId: SESSION,
        requestId: 'r',
        text: 'x'
      }),
      false
    )
  }
)
