/**
 * The look undo as the SHIPPED plugin wires it (`lib/index.js`): the comment fence's
 * `tools/pre-execute` keeps a copy before it lets a look write run, `tools/post-execute` hands the
 * agent `undo: <id>` in that call's result, and `tracy_site` `look.revert` puts it back — through
 * the same session and site folder, never another site's.
 *
 *   node --test packages/tools/tracy-site-tools/test/look-undo-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { apply } from '../lib/index.js'
import { cssHash, LOOK_UNDO_DIR } from '../src/host/look-undo.mjs'

const message = (kind, content) => ({ type: 'user/message', data: { source: { kind }, content } })
const ELEMENT = {
  url: 'https://capi.test/',
  selector: 'h3',
  label: 'Card',
  text: 'Frame erection',
  marks: []
}
const COMMENT = [message('user', buildCommentTurn({ text: 'Make this heading lighter.', element: ELEMENT }))]
const PLAIN = [message('user', 'Make the card headings lighter.')]

/** The plugin, registered on a context that keeps its tools and its listeners, with one session log. */
function plugin(events) {
  const tools = new Map()
  const listeners = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => (tools.set(t.name, t), () => {}) },
    effect: (setup) => void setup(),
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => (name === 'sessions' ? { get: () => ({ snapshotEvents: () => events }) } : undefined)
  }
  apply(ctx, {})
  return { tools, listeners }
}

/** A sites root holding two sites, each with a theme stylesheet. */
function sites() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-look-wiring-'))
  for (const label of ['capi', 'other']) {
    mkdirSync(path.join(root, label, '.webroot/wp-content/themes/tracy'), { recursive: true })
    writeFileSync(
      path.join(root, label, '.webroot/wp-content/themes/tracy/style.css'),
      `/* ${label} */ h3{font-weight:700}`
    )
  }
  process.env.TRACY_SITES_ROOT = root
  return root
}

const call = (cwd, name, args, callId = 'call-1') => ({
  name,
  arguments: args,
  callId,
  agent: { session: { id: 'session-x', header: { cwd } } }
})

/** Run one call the way dsh does: pre-execute, the tool's own write, post-execute. */
async function run({ listeners }, exec, write) {
  const [pre] = listeners.get('tools/pre-execute')
  const decision = await pre(exec, async () => ({ kind: 'allow' }))
  if (decision.kind !== 'allow') return { decision }
  write()
  const result = { isError: false, content: [{ type: 'text', text: 'edited' }] }
  const [post] = listeners.get('tools/post-execute')
  const after = await post(exec, result, async () => ({ kind: 'accept' }))
  return { decision, content: after.content ?? result.content }
}

const STYLE = '.webroot/wp-content/themes/tracy/style.css'

test('a look write in a comment turn: copied first, `undo: <id>` in its result, look.revert puts it back', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const p = plugin(COMMENT)
  const file = path.join(cwd, STYLE)
  const before = readFileSync(file, 'utf8')
  const { decision, content } = await run(p, call(cwd, 'edit', { file_path: STYLE }), () =>
    writeFileSync(file, 'h3{font-weight:500}')
  )
  assert.equal(decision.kind, 'allow')
  const note = content.map((block) => block.text).join('\n')
  const id = /undo: ([0-9a-f]{6})/.exec(note)?.[1]
  assert.ok(id, note)
  assert.match(note, /look\.revert/)
  assert.ok(existsSync(path.join(cwd, LOOK_UNDO_DIR, id, 'manifest.json')))

  // Undo works outside the comment turn too, and answers what it put back.
  const later = plugin(PLAIN)
  const answer = await later.tools
    .get('tracy_site')
    .execute(
      { action: 'look.revert', params: { undo: id } },
      { agent: { session: { id: 'session-x', header: { cwd } } } }
    )
  assert.equal(answer.ok, true, JSON.stringify(answer))
  assert.deepEqual(answer.restored, [STYLE])
  assert.equal(readFileSync(file, 'utf8'), before)
})

test('no copy for a write the fence refuses, nor for a look write in an ordinary turn', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const refused = await run(
    plugin(COMMENT),
    call(cwd, 'edit', { file_path: '.webroot/wp-content/themes/tracy/functions.php' }),
    () => {}
  )
  assert.equal(refused.decision.kind, 'deny')
  const ordinary = await run(plugin(PLAIN), call(cwd, 'edit', { file_path: STYLE }), () => {})
  assert.equal(ordinary.decision.kind, 'allow')
  assert.doesNotMatch(ordinary.content.map((b) => b.text).join('\n'), /undo:/)
  assert.equal(existsSync(path.join(cwd, LOOK_UNDO_DIR)), false)
})

