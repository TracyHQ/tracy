/**
 * The visual check through the SHIPPED bundle (`lib/index.js`): the page the customer has open is drawn
 * while they write (`POST …/view`), the turn's first step freezes that picture with their words, and
 * `agent/turn-stopping` draws the page again, asks the model, and steers ONE notice only on a confident
 * failure. The wiring `visual-check.test.mjs` cannot see: a listener that never registered, a picture
 * taken after the writes, a second check on the step the notice adds, or a throw into the turn would
 * leave every unit test green.
 *
 *   node --test packages/tools/tracy-site-tools/test/visual-check-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { apply } from '../lib/index.js'
import { checkReportOf, writtenAfterCheckReport } from '../src/host/visual-check.mjs'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5])
const REF = { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: 'image/jpeg', bytes: JPEG.length }
const KEY = 'site1.tracy.test'
const REPORT = {
  sessionId: 'session-a',
  visible: true,
  url: `https://${KEY}/pricing`,
  y: 0,
  w: 1280,
  h: 800,
  warm: true
}
const CHECK = 'tracy-site-tools:visual-check'

const nonceOf = (argv) => /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])[1]
const page = '<html lang="en"><head><title>Pricing</title></head><body><h1>Pricing</h1></body></html>'

function docker({ gate = null } = {}) {
  const calls = []
  return {
    calls,
    exec: async ({ argv }) => {
      if (argv[4] === 'curl') {
        calls.push({ kind: 'curl', argv })
        const nonce = nonceOf(argv)
        return {
          code: 0,
          stdout: `HTTP/1.1 200 X\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${page}\n${nonce} 200 ${Buffer.byteLength(page)}\n`,
          stderr: '',
          timedOut: false
        }
      }
      calls.push({ kind: 'browser', argv })
      // `gate`: the drawing ends only when the test says, so "late" is a fact, not a race with the clock.
      if (gate !== null) await gate
      return {
        code: 0,
        stdout: `TRACY_BROWSER OK http://127.0.0.1/pricing\n${JSON.stringify({ y: 0, loaded: true, jpeg: JPEG.toString('base64') })}`,
        stderr: '',
        timedOut: false
      }
    }
  }
}

/** The plugin booted the way dsh boots it, with a model that answers `verdict` to the comparison. */
function boot({
  verdict = '{"verdict":"not_shown","target":"the heading","seen":"Pricing"}',
  plugin = {},
  fail = false,
  signed = false,
  gate = null
} = {}) {
  const listeners = new Map()
  const lines = []
  const asked = []
  const posted = []
  const tools = new Map()
  let route = null
  const d = docker({ gate })
  // `signed`: the session holds the person who typed, and the plugin can sign as them — what lets the
  // check's verdict reach tracy-web (`POST /turn/check`).
  const typed = {
    type: 'user/message',
    data: { source: { kind: 'user', prompter: { user: 'Ada', email: 'ada@example.com' } } }
  }
  const signing = signed
    ? {
        tracyAssertion: { mint: (email) => `signed:${email}` },
        sessions: { get: () => ({ snapshotEvents: () => [typed] }) }
      }
    : {}
  const reach = signed
    ? {
        origin: 'http://tracy.test',
        fetch: async (url, init = {}) => {
          posted.push({
            url: String(url),
            headers: init.headers,
            body: init.body ? JSON.parse(init.body) : null
          })
          return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        }
      }
    : {}
  const services = {
    ...signing,
    logger: { warn: (line) => lines.push(line), info: (line) => lines.push(line) },
    llm: {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
      listModels: async () => [],
      stream: (options) => {
        asked.push(options)
        return (async function* () {
          if (fail) throw new Error('model down')
          yield { type: 'text-delta', text: verdict }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      }
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' })
    },
    attachments: { saveImage: async () => REF }
  }
  const ctx = {
    webServer: {
      register: (r) => {
        route = r
        return () => {}
      }
    },
    tools: { register: (t) => (tools.set(t.name, t), () => {}), schemas: () => [] },
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => services[name]
  }
  apply(ctx, { exec: d.exec, emdash: { cms: async () => '' }, ...reach, ...plugin })
  return { listeners, lines, asked, posted, tools, docker: d, route: () => route }
}

function post(host, body) {
  return new Promise((resolve) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = 'POST'
    req.url = '/api/tracy-site-tools/view'
    req.headers = { 'x-forwarded-prefix': `/${KEY}` }
    req.socket = { remoteAddress: '203.0.113.5' }
    const res = {
      writeHead: (status) => {
        res.status = status
      },
      end: (text) => resolve({ status: res.status, body: JSON.parse(text) })
    }
    host.route().handler(req, res)
  })
}

const settle = async (until, ms = 2000) => {
  const started = Date.now()
  while (!until()) {
    if (Date.now() - started > ms) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

function site() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-vcheck-'))
  const cwd = path.join(root, 'site1')
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return cwd
}

/** A turn's log: it wrote (a shell call) unless `wrote` is false, and the agent said it was done. */
const events = (wrote = true) => [
  { type: 'turn/start', data: { turn: 3 } },
  ...(wrote
    ? [
        {
          type: 'tool/call',
          data: { name: 'bash', arguments: { command: 'wp option update x' }, callId: 'c1' }
        }
      ]
    : []),
  { type: 'assistant/message', data: { turn: 3, message: { content: [{ type: 'text', text: 'Done.' }] } } }
]

/** The agent dsh hands the listeners: its session, its log, and the steer the check may call. */
function agent(cwd, { wrote = true } = {}) {
  const steered = []
  return {
    steered,
    session: { id: 'session-a', header: { cwd }, snapshotEvents: () => events(wrote) },
    steer: (message) => steered.push(message)
  }
}

/** The page drawn while the customer wrote, then their message's first step (turn 3). */
async function opened(host, a, { draws = true, between = async () => {} } = {}) {
  await post(host, REPORT)
  if (draws) await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  await tick()
  await new Promise((resolve) => setTimeout(resolve, 5))
  await between()
  const message = {
    id: 'm1',
    role: 'user',
    content: [{ type: 'text', text: 'Change the heading to Prices' }],
    source: { kind: 'user' }
  }
  for (const fn of host.listeners.get('agent/pre-step') ?? [])
    await fn({ messages: [message], turn: 3, agent: a }, async () => ({ kind: 'enter', messages: [message] }))
  await tick()
}

/** A shell call that wrote the site finished, in the conversation `sessionId` (dsh's `tools/result`). */
async function shellWrote(host, cwd, sessionId) {
  for (const fn of host.listeners.get('tools/result') ?? [])
    fn(
      {
        name: 'bash',
        arguments: { command: 'wp option update blogdescription x' },
        agent: { session: { id: sessionId, header: { cwd } } }
      },
      { isError: false, content: [{ type: 'text', text: 'Success' }] }
    )
  await new Promise((resolve) => setTimeout(resolve, 5))
}

async function stopping(host, a) {
  for (const fn of host.listeners.get('agent/turn-stopping') ?? [])
    await fn({ agent: a, turn: 3, signal: new AbortController().signal })
}

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 a confident "does not show" steers ONE notice, once per turn, after the page is drawn again', async () => {
  const host = boot()
  const a = agent(site())
  await opened(host, a)
  const drawnBefore = host.docker.calls.filter((c) => c.kind === 'browser').length
  await stopping(host, a)
  assert.equal(host.asked.length, 1, 'one comparison')
  assert.equal(
    host.asked[0].messages[0].content.filter((b) => b.type === 'image').length,
    2,
    'before and after'
  )
  assert.equal(
    host.docker.calls.filter((c) => c.kind === 'browser').length,
    drawnBefore + 1,
    'the page drawn again'
  )
  const after = host.docker.calls.filter((c) => c.kind === 'browser').at(-1).argv
  assert.deepEqual(
    JSON.parse(after[after.indexOf('view') + 3]),
    { w: 1280, h: 800, y: 0, dark: false },
    'same window'
  )
  assert.equal(a.steered.length, 1)
  assert.equal(a.steered[0].source.producer, CHECK)
  assert.ok(host.lines.some((l) => l.includes('visual check') && l.includes('"verdict":"not_shown"')))
  // The step the notice adds stops again: no second check, no second notice.
  await stopping(host, a)
  assert.equal(host.asked.length, 1)
  assert.equal(a.steered.length, 1)
})

