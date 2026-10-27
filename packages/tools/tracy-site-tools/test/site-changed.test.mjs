/**
 * V7S-1 (acceptance v7, 30/09, `tasks/evidence/comment-people/e2e-v7/send.md`, 2/2): in conversation Y
 * the person changed a heading "Pre-engineered steel buildings" → "…structures"; another conversation
 * changed it back; asked again in Y, Tracy answered "That's already in place — nothing further to
 * change" with NO tool call, and the site still said "buildings". The model trusted what it remembered
 * of the site over the site. Two answers:
 *
 * - a per-turn notice, on every turn a person speaks while the site has changed since this
 *   conversation last called a site tool (`siteChangedNotice`, `lastSiteLookAt`);
 * - the site context's rule: a request already true is judged by a read of THIS turn, never memory.
 *
 *   node --test packages/tools/tracy-site-tools/test/site-changed.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { lastSiteLookAt, SITE_CHANGED_PLUGIN, siteChangedNotice } from '../src/host/prompter.mjs'
import { siteContext } from '../src/host/site-context.mjs'

const { apply } = await import('../lib/index.js')

const LOOKED = Date.parse('2026-09-30T10:40:00Z')
const LATER = '2026-09-30T10:52:00.000Z'

/** A `tool/call` event as dsh logs it: the call's name and arguments, its epoch `time`. */
const call = (name, time, args = { action: 'content.read', params: {} }) => ({
  type: 'tool/call',
  time,
  data: { name, arguments: args, callId: `c${time}` }
})
/** The person's message in the log: the gate's stamp names who typed. */
const said = (text) => ({
  type: 'user/message',
  time: LOOKED - 1_000,
  data: {
    source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
    content: [{ type: 'text', text }]
  }
})

// ── the pure halves ───────────────────────────────────────────────────────────────────────────────

test('lastSiteLookAt: the latest tracy_site or tracy_emdash call of the conversation; other tools are not a look', () => {
  const events = [
    said('change the heading'),
    call('tracy_site', LOOKED - 60_000),
    call('tracy_emdash', LOOKED, { tool: 'content_get', arguments: {} }),
    call('bash', LOOKED + 60_000, { command: 'ls' })
  ]
  const session = { seq: events.length, eventAt: (seq) => events[seq] }
  assert.equal(lastSiteLookAt(session), LOOKED)
  const never = [said('hello')]
  assert.equal(lastSiteLookAt({ seq: never.length, eventAt: (seq) => never[seq] }), null)
  assert.equal(lastSiteLookAt(undefined), null)
})

test('siteChangedNotice: said only when the site changed after the conversation last looked, naming when', () => {
  const notice = siteChangedNotice({ changedAt: LATER, lookedAt: LOOKED })
  assert.ok(notice !== null)
  assert.match(notice.text, /The site changed since you last looked at it/)
  assert.match(notice.text, /another conversation or person wrote to it at 2026-09-30 10:52 UTC/)
  assert.match(
    notice.text,
    /Before saying something is already done or already reads a certain way, read it again/
  )
  assert.ok(notice.text.length <= 400, `${notice.text.length} characters`)
  assert.ok(notice.summary.length <= 120)
  // Nothing changed since the look, or the conversation's own write is the last change: silence.
  assert.equal(siteChangedNotice({ changedAt: new Date(LOOKED).toISOString(), lookedAt: LOOKED }), null)
  assert.equal(siteChangedNotice({ changedAt: '2026-09-30T10:00:00Z', lookedAt: LOOKED }), null)
  // Never looked, never written, or an answer that is not a time: nothing to warn about.
  assert.equal(siteChangedNotice({ changedAt: LATER, lookedAt: null }), null)
  assert.equal(siteChangedNotice({ changedAt: null, lookedAt: LOOKED }), null)
  assert.equal(siteChangedNotice({ changedAt: 'soon', lookedAt: LOOKED }), null)
  assert.equal(SITE_CHANGED_PLUGIN, 'tracy-site-tools:site-changed')
})

test('🔒 V8-1: the conversation\'s own write is never "the site changed", though it is stamped after its call', () => {
  // Measured on the stand (e2e v8): `last_write_at` 12:38:59.59, the write's own call 12:38:58.447.
  const call = Date.parse('2026-09-30T12:38:58.447Z')
  const stamp = '2026-09-30T12:38:59.590Z'
  assert.equal(siteChangedNotice({ changedAt: stamp, lookedAt: call, byThisConversation: true }), null)
  assert.ok(siteChangedNotice({ changedAt: stamp, lookedAt: call, byThisConversation: false }) !== null)
  // An older tracy-web says nothing about who wrote: times alone, as before.
  assert.ok(siteChangedNotice({ changedAt: stamp, lookedAt: call }) !== null)
})

test('🔒 the rule, independent of the notice: a request already true is judged by a read of this turn, never memory', async () => {
  const { dir } = folder()
  const context = await siteContext(dir, 'shop1', async () => 'wordpress', 'designer-wordpress', {})
  assert.ok(context !== null)
  assert.match(
    context.text,
    /A request already true is said, not asked — after a read of this turn, never from memory\./
  )
  assert.doesNotMatch(context.text, /often your own earlier change/)
})

// ── the host's own pre-step ───────────────────────────────────────────────────────────────────────

function folder() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-changed-'))
  const dir = path.join(root, 'shop1')
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'shop1.tracy.test', platform: 'wordpress' })
  )
  return { root, dir }
}

