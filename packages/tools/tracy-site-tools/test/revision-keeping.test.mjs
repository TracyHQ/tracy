/**
 * What a conversation READ of a site's content stays true across the calls that do not change it.
 *
 * Round 7 (bench v7, 29/09/2026): 12 of the 24 picture-replacement runs paid one call for INSPECT_FIRST —
 * "this conversation had read none" — although the model had read the page a step earlier. Three causes,
 * one test group each: (a) a `media.upload` between the read and the apply counted as a write and made
 * every read stale; (b) a `content.read {fields}` that showed slot keys but no `revision` taught the host
 * nothing to base the apply on; (c) an apply REFUSED before it wrote anything dropped the revisions it was
 * sent on. Each keeps its guard: a real write between the read and the apply still forces INSPECT_FIRST,
 * and a refusal that says the base is stale (or may have written) still forgets the read.
 * Fixtures are neutral: a shop's home page with a heading and a hero picture.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { normalizeCall } from '../src/host/normalize.mjs'
import { planCall } from '../src/host/site.mjs'
import { LIBRARY_ACTIONS, makesReadsStale, refusedUnwritten, runSiteCall } from '../src/host/site-call.mjs'

/** A bound WordPress site's content.read of its home page, as the relay answers it. */
const HOME_READ = (revision = 'rev-home-1') => ({
  schemaVersion: 'tracy-content/v1',
  protocol: {
    selected: 'tracy-content/v1',
    relayExtensions: [],
    cowork: { kind: 'wordpress', capability: 'v1' }
  },
  site: { id: 'site-shop', url: 'http://shop.test:8080', defaultLocale: 'en-US', locales: ['en-US'] },
  contents: [
    {
      id: 'content_home',
      revision,
      type: 'page',
      blocks: [
        {
          fields: [
            { key: 'hero.heading', type: 'text', value: 'Welcome', slotKey: 'home.hero.heading' },
            {
              key: 'hero.img',
              type: 'image',
              value: '/wp-content/uploads/hero.png',
              slotKey: 'home.hero.img'
            }
          ],
          items: []
        }
      ]
    }
  ]
})
const HOME_INSPECT = {
  ok: true,
  contract: 'shop/wp7/1.0.0',
  revision: 'rev-site-1',
  slots: { 'home.hero.heading': 'Welcome', 'home.hero.img': 'wp-content/uploads/hero.png' },
  entities: [{ key: 'page-home', kind: 'page' }]
}
const APPLIED = {
  ok: true,
  written: [{ kind: 'post', id: 42 }],
  contentRevisions: { content_home: 'rev-home-2' }
}

/**
 * A fake relay that answers a read like the relay does — a projection that does not name `revision`
 * comes back without it — and records every call.
 * @param {(action: string, params: Record<string, any>) => unknown} [answer] - for everything but a read and an inspect.
 */
function shop(answer = () => APPLIED) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const memory = createCallMemory({ now: () => 1_000 })
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.read') {
      const read = HOME_READ()
      const asked = params.fields === undefined ? null : String(params.fields).split(',')
      if (asked !== null && !asked.includes('revision'))
        delete (/** @type {any} */ (read.contents[0]).revision)
      return read
    }
    if (params.operation === 'inspect') return HOME_INSPECT
    return answer(action, params)
  }
  /** @param {unknown} args */
  const call = async (args) => {
    const plan = planCall(args)
    assert.ok(plan.ok, JSON.stringify(plan))
    return /** @type {Promise<any>} */ (
      runSiteCall({
        plan,
        send,
        memory,
        sessionId: 'session-shop',
        label: 'shop-1',
        actorKey: 'ana@example.com',
        facts: { platform: 'wordpress', sealed: true, contractDoor: true },
        sleep: async () => {}
      })
    )
  }
  const applies = () => sent.filter(([, p]) => p.operation === 'apply').map(([, p]) => p)
  return { sent, memory, call, applies }
}

const readHome = { action: 'content.read', params: { id: 'content_home' } }
const applyHeading = (text = 'Welcome back') => ({
  action: 'content.contract',
  params: { operation: 'apply', changes: { 'home.hero.heading': text } }
})
const upload = {
  action: 'media.upload',
  params: { path: 'wp-content/uploads/tracy-content/a.png', content_b64: 'iVBORw0KGgo=', apply_id: 'media-a' }
}