test('a later listener that refuses the write leaves no undo behind', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const { listeners } = plugin(COMMENT)
  const [pre] = listeners.get('tools/pre-execute')
  const decision = await pre(call(cwd, 'edit', { file_path: STYLE }), async () => ({
    kind: 'deny',
    reason: 'path fence'
  }))
  assert.equal(decision.kind, 'deny')
  const store = path.join(cwd, LOOK_UNDO_DIR)
  assert.equal(existsSync(store) ? readdirSync(store).length : 0, 0)
})

test("look.revert from another site's conversation cannot reach this site's undo", async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const file = path.join(cwd, STYLE)
  const { content } = await run(plugin(COMMENT), call(cwd, 'edit', { file_path: STYLE }), () =>
    writeFileSync(file, 'changed')
  )
  const id = /undo: ([0-9a-f]{6})/.exec(content.map((b) => b.text).join('\n'))?.[1]
  const other = path.join(root, 'other')
  const answer = await plugin(PLAIN)
    .tools.get('tracy_site')
    .execute(
      { action: 'look.revert', params: { undo: id } },
      { agent: { session: { id: 'session-x', header: { cwd: other } } } }
    )
  assert.equal(answer.ok, false)
  assert.equal(answer.code, 'LOOK_UNDO_UNKNOWN')
  assert.equal(readFileSync(file, 'utf8'), 'changed')
})

// ── Stage 6 F2: a look write lights everybody's Refresh button (`site.last_write_at`) ──────────────

/** The plugin as a signed-in lane runs it: the person who typed is known, Tracy's door recorded. */
function signedPlugin(events, extra = {}) {
  const posted = []
  const tools = new Map()
  const listeners = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => (tools.set(t.name, t), () => {}) },
    effect: (setup) => void setup(),
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) =>
      name === 'sessions'
        ? { get: () => ({ snapshotEvents: () => events }) }
        : name === 'tracyAssertion'
          ? { mint: (email) => `signed:${email}` }
          : undefined
  }
  apply(ctx, {
    ...extra,
    origin: 'http://door.test',
    fetch: async (url, init = {}) => {
      if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
      posted.push({ url: String(url), headers: init.headers, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ changedAt: '2026-09-29T12:00:00.000Z' }), { status: 200 })
    }
  })
  return { tools, listeners, posted }
}

/** A message the gate stamped with the person who typed it. */
const typed = (content) => ({
  type: 'user/message',
  data: { source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } }, content }
})
const SIGNED_COMMENT = [typed(buildCommentTurn({ text: 'Make this heading lighter.', element: ELEMENT }))]
const SIGNED_PLAIN = [typed('Make the card headings lighter.')]
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('F2: a look write that ran — comment turn or not — is reported to POST /changed for this site', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const file = path.join(cwd, STYLE)
  for (const [events, callId] of [
    [SIGNED_COMMENT, 'call-c'],
    [SIGNED_PLAIN, 'call-p']
  ]) {
    const p = signedPlugin(events)
    const { decision } = await run(p, call(cwd, 'edit', { file_path: STYLE }, callId), () =>
      writeFileSync(file, 'h3{font-weight:500}')
    )
    assert.equal(decision.kind, 'allow')
    await settle()
    assert.equal(p.posted.length, 1, callId)
    assert.equal(p.posted[0].url, 'http://door.test/api/sites/_conversation/changed')
    assert.equal(p.posted[0].headers['x-tracy-actor'], 'signed:an@example.test')
    assert.equal(p.posted[0].headers['x-tracy-workspace-label'], 'capi')
    assert.equal(p.posted[0].headers['x-tracy-session'], 'session-x')
    assert.deepEqual(p.posted[0].body, { tool: 'edit', via: 'file-look' })
  }
})

