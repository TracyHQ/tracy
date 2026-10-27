/**
 * The customer's open page, through the SHIPPED bundle (`lib/index.js`): the `POST …/view` door, the
 * picture drawn while they write, and the `agent/pre-step` notice that carries it — the wiring
 * `view.test.mjs` cannot see. A door that took its site from the body, a step that gave the picture
 * over the customer's own, or one that threw into a turn would leave every unit test green.
 *
 *   node --test packages/tools/tracy-site-tools/test/view-hook.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { apply } from '../lib/index.js'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5])
const REF = { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: 'image/jpeg', bytes: JPEG.length }
const KEY = 'site1.tracy.test'
const REPORT = {
  sessionId: 'session-a',
  visible: true,
  url: `https://${KEY}/pricing`,
  y: 1200,
  w: 640,
  h: 800,
  warm: true
}

// ── what the container would answer ────────────────────────────────────────────────────────────────

const nonceOf = (argv) => /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])[1]
const page = '<html lang="en"><head><title>Pricing</title></head><body><h1>Pricing</h1></body></html>'
const curlAnswer = (nonce) => ({
  code: 0,
  stdout: `HTTP/1.1 200 X\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${page}\n${nonce} 200 ${Buffer.byteLength(page)}\n`,
  stderr: '',
  timedOut: false
})

/** What the container's browser answers for a page it drew: the picture, and where it ended up scrolled. */
const drawnAnswer = () => ({
  code: 0,
  stdout: `TRACY_BROWSER OK http://127.0.0.1/pricing\n${JSON.stringify({ y: 1180, loaded: true, jpeg: JPEG.toString('base64') })}`,
  stderr: '',
  timedOut: false
})

/** A docker transport: the gate's curl gets a page, the browser gets `browser(argv)`. Every call is recorded. */
function docker({ browser } = {}) {
  const calls = []
  return {
    calls,
    exec: async ({ argv }) => {
      if (argv[4] === 'curl') {
        calls.push({ kind: 'curl', argv })
        return curlAnswer(nonceOf(argv))
      }
      calls.push({ kind: 'browser', argv })
      if (browser) return browser(argv)
      return drawnAnswer()
    }
  }
}

// ── the plugin, booted the way dsh boots it ────────────────────────────────────────────────────────

function boot({ config = {}, model = ['text', 'image'], store = {} } = {}) {
  const listeners = new Map()
  const warnings = []
  const saved = []
  let route = null
  const d = docker(config.docker)
  const services = {
    logger: { warn: (line) => warnings.push(line) },
    llm: { resolveModelInfo: async () => ({ inputModalities: model }) },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' })
    },
    attachments: {
      imageLimits: store.limits,
      saveImage: async (input) => {
        saved.push(input)
        if (store.error) throw store.error
        return REF
      }
    }
  }
  const ctx = {
    webServer: {
      register: (r) => {
        route = r
        return () => {}
      }
    },
    tools: { register: () => () => {}, schemas: () => [] },
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => services[name]
  }
  apply(ctx, { exec: d.exec, emdash: { cms: async () => '' }, ...config.plugin })
  return { listeners, warnings, saved, docker: d, route: () => route }
}