// Audit 19/10/2026: a picture drawn before the site's last write is never a turn's "before" — the
// tab did not refresh, or another conversation wrote — while the turn's own writes leave its frozen one.
test('🔒 the previous turn wrote after the picture and the tab never said changed: no "before", no comparison', async () => {
  const host = boot()
  const cwd = site()
  const a = agent(cwd)
  await opened(host, a, { between: () => shellWrote(host, cwd, 'session-a') })
  await stopping(host, a)
  assert.equal(host.asked.length, 0, 'the earlier write is not judged as a change nobody asked for')
  assert.equal(a.steered.length, 0)
  assert.ok(host.lines.some((l) => l.includes('visual check') && l.includes('no-before')))
})

test('🔒 another conversation wrote the site after the picture: no "before" from it', async () => {
  const host = boot()
  const cwd = site()
  const a = agent(cwd)
  await opened(host, a, { between: () => shellWrote(host, cwd, 'session-b') })
  await stopping(host, a)
  assert.equal(host.asked.length, 0)
  assert.equal(a.steered.length, 0)
})

test('🔒 a turn’s own writes keep the "before" its first step froze', async () => {
  const host = boot()
  const cwd = site()
  const a = agent(cwd)
  await opened(host, a)
  await shellWrote(host, cwd, 'session-a')
  await stopping(host, a)
  assert.equal(host.asked.length, 1, 'compared with the picture from before its own write')
  assert.equal(host.asked[0].messages[0].content.filter((b) => b.type === 'image').length, 2)
  assert.equal(a.steered.length, 1)
})