// ── (a) a media library change leaves content revisions alone ───────────────────────────────────────

test('makesReadsStale: reads and library uploads leave what was read standing; every other write ends it', () => {
  assert.deepEqual([...LIBRARY_ACTIONS], ['media.upload', 'media.delete'])
  for (const action of ['content.read', 'content.get', 'content.locate', 'media.upload', 'media.delete'])
    assert.equal(makesReadsStale(action, {}), false, action)
  for (const action of ['content.update', 'content.delete', 'content.batch', 'apply.revert', 'db.snapshot'])
    assert.equal(makesReadsStale(action, {}), true, action)
  assert.equal(makesReadsStale('content.contract', { operation: 'inspect' }), false)
  assert.equal(makesReadsStale('content.contract', { operation: 'apply' }), true)
})

test('🔒 read → media.upload → apply: the apply is based on the read, and no inspect is sent', async () => {
  const { call, applies, sent, memory } = shop()
  await call(readHome)
  const before = memory.generationOf('shop-1')
  const uploaded = await call(upload)
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded))
  assert.equal(memory.generationOf('shop-1'), before, 'an upload is not a change of any content')
  const out = await call(applyHeading())
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(applies()[0].expected_content_revisions, { content_home: 'rev-home-1' })
  assert.ok(!sent.some(([, p]) => p.operation === 'inspect'))
})

test('🔒 …but a content write between the read and the apply still forces INSPECT_FIRST', async () => {
  const { call, applies } = shop()
  await call(readHome)
  await call(upload)
  const written = await call({
    action: 'content.update',
    params: { kind: 'option', key: 'blogname', fields: { value: 'Shop' } }
  })
  assert.notEqual(written.code, 'INSPECT_FIRST')
  const out = await call(applyHeading())
  assert.equal(out.code, 'INSPECT_FIRST', 'the read is older than a write: it is read again first')
  assert.equal(applies().length, 0, 'nothing was written over values nobody here has seen')
})

// ── (b) a projection that shows slot keys carries the revision ─────────────────────────────────────

test('normalizeCall: a `fields` projection that shows slot keys also asks for the content’s revision', () => {
  /** @param {unknown} fields */
  const asked = (fields) =>
    /** @type {any} */ (
      normalizeCall(
        'content.read',
        { id: 'content_home', fields },
        { platform: 'wordpress', contractDoor: true }
      )
    ).params.fields
  // The projection the describe document's own next teaches, and its array form.
  assert.equal(
    asked('title,blocks.fields.value,blocks.fields.slotKey'),
    'title,blocks.fields.value,blocks.fields.slotKey,revision'
  )
  assert.deepEqual(asked(['title', 'blocks.fields.slotKey']), ['title', 'blocks.fields.slotKey', 'revision'])
  assert.equal(asked('blocks'), 'blocks,revision')
  assert.equal(asked('fields.slotKey'), 'fields.slotKey,revision')
  // Left as asked: it names the revision already, or shows nothing of the slots.
  assert.equal(asked('title,revision,blocks.fields.slotKey'), 'title,revision,blocks.fields.slotKey')
  assert.equal(asked('title,url'), 'title,url')
  // The slot VALUES count as slots shown too (`normalizeFields`, content-read-fields.mjs): an apply after this read is based on it.
  assert.equal(asked('title,blocks.fields.value'), 'title,blocks.fields.value,revision')
  // No projection, no change.
  const whole = /** @type {any} */ (
    normalizeCall('content.read', { id: 'content_home' }, { platform: 'wordpress', contractDoor: true })
  )
  assert.equal(whole.params.fields, undefined)
})

test('🔒 read {fields with slot keys} → apply: based on that read — the revision the relay drops unless asked is asked for', async () => {
  const { call, applies, sent } = shop()
  await call({
    action: 'content.read',
    params: { id: 'content_home', fields: 'title,blocks.fields.value,blocks.fields.slotKey' }
  })
  const out = await call(applyHeading())
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(applies()[0].expected_content_revisions, { content_home: 'rev-home-1' })
  assert.ok(!sent.some(([, p]) => p.operation === 'inspect'))
})