/** POST one JSON body to a door of the plugin, the way tracy-web hands a request to dsh. */
function post(host, pathname, body, headers = { 'x-forwarded-prefix': `/${KEY}` }) {
  return new Promise((resolve) => {
    const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
    req.method = 'POST'
    req.url = `/api/tracy-site-tools${pathname}`
    req.headers = headers
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

/** A site folder under a sites root the plugin is pointed at. */
function site(label = 'site1') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-view-'))
  const cwd = path.join(root, label)
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return cwd
}

const customer = (content) => ({
  id: `m-${Math.random().toString(16).slice(2)}`,
  role: 'user',
  content: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
  source: { kind: 'user' }
})

/**
 * Run the plugin's `agent/pre-step` for a customer message (or for several, `messages`, as a step that
 * claims more than one); resolve the messages the step enters with.
 */
async function step(host, { cwd, sessionId = 'session-a', message, messages = [message] }) {
  const input = { messages, agent: { session: { id: sessionId, header: { cwd } } } }
  let out
  for (const fn of host.listeners.get('agent/pre-step') ?? [])
    out = await fn(input, async () => ({ kind: 'enter', messages }))
  return out.messages
}

/**
 * A Browser-tab comment, built by the chat input itself: what the side card sends when the customer
 * picks an element and writes — as text, never through the composer, so no keystroke drew a picture.
 */
const commentTurn = (text = 'Make this button red') =>
  buildCommentTurn({
    text,
    element: {
      url: `https://${KEY}/pricing`,
      selector: 'a.buy',
      label: 'button',
      text: 'Buy now',
      marks: []
    },
    locate: null
  })

/**
 * Wait until the picture drawn while the customer wrote is IN, not only started: a comment turn takes
 * only a picture that is ready, so "the browser was called" is not yet "there is a picture to take".
 */
const drawn = async (host) => {
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  // The transport answers at once; what is left is the store keeping the shot, a few microtasks on.
  await new Promise((resolve) => setImmediate(resolve))
}

/** A host whose browser stays open until `release()`: a picture still in the making. */
function slowBrowser() {
  let release
  const hold = new Promise((resolve) => {
    release = resolve
  })
  const host = boot({
    config: {
      docker: {
        browser: async () => {
          await hold
          return drawnAnswer()
        }
      }
    }
  })
  return { host, release }
}

/** The notices in a step that carry a picture of the page. */
const pictured = (messages) =>
  messages.filter(
    (m) => m?.source?.kind === 'tracy-site' && m.source.producer === 'tracy-site-tools:open-page'
  )

test.beforeEach(() => {
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

// ── the door ───────────────────────────────────────────────────────────────────────────────────────

test('the door keeps the page a customer has open and draws it while they write', async () => {
  const host = boot()
  const answer = await post(host, '/view', REPORT)
  assert.deepEqual(answer, { status: 200, body: { ok: true, kept: true } })
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  const shot = host.docker.calls.find((c) => c.kind === 'browser').argv
  assert.ok(shot.includes('view'), 'drawn in mode view')
  assert.ok(shot.includes('site1-web-1'), 'in the site the mount names')
  assert.deepEqual(JSON.parse(shot[shot.indexOf('view') + 3]), { w: 640, h: 800, y: 1200, dark: false })
})

test('🔒 the site is the mount the page came through, never a name in the body', async () => {
  const host = boot()
  // A body that names another site changes nothing: the door has no such field.
  await post(host, '/view', { ...REPORT, siteKey: 'victim.tracy.test', label: 'victim' })
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  assert.ok(host.docker.calls.length > 0)
  assert.ok(
    host.docker.calls.every((c) => c.argv.includes('site1-web-1')),
    'every call went to the mounted site'
  )
  assert.ok(!host.docker.calls.some((c) => c.argv.includes('victim-web-1')))
  // No mount at all (a local profile with no tracy-web in front): nothing to picture.
  const bare = boot()
  const none = await post(bare, '/view', REPORT, {})
  assert.deepEqual(none.body, { ok: true, kept: false })
  assert.equal(bare.docker.calls.length, 0)
  // The creation workspace has no site.
  const creating = boot()
  assert.deepEqual((await post(creating, '/view', REPORT, { 'x-forwarded-prefix': '/new' })).body, {
    ok: true,
    kept: false
  })
})

test('the door refuses what is not a report, and a hidden tab clears the view', async () => {
  const host = boot()
  assert.equal((await post(host, '/view', '{nope')).status, 400)
  assert.equal((await post(host, '/view', { ...REPORT, sessionId: 'not-a-session' })).status, 400)
  assert.equal((await post(host, '/view', { ...REPORT, url: 'javascript:alert(1)' })).status, 400)
  assert.equal((await post(host, '/view', { ...REPORT, w: 3 })).status, 400)
  assert.deepEqual((await post(host, '/view', { sessionId: 'session-a', visible: false })).body, {
    ok: true,
    kept: false
  })
  assert.equal(host.docker.calls.length, 0, 'nothing was drawn for any of them')
})

test('a site with the feature turned off keeps nothing and pictures nothing', async () => {
  const host = boot({ config: { plugin: { viewContext: false } } })
  const cwd = site()
  assert.deepEqual((await post(host, '/view', REPORT)).body, { ok: true, kept: false })
  const messages = await step(host, { cwd, message: customer('make the title bigger') })
  assert.equal(pictured(messages).length, 0)
  assert.equal(host.docker.calls.length, 0)
})

// ── the step ───────────────────────────────────────────────────────────────────────────────────────

test('a message with words alone is given the picture, after it, as a notice the chat does not draw', async () => {
  const host = boot()
  const cwd = site()
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  const message = customer('make the title bigger')
  const messages = await step(host, { cwd, message })
  const notices = pictured(messages)
  assert.equal(notices.length, 1)
  const [notice] = notices
  // Not the customer's: a context row, so dsh does not draw it as a bubble.
  assert.equal(notice.role, 'user')
  assert.equal(notice.source.kind, 'tracy-site')
  assert.equal(notice.source.form, 'notice')
  assert.equal(notice.source.summary, 'the page the customer has open: /pricing')
  assert.equal(notice.content[0].type, 'text')
  assert.match(notice.content[0].text, /on the page \/pricing, scrolled 1180 px down, in a 640×800 window/)
  assert.deepEqual(notice.content[1], { type: 'image', attachment: REF })
  // After the customer's words, so the cached prefix in front of them does not move.
  assert.ok(messages.indexOf(notice) > messages.indexOf(message))
  // The picture went to the store as a JPEG under the plain name.
  assert.equal(host.saved.length, 1)
  assert.equal(host.saved[0].mediaType, 'image/jpeg')
  assert.deepEqual(host.saved[0].data, JPEG)
})

test('every message gets the picture: the same page in the same state serves them all, and a changed page is drawn again', async () => {
  const host = boot()
  const cwd = site()
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 1)
  assert.equal(pictured(await step(host, { cwd, message: customer('and a bit bluer') })).length, 1)
  assert.equal(
    host.docker.calls.filter((c) => c.kind === 'browser').length,
    1,
    'the second message reuses the picture: nothing is drawn again for it'
  )
  // The agent's edit refreshed the page: the next message is given a fresh one.
  await post(host, '/view', { ...REPORT, warm: false, changed: true })
  const again = await step(host, { cwd, message: customer('now the footer') })
  assert.equal(pictured(again).length, 1)
  const browsers = host.docker.calls.filter((c) => c.kind === 'browser')
  assert.equal(browsers.length, 2, 'drawn again after the change, not before')
})

test('🔒 a customer who attached pictures of their own still gets the page picture — in addition, theirs untouched and named as theirs', async () => {
  const host = boot()
  const cwd = site()
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  const mine = {
    type: 'image',
    attachment: { attachmentId: `sha256:${'d'.repeat(64)}`, mediaType: 'image/png' }
  }
  const message = customer([mine, { type: 'text', text: 'use this for the header' }])
  const messages = await step(host, { cwd, message })
  const notices = pictured(messages)
  assert.equal(notices.length, 1, 'at least one picture on every message')
  assert.deepEqual(
    message.content[0],
    mine,
    'their own picture is untouched, and still first in their message'
  )
  assert.equal(message.content.length, 2)
  assert.ok(messages.indexOf(notices[0]) > messages.indexOf(message), 'the page comes after theirs')
  // The notice tells the two apart, and its rule against mentioning is about the page only.
  assert.match(notices[0].content[0].text, /It is not one of the pictures they attached/)
  assert.match(notices[0].content[0].text, /use and answer them as they ask, and say when you used one/)
  assert.deepEqual(notices[0].content[1], { type: 'image', attachment: REF })
  // Only the page picture went to the store: the customer's own was admitted by dsh already.
  assert.equal(host.saved.length, 1)
  // …and even a message that is nothing but their picture is given the page.
  assert.equal(pictured(await step(host, { cwd, message: customer([mine]) })).length, 1)
  // A message without pictures of their own carries no words about them.
  const plain = pictured(await step(host, { cwd, message: customer('now make it bigger') }))[0]
  assert.doesNotMatch(plain.content[0].text, /attached/)
})

test('a Browser-tab comment is given the picture when one is READY: it names its element, the page shows the rest', async () => {
  const host = boot()
  const cwd = site()
  await post(host, '/view', REPORT)
  await drawn(host)
  const comment = customer(commentTurn())
  assert.equal(pictured(await step(host, { cwd, message: comment })).length, 1)
  // Every later comment of the page in the same state is given the same picture, nothing drawn again.
  assert.equal(pictured(await step(host, { cwd, message: customer(commentTurn('And bluer')) })).length, 1)
  assert.equal(host.docker.calls.filter((c) => c.kind === 'browser').length, 1)
})

test('🔒 a Browser-tab comment does not wait for a picture that is not there, and draws none of its own', async () => {
  const host = boot()
  const cwd = site()
  // The tab said which page it shows; nobody typed in the composer, so nothing was drawn for it.
  await post(host, '/view', { ...REPORT, warm: false })
  const comment = customer(commentTurn())
  const started = Date.now()
  const messages = await step(host, { cwd, message: comment })
  assert.ok(Date.now() - started < 200, 'the first step does not wait for a picture')
  assert.equal(pictured(messages).length, 0)
  assert.ok(messages.includes(comment), 'the comment still goes through')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(host.docker.calls.length, 0, 'no curl and no browser: the site container was not touched')
  // Words are not a comment: the next of them is drawn for on demand and given the picture, as before.
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 1)
  assert.equal(host.docker.calls.filter((c) => c.kind === 'browser').length, 1)
})

test('🔒 a comment does not wait for a picture still being drawn; words do, and are given it', async () => {
  const { host, release } = slowBrowser()
  const cwd = site()
  try {
    await post(host, '/view', REPORT) // the draw starts while they type, and stays open
    await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
    const started = Date.now()
    const messages = await step(host, { cwd, message: customer(commentTurn()) })
    assert.ok(Date.now() - started < 200, 'a comment does not wait for the picture in the making')
    assert.equal(pictured(messages).length, 0)
    assert.equal(
      host.docker.calls.filter((c) => c.kind === 'browser').length,
      1,
      'and starts no second draw beside it'
    )
    // Words wait for it exactly as they always did.
    let waited = true
    const words = step(host, { cwd, message: customer('make the title bigger') }).then((out) => {
      waited = false
      return out
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(waited, true, 'words are still waiting for the picture on its way')
    release()
    assert.equal(pictured(await words).length, 1)
  } finally {
    release()
  }
})

test('a step that carries both kinds is decided by the LAST message: a comment last does not wait, words last do', async () => {
  const { host, release } = slowBrowser()
  const cwd = site()
  const comment = customer(commentTurn())
  const words = customer('and make the title bigger')
  try {
    await post(host, '/view', REPORT)
    await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
    const started = Date.now()
    assert.equal(pictured(await step(host, { cwd, messages: [words, comment] })).length, 0)
    assert.ok(Date.now() - started < 200, 'a comment last: no wait')
    let waited = true
    const last = step(host, { cwd, messages: [comment, words] }).then((out) => {
      waited = false
      return out
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(waited, true, 'words last: the wait it always was')
    release()
    assert.equal(pictured(await last).length, 1)
  } finally {
    release()
  }
})

test('🔒 while the conversation’s own turn is running nothing is drawn for a customer writing ahead; the next message gets its picture as it starts', async () => {
  const host = boot()
  const cwd = site()
  const agent = { session: { id: 'session-a', header: { cwd } } }
  const status = (value) => {
    for (const fn of host.listeners.get('agent/status') ?? []) fn({ agent, status: value })
  }
  status('running')
  try {
    await post(host, '/view', REPORT)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(host.docker.calls.length, 0, 'the agent may be building: no Chromium beside it')
  } finally {
    status('idle')
  }
  const messages = await step(host, { cwd, message: customer('make the title bigger') })
  assert.equal(pictured(messages).length, 1, 'drawn on demand once the turn is over')
  assert.ok(host.docker.calls.some((c) => c.kind === 'browser'))
})

test('a model that does not read pictures is sent none', async () => {
  const host = boot({ model: ['text'] })
  const cwd = site()
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 0)
  assert.equal(host.saved.length, 0)
})

test('🔒 a view reported for one site is not given to a conversation standing in another', async () => {
  const host = boot()
  const cwd = site('site2')
  // The report came through site1's mount; the conversation's workspace is site2.
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 0)
})

test('a conversation with no open page, or whose Browser tab went away, gets no picture and no wait', async () => {
  const host = boot()
  const cwd = site()
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 0)
  await post(host, '/view', REPORT)
  await settle(() => host.docker.calls.some((c) => c.kind === 'browser'))
  await post(host, '/view', { sessionId: 'session-a', visible: false })
  assert.equal(pictured(await step(host, { cwd, message: customer('make the title bigger') })).length, 0)
})

test('🔒 a picture that could not be drawn, or stored, never stops the turn', async () => {
  const cwd = site()
  const broken = boot({
    config: {
      docker: {
        browser: () => ({
          code: 1,
          stdout: 'TRACY_BROWSER ERR chromium exited (1)',
          stderr: '',
          timedOut: false
        })
      }
    }
  })
  await post(broken, '/view', REPORT)
  await settle(() => broken.docker.calls.some((c) => c.kind === 'browser'))
  const one = customer('make the title bigger')
  const messages = await step(broken, { cwd, message: one })
  assert.equal(pictured(messages).length, 0)
  assert.ok(messages.includes(one), 'the customer’s message still goes through')

  const refusing = boot({ store: { error: new Error('IMAGE_DIMENSION_TOO_LARGE') } })
  await post(refusing, '/view', REPORT)
  await settle(() => refusing.docker.calls.some((c) => c.kind === 'browser'))
  const two = customer('make the title bigger')
  assert.equal(pictured(await step(refusing, { cwd, message: two })).length, 0)
})