test('shown, shadow mode, a turn that wrote nothing: no notice', async () => {
  const shown = boot({ verdict: '{"verdict":"shown","target":"the heading","seen":"Prices"}' })
  const a1 = agent(site())
  await opened(shown, a1)
  await stopping(shown, a1)
  assert.equal(shown.asked.length, 1)
  assert.equal(a1.steered.length, 0)

  const shadow = boot({ plugin: { visualCheck: 'shadow' } })
  const a2 = agent(site())
  await opened(shadow, a2)
  await stopping(shadow, a2)
  assert.equal(shadow.asked.length, 1, 'shadow still compares')
  assert.equal(a2.steered.length, 0, 'but never steers')

  const idle = boot()
  const a3 = agent(site(), { wrote: false })
  await opened(idle, a3)
  await stopping(idle, a3)
  assert.equal(idle.asked.length, 0)
  assert.equal(a3.steered.length, 0)
})

test('off: no listener work at all; viewContext off turns it off too', async () => {
  for (const plugin of [{ visualCheck: false }, { viewContext: false }]) {
    const host = boot({ plugin })
    const a = agent(site())
    await opened(host, a, { draws: plugin.viewContext !== false })
    await stopping(host, a)
    assert.equal(host.asked.length, 0, JSON.stringify(plugin))
    assert.equal(a.steered.length, 0)
  }
})

test('🔒 a model that fails never throws into the turn and steers nothing', async () => {
  const host = boot({ fail: true })
  const a = agent(site())
  await opened(host, a)
  await assert.doesNotReject(stopping(host, a))
  assert.equal(a.steered.length, 0)
  assert.ok(host.lines.some((l) => l.includes('visual check') && l.includes('judge-failed')))
})

// Plan tasks/todo-do-dung-that.md U2: the verdict is kept beside the turn, for usage.
test('the verdict reaches tracy-web as the person who typed: judged, and a skip by its short reason', async () => {
  const host = boot({ signed: true })
  const a = agent(site())
  await opened(host, a)
  await stopping(host, a)
  await settle(() => host.posted.some((p) => p.url.endsWith('/turn/check')))
  const sent = host.posted.filter((p) => p.url.endsWith('/turn/check'))
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, 'http://tracy.test/api/sites/_conversation/turn/check')
  assert.equal(sent[0].headers['x-tracy-actor'], 'signed:ada@example.com')
  assert.deepEqual(sent[0].body, { turnId: 'session-a:3', visual: 'not_shown', note: null })

  const idle = boot({ signed: true })
  const b = agent(site(), { wrote: false })
  await opened(idle, b)
  await stopping(idle, b)
  await settle(() => idle.posted.some((p) => p.url.endsWith('/turn/check')))
  assert.deepEqual(idle.posted.find((p) => p.url.endsWith('/turn/check')).body, {
    turnId: 'session-a:3',
    visual: 'skipped',
    note: 'no-write'
  })
})