// ── (c) a refusal that wrote nothing keeps what was read ───────────────────────────────────────────

/** @param {string} code @param {string} [slotKey] */
const refusal = (code, slotKey = 'home.hero.heading') => ({
  ok: false,
  error: 'contract_failed',
  message: `${code} message`,
  errors: [
    {
      code,
      message: `${code} message`,
      field: { slotKey, contentId: 'content_home' },
      severity: 'recoverable'
    }
  ]
})

test('refusedUnwritten: the per-slot value rules are proof of no write; a stale base, a lock miss or a broken write are not', () => {
  for (const code of [
    'SLOT_TOO_LONG',
    'SLOT_IMAGE_INVALID',
    'SLOT_NOT_CONTENT',
    'SLOT_UNKNOWN',
    'CHANGES_INVALID'
  ])
    assert.equal(refusedUnwritten(refusal(code)), true, code)
  for (const code of ['REVISION_STALE', 'REVISION_REQUIRED', 'CONTRACT_FAILED', 'WRITER_BUSY', 'CONFLICT'])
    assert.equal(refusedUnwritten(refusal(code)), false, code)
  const mixed = {
    ...refusal('SLOT_TOO_LONG'),
    errors: [...refusal('SLOT_TOO_LONG').errors, ...refusal('REVISION_STALE').errors]
  }
  assert.equal(refusedUnwritten(mixed), false, 'one stale base among them: the read is not to be trusted')
  assert.equal(
    refusedUnwritten({ ok: false, error: 'contract_failed', message: 'x' }),
    false,
    'no errors[]: unproven'
  )
  assert.equal(refusedUnwritten({ ok: true }), false)
  assert.equal(
    refusedUnwritten({ ...refusal('SLOT_TOO_LONG'), httpStatus: 502 }),
    false,
    'a gateway answer: outcome unknown'
  )
})

test('🔒 read → apply refused before it wrote → corrected apply: still based on the read, no INSPECT_FIRST', async () => {
  const { call, applies, sent } = shop((_action, params) =>
    String(params.changes['home.hero.heading']).length > 10 ? refusal('SLOT_TOO_LONG') : APPLIED
  )
  await call(readHome)
  const refused = await call(applyHeading('A heading far too long'))
  assert.equal(refused.ok, false)
  assert.equal(refused.errors[0].code, 'SLOT_TOO_LONG')
  const out = await call(applyHeading('Short one'))
  assert.equal(out.ok, true, JSON.stringify(out))
  const sends = applies()
  assert.equal(sends.length, 2, 'the model’s corrected apply was sent, not answered INSPECT_FIRST')
  assert.deepEqual(sends[1].expected_content_revisions, { content_home: 'rev-home-1' })
  assert.ok(!sent.some(([, p]) => p.operation === 'inspect'))
})

test('🔒 a refusal that says the base is stale, or that may have written, does not keep the read', async () => {
  for (const code of ['REVISION_STALE', 'CONTRACT_FAILED']) {
    const { call, applies } = shop(() => refusal(code))
    await call(readHome)
    await call(applyHeading('one'))
    const again = await call(applyHeading('two'))
    assert.equal(again.code, 'INSPECT_FIRST', code)
    assert.equal(applies().length, 1, code)
  }
})

test('keepContentRevisions: only a revision already held is made current again, and never one the apply typed', () => {
  const memory = createCallMemory({ now: () => 1_000 })
  memory.rememberContentRevisions('s', 'shop-1', HOME_READ('rev-home-1'))
  assert.deepEqual(memory.contentRevisionsFor('s', 'shop-1', ['home.hero.heading']), {
    content_home: 'rev-home-1'
  })
  memory.invalidateSite('shop-1')
  assert.equal(
    memory.contentRevisionsFor('s', 'shop-1', ['home.hero.heading']),
    null,
    'a site change ends the read'
  )
  // A revision the model made up is not the one this conversation read.
  assert.equal(memory.keepContentRevisions('s', 'shop-1', { content_home: 'rev-typed' }), 0)
  assert.equal(memory.contentRevisionsFor('s', 'shop-1', ['home.hero.heading']), null)
  assert.equal(memory.keepContentRevisions('s', 'shop-1', { content_home: 'rev-home-1' }), 2)
  assert.deepEqual(memory.contentRevisionsFor('s', 'shop-1', ['home.hero.heading']), {
    content_home: 'rev-home-1'
  })
  // Another conversation, another site, and a call with no conversation keep nothing.
  assert.equal(memory.keepContentRevisions('other', 'shop-1', { content_home: 'rev-home-1' }), 0)
  assert.equal(memory.keepContentRevisions(undefined, 'shop-1', { content_home: 'rev-home-1' }), 0)
  assert.equal(memory.keepContentRevisions('s', 'shop-1', null), 0)
})

