/**
 * The turn's open off the step's critical path (harness profile 09/10/2026, candidate 1): the model's
 * first step no longer waits for `POST /turn` — the host's seal of what was dirty before the turn —
 * and the first call that may WRITE the site waits for it instead. A later turn still waits at the
 * step, because only its open can name turns the person undid (`openMayNameUndone`).
 *
 *   node --test packages/site/tracy-site-tabs/test/turn-open-hold.test.mjs
 *
 * Three parts: the pure readings (`callMayWriteSite`, `openMayNameUndone`), the turn book with a fake
 * `send` (what the doors hear and when), and the built `lib/index.js` with `fetch` swapped for a turn
 * door the test answers when it chooses — the bundle the fleet image copies.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  createTurnBook,
  MOMENT_HOLD_MS,
  momentsPendingOf,
  openMayNameUndone
} from '../src/host/turn-record.mjs'
import { callChangedSite, callMayWriteSite } from '../src/host/turn.mjs'

/** A message the password gate stamped as typed by Ada. */
const said = (text) => ({
  id: `msg-${text.length}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user', prompter: { user: 'Ada', email: 'ada@example.com' }, rpcId: 'rpc-1' }
})

/** A promise the test resolves itself. */
function deferred() {
  /** @type {(value?: any) => void} */
  let resolve = () => {}
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Whether `promise` is still pending after the event loop has had a turn. */
async function pending(promise) {
  const marker = Symbol('pending')
  const first = await Promise.race([promise, new Promise((r) => setTimeout(() => r(marker), 20))])
  return first === marker
}

// ── the pure readings ─────────────────────────────────────────────────────────────────────────────

// 🔒 `dryRun` is a look only for `content.replace`, the one action that reads it. Every other action
// is relayed with every key it carries and writes anyway; before the fix any action with `dryRun: true`
// (in params or at the top level) ran beside the seal.
const DRY_RUNS = [
  ['content.replace', { find: 'a', replace: 'b', dryRun: true }, undefined, false],
  ['content.replace', { find: 'a', replace: 'b' }, true, false],
  ['content.replace', { find: 'a', replace: 'b', dry_run: true }, undefined, false],
  ['content.replace', { find: 'a', replace: 'b', dryRun: false }, undefined, true],
  ['theme.activate', { stylesheet: 'x', dryRun: true }, undefined, true],
  ['extension.enable', { element: 'x' }, true, true],
  ['theme.style', { css: 'a{}', dryRun: true }, undefined, true],
  ['media.draw', { prompt: 'a cat', dryRun: true }, undefined, true],
  ['db.rollback', { id: 's1', dryRun: true }, undefined, true],
  ['template.siteSettings', { operation: 'set', dryRun: true }, undefined, true],
  ['content.update', { id: 1, dryRun: true }, true, true]
]
test('callMayWriteSite and callChangedSite: a dryRun is a look only for content.replace', () => {
  for (const [action, params, topLevel, writes] of DRY_RUNS) {
    const call = {
      name: 'tracy_site',
      arguments: { action, params, ...(topLevel === undefined ? {} : { dryRun: topLevel }) }
    }
    const label = `${action} ${JSON.stringify(call.arguments)}`
    assert.equal(callMayWriteSite(call), writes, `may write: ${label}`)
    assert.equal(callChangedSite(call), writes, `changed: ${label}`)
  }
})

test('callMayWriteSite and callChangedSite: the set-only doors write on set, or on new values sent with no operation (J-5)', () => {
  const cases = [
    ['site.identity', { operation: 'read' }, false],
    ['site.identity', {}, false],
    ['site.identity', { fields: ['sitename'] }, false],
    ['site.identity', { operation: 'set', fields: { sitename: 'Kapsalon' } }, true],
    // normalize turns new values with no operation into a set: counted as one before the seal
    ['site.identity', { fields: { sitename: 'Kapsalon' } }, true],
    ['template.siteSettings', { operation: 'read' }, false],
    ['template.siteSettings', { operation: 'set', values: { logo: 'x.png' } }, true],
    ['template.languageOverrides', { locale: 'nl-NL', offset: 0, limit: 200 }, false],
    ['template.languageOverrides', { operation: 'set', locale: 'nl-NL', strings: { A: 'b' } }, true],
    // an operation the component does not know is refused there; counted as a write, the safe side
    ['template.siteSettings', { operation: 'write' }, true]
  ]
  for (const [action, params, writes] of cases) {
    const call = { name: 'tracy_site', arguments: { action, params } }
    assert.equal(callMayWriteSite(call), writes, `may write: ${action} ${JSON.stringify(params)}`)
    assert.equal(callChangedSite(call), writes, `changed: ${action} ${JSON.stringify(params)}`)
  }
})

test('callMayWriteSite: only what cannot write runs beside the seal; everything else waits', () => {
  const cases = [
    // [call, may write]
    [{ name: 'read', arguments: { file_path: '/site/a/.webroot/index.php' } }, false],
    [{ name: 'read_image', arguments: {} }, false],
    [{ name: 'glob', arguments: { pattern: '**/*.css' } }, false],
    [{ name: 'grep', arguments: { pattern: 'Welcome' } }, false],
    [{ name: 'skill', arguments: { name: 'emdash-site' } }, false],
    [{ name: 'todo_write', arguments: {} }, false],
    [{ name: 'ask_user_question', arguments: {} }, false],
    [{ name: 'web_fetch', arguments: { url: 'https://example.com' } }, false],
    [{ name: 'job_output', arguments: {} }, false],
    [{ name: 'tracy_site_profile', arguments: {} }, false],
    [{ name: 'tracy_find_definition', arguments: {} }, false],
    [{ name: 'tracy_site', arguments: { action: 'content.read', params: {} } }, false],
    [{ name: 'tracy_site', arguments: { action: 'page.text', params: { path: '/' } } }, false],
    [{ name: 'tracy_site', arguments: { action: 'page.look', params: { path: '/' } } }, false],
    [{ name: 'tracy_site', arguments: { action: 'content.replace', params: { dryRun: true } } }, false],
    [{ name: 'tracy_site', arguments: { action: 'content.contract', params: {} } }, false],
    [{ name: 'tracy_emdash', arguments: { tool: 'content_get', arguments: {} } }, false],
    [{ name: 'tracy_emdash', arguments: { list: true } }, false],
    // Writes, and everything the reading cannot vouch for.
    [{ name: 'bash', arguments: { command: 'ls' } }, true],
    [{ name: 'pwsh', arguments: { command: 'dir' } }, true],
    [{ name: 'write', arguments: { file_path: '/site/a/.webroot/style.css', content: 'a{}' } }, true],
    [{ name: 'write', arguments: { file_path: '/site/a/TracyWork/plan.md', content: 'x' } }, true],
    [{ name: 'edit', arguments: { file_path: 'wp-content/themes/x/style.css' } }, true],
    [
      { name: 'tracy_site', arguments: { action: 'content.replace', params: { find: 'a', replace: 'b' } } },
      true
    ],
    [{ name: 'tracy_site', arguments: { action: 'content.update', params: {} } }, true],
    [{ name: 'tracy_site', arguments: { action: 'look.set', params: {} } }, true],
    [{ name: 'tracy_site', arguments: { action: 'db.snapshot', params: {} } }, true],
    [{ name: 'tracy_site', arguments: { action: 'content.contract', params: { operation: 'apply' } } }, true],
    [{ name: 'tracy_site', arguments: { action: 'some.new.verb', params: {} } }, true],
    [{ name: 'tracy_emdash', arguments: { tool: 'content_update', arguments: {} } }, true],
    [{ name: 'tracy_site_build_wordpress', arguments: {} }, true],
    [{ name: 'tracy_brand', arguments: {} }, true],
    [{ name: 'job_kill', arguments: {} }, true],
    [{ name: 'run_code', arguments: {} }, true],
    [{ name: '', arguments: {} }, true],
    [undefined, true]
  ]
  for (const [call, expected] of cases) {
    assert.equal(callMayWriteSite(call), expected, JSON.stringify(call))
  }
})

test('openMayNameUndone: a conversation’s first turn has no older turn to undo; any later turn may', () => {
  for (const [turn, expected] of [
    [1, false],
    [2, true],
    [4, true],
    [undefined, true],
    [Number.NaN, true],
    ['2', true]
  ]) {
    assert.equal(openMayNameUndone(turn), expected, String(turn))
  }
})

// ── the turn book ─────────────────────────────────────────────────────────────────────────────────

/** A `send` whose `turn` door answers only when the test says, recording each call as it is sent. */
function heldDoor() {
  const sent = []
  const opens = []
  const send = async (door, body) => {
    sent.push({ door, steered: body.steered === true })
    if (door !== 'turn' || body.steered === true) return { ok: true, status: 200, body: { ok: true } }
    const gate = deferred()
    opens.push(gate)
    return gate.promise
  }
  return { sent, opens, send }
}

test('🔒 the first write waits for the open; once it is answered, writes go at once', async () => {
  const { send, opens } = heldDoor()
  const book = createTurnBook({ send, warn: () => {}, info: () => {} })
  const entered = book.enter({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  assert.equal(entered.opens, true)
  const write = book.writeReady({ sessionId: 's-1' })
  assert.equal(await pending(write), true, 'the write is held while the seal runs')
  // Another conversation's writes are not held by this one's open.
  assert.equal(await book.writeReady({ sessionId: 's-other' }), false)
  opens[0].resolve({ ok: true, status: 200, body: { ok: true, undone: [] } })
  assert.equal(await write, true)
  assert.equal(await book.writeReady({ sessionId: 's-1' }), false, 'a settled open holds nothing')
})

test('🔒 an open with no answer in time lets the held write go at its budget, and says it was not opened', async () => {
  const warned = []
  const book = createTurnBook({
    send: () => new Promise(() => {}),
    timeoutMs: 60,
    warn: (line) => warned.push(line),
    info: () => {}
  })
  const entered = book.enter({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  const started = Date.now()
  assert.equal(await book.writeReady({ sessionId: 's-1' }), true)
  const waited = Date.now() - started
  assert.ok(waited >= 40 && waited < 1_000, `${waited} ms`)
  assert.deepEqual(await entered.undone, [])
  assert.match(warned.join('\n'), /turn s-1:1: not opened \(no answer within 60 ms\)/)
})

test('a held write lets go when its call is cancelled', async () => {
  const { send, opens } = heldDoor()
  const book = createTurnBook({ send, warn: () => {}, info: () => {} })
  book.enter({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  const controller = new AbortController()
  const write = book.writeReady({ sessionId: 's-1', signal: controller.signal })
  assert.equal(await pending(write), true)
  controller.abort()
  assert.equal(await write, true)
  assert.equal(await book.writeReady({ sessionId: 's-1', signal: controller.signal }), false)
  opens[0].resolve({ ok: true, status: 200, body: { ok: true } })
})

test('🔒 the doors still hear open → steer → close: a steer and a stop wait for an open in flight', async () => {
  const { send, sent, opens } = heldDoor()
  const book = createTurnBook({ send, warn: () => {}, info: () => {} })
  book.enter({ sessionId: 's-1', turn: 1, messages: [said('Make it red')], cwd: '/site/x' })
  const steer = book.enter({ sessionId: 's-1', turn: 1, messages: [said('and bold')], cwd: '/site/x' })
  assert.equal(steer.opens, false)
  const stop = book.turnStopping({ sessionId: 's-1', turn: 1, events: [] })
  assert.equal(await pending(stop), true)
  assert.deepEqual(sent, [{ door: 'turn', steered: false }], 'nothing goes before the open is answered')
  opens[0].resolve({ ok: true, status: 200, body: { ok: true } })
  await stop
  assert.deepEqual(await steer.undone, [])
  assert.deepEqual(sent, [
    { door: 'turn', steered: false },
    { door: 'turn', steered: true },
    { door: 'moment', steered: false }
  ])
})

// ── option A (David 10/10/2026): the first write waits for an earlier turn's moment ──────────────────
// The stand, 09/10 (uiweekwp): turn 1's `/moment` answered 202 and its moment ended on the host 20 s
// after turn 2 opened — any edit turn 2 made in between would have been committed under turn 1's name.

/**
 * A `send` for a conversation whose turn 1 the host is still committing: the open of turn 2 names it
 * (`momentsPending`), and `moment/wait` answers `ended` only once the test says the moment ended.
 */
function momentDoor({ pending = ['s-1:1'], endedAtOnce = false } = {}) {
  const sent = []
  let ended = endedAtOnce
  const send = async (door, body) => {
    sent.push({ door, body, at: Date.now() })
    if (door === 'turn')
      return { ok: true, status: 200, body: { ok: true, undone: [], momentsPending: pending } }
    if (door === 'moment/wait') {
      if (body.release === true)
        return { ok: true, status: 200, body: { ok: true, ended: false, released: true } }
      // The door itself waits a little before saying "not yet", as tracy-web's does (up to 10 s).
      if (!ended) await new Promise((resolve) => setTimeout(resolve, 5))
      return { ok: true, status: 200, body: { ok: true, ended } }
    }
    return { ok: true, status: 200, body: { ok: true } }
  }
  return { sent, send, end: () => (ended = true) }
}

test('momentsPendingOf: only this conversation’s turn ids, each once; anything else is dropped', () => {
  assert.deepEqual(
    momentsPendingOf({ momentsPending: ['s-1:1', 's-1:1', 's-2:4', 's-1:x', 7, 's-1:2'] }, 's-1'),
    ['s-1:1', 's-1:2']
  )
  assert.deepEqual(momentsPendingOf({}, 's-1'), [])
  assert.deepEqual(momentsPendingOf(null, 's-1'), [])
  assert.equal(MOMENT_HOLD_MS, 120_000, "the host's own wait for the site's lock")
})

test("🔒 option A: the next turn's first write waits until tracy-web says the earlier moment ended — the model's step does not", async () => {
  const door = momentDoor()
  const book = createTurnBook({ send: door.send, warn: () => {}, info: () => {}, askAgainMs: 5 })
  const entered = book.enter({ sessionId: 's-1', turn: 2, messages: [said('Make it blue')], cwd: '/site/x' })
  // The step's own wait (the open's `undone`) is answered as soon as the open is: no hold in it.
  assert.deepEqual(await entered.undone, [])
  assert.equal(
    door.sent.find((s) => s.door === 'turn')?.body.waitsForMoments,
    true,
    'the open says this dsh holds'
  )
  const write = book.writeReady({ sessionId: 's-1' })
  assert.equal(await pending(write), true, 'the write is held while turn 1 is still being committed')
  assert.ok(door.sent.some((s) => s.door === 'moment/wait' && s.body.turnId === 's-1:1'))
  const endedAt = Date.now()
  door.end()
  assert.equal(await write, true)
  assert.ok(Date.now() >= endedAt, 'let go only after the moment ended')
  assert.equal(door.sent.filter((s) => s.body.release === true).length, 0, 'nothing to mark')
  // Held once: the writes after it go at once.
  const started = performance.now()
  assert.equal(await book.writeReady({ sessionId: 's-1' }), false)
  assert.ok(performance.now() - started < 5)
})

test('option A: no added wait at all when no earlier moment is still committing, or when it ended before the write', async () => {
  // The common case: turn 1's moment ended inside its door's wait, so the open names none.
  const quiet = momentDoor({ pending: [] })
  const book = createTurnBook({ send: quiet.send, warn: () => {}, info: () => {} })
  await book.enter({ sessionId: 's-1', turn: 2, messages: [said('Fix it')], cwd: '/site/x' }).undone
  await new Promise((resolve) => setImmediate(resolve))
  let started = performance.now()
  assert.equal(await book.writeReady({ sessionId: 's-1' }), false, 'nothing held')
  const none = performance.now() - started
  assert.ok(none < 5, `${none.toFixed(2)} ms`)
  assert.equal(quiet.sent.filter((s) => s.door === 'moment/wait').length, 0, 'tracy-web not even asked')

  // Named, but ended by the time the model's first write comes: the background ask already settled it.
  const done = momentDoor({ endedAtOnce: true })
  const book2 = createTurnBook({ send: done.send, warn: () => {}, info: () => {} })
  await book2.enter({ sessionId: 's-1', turn: 2, messages: [said('Fix it')], cwd: '/site/x' }).undone
  await new Promise((resolve) => setTimeout(resolve, 20))
  started = performance.now()
  assert.equal(await book2.writeReady({ sessionId: 's-1' }), false)
  const after = performance.now() - started
  assert.ok(after < 5, `${after.toFixed(2)} ms`)
})

test('option A: at the bound the write goes, and tracy-web is told first so the turns can be marked', async () => {
  const warned = []
  const door = momentDoor()
  const book = createTurnBook({
    send: door.send,
    warn: (line) => warned.push(line),
    info: () => {},
    momentHoldMs: 60,
    askAgainMs: 5
  })
  await book.enter({ sessionId: 's-1', turn: 2, messages: [said('Fix it')], cwd: '/site/x' }).undone
  const started = Date.now()
  assert.equal(await book.writeReady({ sessionId: 's-1' }), true)
  const waited = Date.now() - started
  assert.ok(waited >= 40 && waited < 2_000, `${waited} ms`)
  const releases = door.sent.filter((s) => s.door === 'moment/wait' && s.body.release === true)
  assert.deepEqual(
    releases.map((s) => s.body.turnId),
    ['s-1:1']
  )
  assert.ok(releases[0].at <= Date.now())
  assert.match(warned.join('\n'), /turn s-1:2: writes before turn s-1:1's moment ended \(60 ms\)/)
  // Told once; the next write does not wait or tell again.
  assert.equal(await book.writeReady({ sessionId: 's-1' }), false)
  assert.equal(door.sent.filter((s) => s.body.release === true).length, 1)
})

test('option A: a held write lets go when its call is cancelled; reads never come here', async () => {
  const door = momentDoor()
  const book = createTurnBook({ send: door.send, warn: () => {}, info: () => {}, askAgainMs: 5 })
  await book.enter({ sessionId: 's-1', turn: 2, messages: [said('Fix it')], cwd: '/site/x' }).undone
  const controller = new AbortController()
  const write = book.writeReady({ sessionId: 's-1', signal: controller.signal })
  assert.equal(await pending(write), true)
  controller.abort()
  assert.equal(await write, true)
  door.end()
})

// ── the built plugin on the host's one dsh ────────────────────────────────────────────────────────

const GATEWAY_ENV = ['MCP_TRACY_SITE_KEY', 'MCP_TRACY_ORIGIN', 'DSH_PASSWORDS_ENV_FILE', 'TRACY_SITES_ROOT']

/**
 * The built plugin on a host dsh standing in a `lantern` site folder; every turn door call waits for
 * the test (`answer(body)`). Answers the agent's two hooks — `step(turn)` runs one pre-step claiming
 * the person's message, `call(name, args)` runs one `tools/pre-execute` — and the doors still open.
 */
async function hostPlugin(instance) {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-hold-'))
  mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
  writeFileSync(
    path.join(root, 'lantern', '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'lantern.tracy.ai', platform: 'wordpress' })
  )
  const saved = {
    fetch: globalThis.fetch,
    warn: console.warn,
    info: console.info,
    env: Object.fromEntries(GATEWAY_ENV.map((name) => [name, process.env[name]]))
  }
  const doors = []
  globalThis.fetch = async (url) => {
    const gate = deferred()
    doors.push({ url: String(url), answer: (body) => gate.resolve(new Response(JSON.stringify(body))) })
    return gate.promise
  }
  for (const name of GATEWAY_ENV) delete process.env[name]
  Object.assign(process.env, {
    MCP_TRACY_SITE_KEY: '',
    MCP_TRACY_ORIGIN: 'https://cowork.tracy.ai',
    TRACY_SITES_ROOT: root
  })
  console.warn = () => {}
  console.info = () => {}
  const restore = () => {
    globalThis.fetch = saved.fetch
    console.warn = saved.warn
    console.info = saved.info
    for (const [name, value] of Object.entries(saved.env)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
  const mod = await import(new URL(`../lib/index.js?${instance}`, import.meta.url).href)
  const handlers = {}
  const agent = {
    ctx: {
      on: (event, handler) => {
        handlers[event] = handler
        return () => {}
      }
    },
    session: { id: 'session-h1', header: { cwd: path.join(root, 'lantern') }, snapshotEvents: () => [] }
  }
  mod.apply({
    webServer: { register: () => () => {} },
    agents: { roots: () => [agent] },
    on: () => () => {},
    effect: (setup) => {
      setup()
    },
    get: (name) => (name === 'tracyAssertion' ? { mint: (email) => `signed:${email}` } : undefined)
  })
  const person = said('Change the heading')
  const step = (turn) =>
    handlers['agent/pre-step']({ turn, step: 1, messages: [person] }, async () => ({
      kind: 'enter',
      messages: [person]
    }))
  const call = (name, args = {}) =>
    handlers['tools/pre-execute']({ name, arguments: args }, async () => ({ kind: 'allow' }))
  /** The turn door's next call, once the plugin has sent it. */
  const nextDoor = async () => {
    for (let i = 0; i < 100 && doors.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
    return doors.shift()
  }
  return { person, step, call, nextDoor, restore }
}

test('🔒 step 1 of a conversation is not held by a slow open; a read runs beside the seal, the first write waits for it', async () => {
  const h = await hostPlugin('first-turn')
  try {
    const decision = await h.step(1)
    // The step went in while the door had not answered — and exactly as it came.
    assert.equal(decision.kind, 'enter')
    assert.deepEqual(decision.messages, [h.person])
    const door = await h.nextDoor()
    assert.equal(door.url, 'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn')
    assert.deepEqual(await h.call('tracy_site', { action: 'page.text', params: { path: '/' } }), {
      kind: 'allow'
    })
    assert.deepEqual(await h.call('read', { file_path: 'index.php' }), { kind: 'allow' })
    const write = h.call('tracy_site', { action: 'content.replace', params: { find: 'a', replace: 'b' } })
    const shell = h.call('bash', { command: 'wp cache flush' })
    assert.equal(await pending(write), true, 'the write waits for the seal')
    assert.equal(await pending(shell), true, 'so does a shell')
    // A first turn has nothing undone by construction; even an answer naming some is not said.
    door.answer({ ok: true, undone: [{ turn: 0, title: 'x', complete: true }] })
    assert.deepEqual(await write, { kind: 'allow' })
    assert.deepEqual(await shell, { kind: 'allow' })
  } finally {
    h.restore()
  }
})

// #1403 item 10: the chat showed only "Thinking for…" while the first write waited for the seal.
test('a write waiting for the previous request to be saved is marked as that wait, and unmarked when it goes', async () => {
  const { waitOf } = await import('../../../core/tracy-core/src/chat-wait/index.mjs')
  const h = await hostPlugin('wait-line')
  try {
    await h.step(1)
    const door = await h.nextDoor()
    const write = h.call('tracy_site', { action: 'content.replace', params: { find: 'a', replace: 'b' } })
    assert.equal(await pending(write), true)
    assert.equal(waitOf('session-h1')?.kind, 'previous')
    door.answer({ ok: true, undone: [] })
    await write
    assert.equal(waitOf('session-h1'), null)
  } finally {
    h.restore()
  }
})

test('🔒 a later turn still waits at the step for its open, and carries the undone notice as before', async () => {
  const h = await hostPlugin('later-turn')
  try {
    const stepping = h.step(2)
    const door = await h.nextDoor()
    assert.equal(await pending(stepping), true, 'the step waits: only the open can name undone turns')
    door.answer({ ok: true, undone: [{ turn: 1, title: 'Make the heading say Welcome', complete: true }] })
    const decision = await stepping
    assert.equal(decision.messages.length, 2)
    assert.equal(decision.messages[0], h.person)
    assert.equal(decision.messages[1].source.producer, 'tracy-site-tabs:turn-undone')
    // The open is answered: the turn's writes go at once.
    assert.deepEqual(await h.call('bash', { command: 'ls' }), { kind: 'allow' })
  } finally {
    h.restore()
  }
})