test('F2: a refused, failed or non-look write is not reported', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  // The fence refuses a PHP file in a comment turn.
  const refused = signedPlugin(SIGNED_COMMENT)
  await run(
    refused,
    call(cwd, 'edit', { file_path: '.webroot/wp-content/themes/tracy/functions.php' }),
    () => {}
  )
  // A later listener refuses the look write.
  const denied = signedPlugin(SIGNED_PLAIN)
  const [pre] = denied.listeners.get('tools/pre-execute')
  await pre(call(cwd, 'edit', { file_path: STYLE }), async () => ({ kind: 'deny', reason: 'path fence' }))
  // The tool ran and failed.
  const failed = signedPlugin(SIGNED_PLAIN)
  const exec = call(cwd, 'edit', { file_path: STYLE }, 'call-f')
  await failed.listeners.get('tools/pre-execute')[0](exec, async () => ({ kind: 'allow' }))
  await failed.listeners.get('tools/post-execute')[0](exec, { isError: true, content: [] }, async () => ({
    kind: 'accept'
  }))
  // Not a look file at all.
  const other = signedPlugin(SIGNED_PLAIN)
  await run(
    other,
    call(cwd, 'edit', { file_path: '.webroot/wp-content/themes/tracy/functions.php' }),
    () => {}
  )
  await settle()
  for (const [what, p] of [
    ['refused by the fence', refused],
    ['denied later', denied],
    ['failed', failed],
    ['not a look file', other]
  ])
    assert.equal(p.posted.length, 0, what)
})

test('F2: look.revert that put files back is reported; an unknown undo is not', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const file = path.join(cwd, STYLE)
  const { content } = await run(plugin(COMMENT), call(cwd, 'edit', { file_path: STYLE }), () =>
    writeFileSync(file, 'changed')
  )
  const id = /undo: ([0-9a-f]{6})/.exec(content.map((b) => b.text).join('\n'))?.[1]
  const p = signedPlugin(SIGNED_PLAIN)
  const revert = (undo) =>
    p.tools
      .get('tracy_site')
      .execute(
        { action: 'look.revert', params: { undo } },
        { agent: { session: { id: 'session-x', header: { cwd } } } }
      )
  assert.equal((await revert('ffffff')).ok, false)
  await settle()
  assert.equal(p.posted.length, 0, 'nothing put back, nothing reported')
  assert.equal((await revert(id)).ok, true)
  await settle()
  assert.equal(p.posted.length, 1)
  assert.deepEqual(p.posted[0].body, { tool: 'look.revert', via: 'look-revert' })
  assert.equal(p.posted[0].headers['x-tracy-workspace-label'], 'capi')
})

test('turn undo: a WordPress look.revert that put the Additional CSS back is reported as look-css with its undo id, and a second revert of it refuses', async () => {
  const root = sites()
  const cwd = path.join(root, 'capi')
  const id = 'a1b2c3'
  const dir = path.join(cwd, LOOK_UNDO_DIR, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'c0'), '/* before */', 'utf8')
  writeFileSync(path.join(dir, 'c1'), '/* before */\n.x{color:red}', 'utf8')
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      v: 1,
      id,
      at: '2026-10-09T10:00:00.000Z',
      tool: 'look.set',
      files: [],
      customCss: { stylesheet: 'tracy', before: 'c0', after: 'c1' }
    })
  )
  let additional = '/* before */\n.x{color:red}'
  const exec = async ({ argv, stdin }) => {
    assert.equal(argv[4], 'capi-web-1', "this site's own container")
    const q = JSON.parse(String(stdin))
    const answer =
      q.mode === 'write' && q.expect === cssHash(additional)
        ? ((additional = q.css), { ok: true, stylesheet: q.stylesheet, css: additional })
        : { ok: false, conflict: true }
    return {
      code: 0,
      stdout: `TRACY_WP_CSS ${Buffer.from(JSON.stringify(answer)).toString('base64')}\n`,
      stderr: '',
      timedOut: false
    }
  }
  const p = signedPlugin(SIGNED_PLAIN, { exec })
  const revert = () =>
    p.tools
      .get('tracy_site')
      .execute(
        { action: 'look.revert', params: { undo: id } },
        { agent: { session: { id: 'session-x', header: { cwd } } } }
      )
  const first = await revert()
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.equal(additional, '/* before */')
  await settle()
  assert.equal(p.posted.length, 1)
  assert.deepEqual(p.posted[0].body, {
    tool: 'look.revert',
    via: 'look-css',
    target: { kind: 'additional-css', id }
  })
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.reverted.by, 'look.revert')
  const second = await revert()
  assert.equal(second.ok, false)
  assert.equal(second.code, 'LOOK_UNDO_USED')
  await settle()
  assert.equal(p.posted.length, 1, 'nothing put back, nothing reported')
})