// Council 20/10/2026: a check is never read as covering writes that came after it.
test('🔒 the step the notice adds writes: the turn’s report is sent again with written-after-check, once', async () => {
  const host = boot({ signed: true })
  const cwd = site()
  const a = agent(cwd)
  await opened(host, a)
  await stopping(host, a)
  assert.equal(a.steered.length, 1, 'the notice adds one step')
  await settle(() => host.posted.some((p) => p.url.endsWith('/turn/check')))
  // the added step writes the site, twice, then stops: no second check
  await shellWrote(host, cwd, 'session-a')
  await shellWrote(host, cwd, 'session-a')
  await stopping(host, a)
  await settle(() => host.posted.filter((p) => p.url.endsWith('/turn/check')).length >= 2)
  await new Promise((resolve) => setTimeout(resolve, 20))
  const sent = host.posted.filter((p) => p.url.endsWith('/turn/check'))
  assert.equal(host.asked.length, 1, 'no second comparison')
  assert.equal(sent.length, 2, 'the first report, then one more for the writes after it')
  assert.deepEqual(sent[0].body, { turnId: 'session-a:3', visual: 'not_shown', note: null })
  assert.deepEqual(sent[1].body, { turnId: 'session-a:3', visual: 'not_shown', note: 'written-after-check' })
  assert.equal(sent[1].headers['x-tracy-actor'], 'signed:ada@example.com')
})

test('a check that found nothing and no write after it: one report, no written-after-check', async () => {
  const host = boot({ signed: true, verdict: '{"verdict":"shown","target":"the heading","seen":"Prices"}' })
  const cwd = site()
  const a = agent(cwd)
  await opened(host, a)
  await shellWrote(host, cwd, 'session-a')
  await stopping(host, a)
  assert.equal(a.steered.length, 0)
  await settle(() => host.posted.some((p) => p.url.endsWith('/turn/check')))
  await new Promise((resolve) => setTimeout(resolve, 20))
  const sent = host.posted.filter((p) => p.url.endsWith('/turn/check'))
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].body, { turnId: 'session-a:3', visual: 'shown', note: null })
})

test('writtenAfterCheckReport: the verdict kept, its note marked, never past what tracy-web keeps', () => {
  const NOTE = /^[a-z][a-zA-Z0-9_-]{0,47}$/
  assert.deepEqual(writtenAfterCheckReport({ visual: 'shown', note: null }), {
    visual: 'shown',
    note: 'written-after-check'
  })
  assert.deepEqual(writtenAfterCheckReport({ visual: 'cannot_tell', note: 'unasked' }), {
    visual: 'cannot_tell',
    note: 'unasked-written-after-check'
  })
  assert.deepEqual(writtenAfterCheckReport({ visual: 'skipped', note: 'capture-TIMEOUT' }), {
    visual: 'skipped',
    note: 'capture-TIMEOUT-written-after-check'
  })
  const long = writtenAfterCheckReport({ visual: 'skipped', note: `a${'b'.repeat(40)}` })
  assert.equal(long.note, 'written-after-check')
  const twice = writtenAfterCheckReport(writtenAfterCheckReport({ visual: 'broken', note: null }))
  assert.equal(twice.note, 'written-after-check', 'marked once')
  for (const r of [long, twice]) assert.match(r.note, NOTE)
})

// A capture that timed out, or no picture from before, is "not checked": skipped with its reason.
test('🔒 a capture timeout or no "before" reports skipped with a note, never a verdict', () => {
  for (const [reason, note] of [
    ['capture-TIMEOUT', 'capture-TIMEOUT'],
    ['capture-BUDGET', 'capture-BUDGET'],
    ['no-before: capture-timeout', 'no-before-capture-timeout'],
    ['no-before', 'no-before'],
    ['after-not-loaded', 'after-not-loaded']
  ])
    assert.deepEqual(checkReportOf({ status: 'skipped', reason }), { visual: 'skipped', note }, reason)
})