const claimed = (text) => ({
  id: 'm',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' }
})

/**
 * A host whose door answers `GET …/changed` with `changedAt` (and `byThisConversation` when given —
 * an older tracy-web answers without it), every such request recorded.
 * @param {string} root @param {string | null} changedAt @param {boolean} [byThisConversation]
 */
function host(root, changedAt, byThisConversation) {
  process.env.TRACY_SITES_ROOT = root
  const listeners = new Map()
  /** @type {{url: string, method: string, headers: Record<string, string>}[]} */
  const asked = []
  let events = []
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (setup) => {
        setup()
      },
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: (name) =>
        name === 'sessions'
          ? { get: () => ({ snapshotEvents: () => events }) }
          : name === 'tracyAssertion'
            ? { mint: (email) => `signed:${email}` }
            : undefined
    },
    {
      origin: 'http://door.test',
      now: () => new Date('2026-09-30T12:00:00Z'),
      fetch: async (url, init = {}) => {
        if (!String(url).endsWith('/changed') || (init.method ?? 'GET') !== 'GET')
          return new Response('', { status: 404 })
        asked.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers })
        return new Response(JSON.stringify({ changedAt, byThisConversation }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    }
  )
  const [hook] = listeners.get('agent/pre-step') ?? []
  /** One step; `text` null is a step with no new message from the person. */
  const step = async (cwd, log, text) => {
    events = log
    const messages = text === null ? [] : [claimed(text)]
    const agent = {
      id: 'session-y',
      session: {
        id: 'session-y',
        header: { cwd },
        seq: log.length,
        eventAt: (seq) => log[seq],
        surface: { nodes: log.map((_, seq) => seq) }
      }
    }
    const decision = await hook({ agent, messages }, async () => ({ kind: 'enter', messages: [...messages] }))
    return decision.messages
  }
  return { step, asked }
}

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

const HEADING = 'change the heading "Pre-engineered steel buildings" to "Pre-engineered steel structures"'
const producers = (messages) => messages.map((m) => m.source.producer ?? m.source.kind)

test('🔒 V7S-1: a typed turn after another conversation wrote the site carries the notice, after the person’s words', async () => {
  const { root, dir } = folder()
  const { step, asked } = host(root, LATER)
  const log = [said(HEADING), call('tracy_site', LOOKED, { action: 'content.replace', params: {} })]
  const sent = await step(dir, log, HEADING)
  const order = producers(sent)
  assert.ok(order.includes(SITE_CHANGED_PLUGIN), order.join(', '))
  assert.ok(order.indexOf(SITE_CHANGED_PLUGIN) > order.indexOf('user'), 'after the person’s words')
  const notice = sent.find((m) => m.source.producer === SITE_CHANGED_PLUGIN)
  assert.match(notice.content[0].text, /2026-09-30 10:52 UTC/)
  // Asked of the conversation's own site, as the person who typed, for this conversation.
  assert.equal(asked.length, 1)
  assert.equal(asked[0].url, 'http://door.test/api/sites/_conversation/changed')
  assert.equal(asked[0].headers['x-tracy-actor'], 'signed:an@example.test')
  assert.equal(asked[0].headers['x-tracy-workspace-label'], 'shop1')
  assert.equal(asked[0].headers['x-tracy-session'], 'session-y')
})

test('V7S-1: a turn sent from the page carries it too', async () => {
  const { root, dir } = folder()
  const { step } = host(root, LATER)
  const page = [
    'make this say structures',
    '```tracy-element',
    '<mentioned-element n="12" url="http://shop1.tracy.test/" lang="en">',
    'text: Pre-engineered steel buildings',
    '</mentioned-element>',
    '```'
  ].join('\n')
  const sent = await step(dir, [said(HEADING), call('tracy_site', LOOKED)], page)
  assert.ok(producers(sent).includes(SITE_CHANGED_PLUGIN))
})

test('V7S-1: no notice when nothing changed since the look, nor on a step with no new words, nor before any look', async () => {
  const { root, dir } = folder()
  const unchanged = host(root, new Date(LOOKED - 5_000).toISOString())
  const quiet = await unchanged.step(dir, [said(HEADING), call('tracy_site', LOOKED)], HEADING)
  assert.ok(!producers(quiet).includes(SITE_CHANGED_PLUGIN))

  const changed = host(root, LATER)
  const midTurn = await changed.step(dir, [said(HEADING), call('tracy_site', LOOKED)], null)
  assert.ok(!producers(midTurn).includes(SITE_CHANGED_PLUGIN))
  // A conversation that never called a site tool remembers nothing of the site: not even asked.
  const fresh = await changed.step(dir, [said('hello')], 'hello')
  assert.ok(!producers(fresh).includes(SITE_CHANGED_PLUGIN))
  assert.equal(changed.asked.length, 0)
})

test("🔒 V8-1: the turn right after the conversation's own write carries no notice; another conversation's write after it still does", async () => {
  const { root, dir } = folder()
  const log = [said(HEADING), call('tracy_site', LOOKED, { action: 'content.replace', params: {} })]
  const own = host(root, LATER, true)
  const after = await own.step(dir, log, 'thanks')
  assert.ok(!producers(after).includes(SITE_CHANGED_PLUGIN), producers(after).join(', '))
  assert.equal(own.asked.length, 1)

  const theirs = host(root, LATER, false)
  assert.ok(producers(await theirs.step(dir, log, 'thanks')).includes(SITE_CHANGED_PLUGIN))
})