// ── the handler: the real relay path, `relayRaw` included ──────────────────────────────────────────

// `lib/index.js` is what ships and what the handler suite drives; `relayRaw` (index.ts) invalidates around
// every send, so the exemption of a library upload has to hold THERE, not only in `runSiteCall`.
const { apply } = await import('../lib/index.js')

/** A 1200×800 PNG header: all the upload road needs to see. */
const PICTURE = (() => {
  const b = Buffer.alloc(40)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(1200, 16)
  b.writeUInt32BE(800, 20)
  return b
})()

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 the handler: read → media.upload {file} → apply reaches the door on the read’s revisions, with no inspect between', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-keep-'))
  const label = 'wpkeep'
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'wordpress' })
  )
  mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
  writeFileSync(
    path.join(root, '.content-contracts', `${label}.json`),
    JSON.stringify({
      contract: 'tracy-business/wp7/1.2.0',
      platform: 'wordpress',
      coworkContractVersion: '0.14.1'
    })
  )
  writeFileSync(path.join(folder, 'hero.png'), PICTURE)
  process.env.TRACY_SITES_ROOT = root
  /** @type {Array<{ body: any }>} */
  const calls = []
  const fetch = async (/** @type {unknown} */ url, /** @type {any} */ init = {}) => {
    if (!String(url).endsWith('/apply')) return new Response('', { status: 404 })
    const body = JSON.parse(String(init.body))
    calls.push({ body })
    const answer =
      body.action === 'content.read'
        ? HOME_READ()
        : body.action === 'media.upload'
          ? { ok: true, path: body.params.path, bytes: PICTURE.length, created: true, attachment: 7 }
          : body.params?.operation === 'inspect'
            ? HOME_INSPECT
            : APPLIED
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  const tools = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (/** @type {any} */ t) => (tools.set(t.name, t), () => {}) },
      effect: (/** @type {() => void} */ setup) => {
        setup()
      },
      on: () => {},
      get: (/** @type {string} */ name) =>
        name === 'sessions'
          ? {
              get: () => ({
                snapshotEvents: () => [
                  {
                    type: 'user/message',
                    data: {
                      source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
                      content: [{ type: 'text', text: 'use the picture I uploaded' }]
                    }
                  }
                ]
              })
            }
          : name === 'tracyAssertion'
            ? { mint: (/** @type {string} */ email) => `signed:${email}` }
            : undefined
    },
    { origin: 'http://door.test', now: () => new Date('2026-09-30T12:00:00Z'), fetch }
  )
  const run = (/** @type {unknown} */ args) =>
    tools
      .get('tracy_site')
      .execute(args, { agent: { session: { id: 'session-keep', header: { cwd: folder } } } })
  await run(readHome)
  const uploaded = await run({ action: 'media.upload', params: { file: 'hero.png' } })
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded).slice(0, 300))
  const sha = createHash('sha256').update(PICTURE).digest('hex')
  const out = await run({
    action: 'content.contract',
    params: {
      operation: 'apply',
      changes: { 'home.hero.img': `wp-content/uploads/tracy-content/${sha}.png` }
    }
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  const sentApply = calls.filter((c) => c.body.params?.operation === 'apply')
  assert.equal(sentApply.length, 1)
  assert.deepEqual(sentApply[0].body.params.expected_content_revisions, { content_home: 'rev-home-1' })
  assert.ok(!calls.some((c) => c.body.params?.operation === 'inspect'), 'no inspect was needed')
})