test('checkReportOf: a verdict as it is; a skip as the head of its reason, never its detail', () => {
  assert.deepEqual(checkReportOf({ status: 'judged', verdict: 'broken' }), { visual: 'broken', note: null })
  assert.deepEqual(checkReportOf({ status: 'judged', verdict: 'odd' }), { visual: 'skipped', note: null })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'judge-failed: deepseek/x timed out' }), {
    visual: 'skipped',
    note: 'judge-failed'
  })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'capture-TIMEOUT' }), {
    visual: 'skipped',
    note: 'capture-TIMEOUT'
  })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'error: boom' }), {
    visual: 'skipped',
    note: 'error'
  })
  assert.deepEqual(checkReportOf({}), { visual: 'skipped', note: null })
})

// Council 20/10/2026 (Q1, Q2): a turn without the tab's picture has one drawn before its first write.
/** The turn's first step with no Browser tab at all (chat without the tab, Voice). */
async function firstStep(host, a, text = 'Change the heading to Prices') {
  const message = { id: 'm1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
  for (const fn of host.listeners.get('agent/pre-step') ?? [])
    await fn({ messages: [message], turn: 3, agent: a }, async () => ({ kind: 'enter', messages: [message] }))
  await tick()
}

/** One call through every `tools/pre-execute` listener, the way dsh chains them; when it was let go. */
async function preExecute(host, a, name, args) {
  const chain = host.listeners.get('tools/pre-execute') ?? []
  const exec = { name, arguments: args, callId: `c-${Math.random()}`, agent: a }
  const run = (i) =>
    i < chain.length ? chain[i](exec, () => run(i + 1)) : Promise.resolve({ kind: 'allow' })
  const started = Date.now()
  const decision = await run(0)
  return { decision, ms: Date.now() - started }
}

const browserCalls = (host) => host.docker.calls.filter((c) => c.kind === 'browser')

test('🔒 no Browser-tab picture: the first write is held until its page is drawn, then sent, and the check runs', async () => {
  const host = boot()
  const a = agent(site())
  await firstStep(host, a)
  // 23/10/2026: the step draws one page while the agent reads (home here: no tab, nothing read)
  assert.equal(browserCalls(host).length, 1, 'the early picture, drawn at the step')
  const sent = await preExecute(host, a, 'tracy_site', {
    action: 'look.set',
    params: { path: '/pricing', scope: 'page', selector: 'h1', set: { color: 'red' } }
  })
  assert.equal(sent.decision.kind, 'allow')
  assert.equal(browserCalls(host).length, 2, 'its own page drawn before the write was let go')
  const drawn = browserCalls(host)[1].argv
  assert.match(drawn.join(' '), /\/pricing/)
  // a second write in the same turn is not held again
  await preExecute(host, a, 'tracy_site', {
    action: 'look.set',
    params: { path: '/pricing', scope: 'page', selector: 'h2', set: { color: 'red' } }
  })
  assert.equal(browserCalls(host).length, 2)
  await stopping(host, a)
  assert.equal(host.asked.length, 1, 'compared')
  assert.equal(host.asked[0].messages[0].content.filter((b) => b.type === 'image').length, 2)
  assert.equal(a.steered.length, 1)
  assert.ok(host.lines.some((l) => l.includes('held tracy_site') && l.includes('/pricing')))
})

// Deterministic: the drawing ends only when the test releases it, and the hold's budget is the plugin's
// `visualCheckHoldMs` knob (5 s unless set: `check-pages.test.mjs` holds the default).
test('🔒 a draw that does not finish in time: the write is sent at the budget, the late picture is never the before', async () => {
  let release = () => {}
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const host = boot({ gate, plugin: { visualCheckHoldMs: 30 } })
  const a = agent(site())
  await firstStep(host, a)
  let drawn = false
  void gate.then(() => {
    drawn = true
  })
  const sent = await preExecute(host, a, 'tracy_site', {
    action: 'content.update',
    params: { kind: 'post', id: 12, fields: { title: 'Prices' } }
  })
  assert.equal(sent.decision.kind, 'allow')
  assert.equal(browserCalls(host).length, 1, 'the drawing was asked for')
  assert.equal(drawn, false, 'and the write was let go while it was still being drawn')
  release()
  await new Promise((resolve) => setTimeout(resolve, 10))
  await stopping(host, a)
  assert.equal(host.asked.length, 0, 'the picture that came after the write is not compared')
  assert.equal(a.steered.length, 0)
  assert.ok(host.lines.some((l) => l.includes('visual check') && l.includes('no-before: capture-timeout')))
})

test('🔒 a comment turn writing a shared header: its page and home drawn before the write, one comparison of both', async () => {
  const host = boot({ verdict: '{"verdict":"shown","target":"the header","seen":"Blue","elsewhere":[]}' })
  const a = agent(site())
  const text = buildCommentTurn({
    text: 'Make the header blue',
    element: { url: `https://${KEY}/pricing`, selector: 'header', label: 'header', text: 'Menu', marks: [] },
    locate: null
  })
  await firstStep(host, a, text)
  // the call before the customer's yes is refused CONFIRM_FIRST by the door: nothing is drawn for it
  await preExecute(host, a, 'tracy_site', {
    action: 'content.update',
    params: { kind: 'templatePart', key: 'header', fields: { content: '<!-- x -->' } }
  })
  assert.equal(
    browserCalls(host).length,
    1,
    'only the early picture: not held for a call the door will refuse to ask first'
  )
  await preExecute(host, a, 'tracy_site', {
    action: 'content.update',
    params: { kind: 'templatePart', key: 'header', fields: { content: '<!-- x -->' }, confirm: true }
  })
  assert.equal(
    browserCalls(host).length,
    2,
    'the comment page (the early picture) and home, before the write'
  )
  await stopping(host, a)
  assert.equal(browserCalls(host).length, 4, 'both drawn again')
  // (the site-notes reader also reads a wish in "make the header blue": only the comparison counts here)
  const judged = host.asked.filter((x) => String(x.system).startsWith('You check one change'))
  assert.equal(judged.length, 1, 'one comparison')
  const content = judged[0].messages[0].content
  assert.equal(content.filter((b) => b.type === 'image').length, 4)
  assert.ok(content.some((b) => b.type === 'text' && /OTHER PAGE \/, AFTER/.test(b.text)))
  assert.equal(a.steered.length, 0, 'the header changing on home as asked is no notice')
})

// Beta week 16–23/10/2026: 42 of 42 writing turns closed `no-before` — the agent's look edits are file edits
// (a stylesheet with `edit`), and with no Browser tab the 5 s hold lost to a 5–7 s drawing.
test('🔒 a stylesheet edited with no Browser tab is compared on the page drawn as the turn began', async () => {
  const host = boot()
  const a = agent(site())
  await firstStep(host, a, 'Make the menu one row')
  assert.equal(browserCalls(host).length, 1, 'the early picture, drawn at the step')
  const sent = await preExecute(host, a, 'edit', {
    file_path: `${a.session.header.cwd}/.webroot/templates/ja_seven/css/custom.css`,
    old_string: 'a',
    new_string: 'b'
  })
  assert.equal(sent.decision.kind, 'allow')
  assert.equal(browserCalls(host).length, 1, 'no second drawing: the early one is the before')
  await stopping(host, a)
  assert.equal(host.asked.length, 1, 'compared')
  assert.equal(host.asked[0].messages[0].content.filter((b) => b.type === 'image').length, 2)
})

test('a refused write is never held; a turn already checked holds nothing', async () => {
  const host = boot()
  const a = agent(site())
  await firstStep(host, a)
  // a later listener refuses: nothing is drawn for it
  const chain = host.listeners.get('tools/pre-execute') ?? []
  const exec = {
    name: 'tracy_site',
    arguments: { action: 'look.set', params: { path: '/x', scope: 'page' } },
    agent: a
  }
  const refused = await chain.at(-1)(exec, async () => ({ kind: 'deny', reason: 'no' }))
  assert.equal(refused.kind, 'deny')
  assert.equal(browserCalls(host).length, 1, 'the early picture only')
  await stopping(host, a)
  await preExecute(host, a, 'tracy_site', { action: 'look.set', params: { path: '/x', scope: 'page' } })
  assert.equal(browserCalls(host).length, 1)
})

test('🔒 a write that names no page draws nothing and leaves the chance to the next write', async () => {
  const host = boot()
  const a = agent(site())
  await firstStep(host, a)
  await preExecute(host, a, 'bash', { command: 'wp post list --format=ids' })
  await preExecute(host, a, 'tracy_site', { action: 'media.upload', params: { file: 'x.jpg' } })
  assert.equal(browserCalls(host).length, 1, 'only the early picture, kept as the fallback')
  await preExecute(host, a, 'tracy_site', {
    action: 'look.set',
    params: { path: '/pricing', scope: 'page', selector: 'h1', set: { color: 'red' } }
  })
  assert.equal(browserCalls(host).length, 2, 'the first write that names its page is drawn')
  await stopping(host, a)
  assert.equal(host.asked.length, 1)
})

test('🔒 a delete or a hide without the customer’s yes is not held; with confirm:true it is', async () => {
  const host = boot()
  const a = agent(site())
  await firstStep(host, a)
  await preExecute(host, a, 'tracy_site', { action: 'content.delete', params: { kind: 'post', id: 12 } })
  await preExecute(host, a, 'tracy_site', {
    action: 'content.update',
    params: { kind: 'post', id: 12, fields: { post_status: 'draft' } }
  })
  await preExecute(host, a, 'tracy_emdash', {
    tool: 'content_unpublish',
    arguments: { collection: 'posts', id: '01P' }
  })
  assert.equal(browserCalls(host).length, 1, 'the early picture only')
  await preExecute(host, a, 'tracy_site', {
    action: 'content.update',
    params: { kind: 'post', id: 12, fields: { post_status: 'draft' }, confirm: true }
  })
  assert.equal(browserCalls(host).length, 2)
})

// Local round 18, 25/10/2026: in a whole-site build the comparison said "the hours changed, which the customer did not
// ask for", and its steer landed beside the build's own check-again step.
test('🔒 a build is judged by its own checks: no comparison, and the only steer is to check', async () => {
  const host = boot({ signed: true })
  const a = agent(site())
  await opened(host, a)
  const answered = await host.tools
    .get('tracy_demo')
    .execute({ operation: 'read', part: 'catalogue' }, { agent: a })
  assert.notEqual(answered?.code, 'AGENT_DEMO_NOT_GRANTED', 'the conversation is a build')
  await stopping(host, a)
  assert.equal(host.asked.length, 0, 'no comparison')
  assert.deepEqual(
    a.steered.map((m) => m.source.producer),
    ['tracy-site-tools:check-again']
  )
})

// Local round 21, 25/10/2026: a build stopped twice between two checks, spent a per-turn cap of three steers before
// its fourth check and ended there, a check unspent.
test('🔒 a build is steered at most twice between two checks, and again after each new check', async () => {
  const host = boot({ signed: true })
  const cwd = site()
  const log = [{ type: 'turn/start', data: { turn: 3 } }]
  const steered = []
  const a = {
    steered,
    session: { id: 'session-a', header: { cwd }, snapshotEvents: () => log },
    steer: (m) => steered.push(m)
  }
  await host.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: a })
  const failedCheck = (n) => {
    log.push({
      type: 'tool/call',
      data: { name: 'tracy_demo', arguments: { operation: 'check' }, callId: `k${n}` }
    })
    log.push({
      type: 'tool/result',
      data: {
        message: {
          source: { callId: `k${n}` },
          content: [{ type: 'text', text: JSON.stringify({ ok: true, pass: false }) }]
        }
      }
    })
  }
  const stops = async (k) => {
    for (let i = 0; i < k; i++) await stopping(host, a)
    return steered.filter((m) => m.source.producer === 'tracy-site-tools:check-again').length
  }
  failedCheck(1)
  assert.equal(await stops(3), 2, 'two steers between two checks')
  failedCheck(2)
  assert.equal(await stops(1), 3, 'a new check opens two more')
})
