/**
 * The moment on the host's one dsh: which site it names and whose signature it carries.
 *
 *   node --test packages/site/tracy-site-tabs/test/moment.test.mjs
 *
 * Two halves. `hostMomentRequest` is the pure reading of an idle session. The built `lib/index.js`
 * is then driven end to end — the bundle the fleet image copies — to pin that a lane still records as
 * its viewer while the host dsh never borrows that viewer's cookie.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'

import { buildCommentTurn, parseCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import { hostMomentRequest, momentTitle } from '../src/host/moment.mjs'

/** A sites root holding `lantern`, with `.tracy/site.json` unless told otherwise. */
function sitesRoot({ siteJson = { siteKey: 'lantern.tracy.ai', platform: 'wordpress' } } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-moment-'))
  mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
  if (siteJson !== null)
    writeFileSync(path.join(root, 'lantern', '.tracy', 'site.json'), JSON.stringify(siteJson))
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

/** A session's log whose last prompt the gate stamped with `email`. */
const stamped = (email) => [
  {
    type: 'user/message',
    data: {
      source: { kind: 'user', prompter: { user: 'Ada', email } },
      content: [{ type: 'text', text: 'Fix the footer' }]
    }
  }
]

/** The gate's signer, recording whom it signed for. */
function signer() {
  const minted = []
  return { minted, mint: (email) => (minted.push(email), `signed:${email}`) }
}

test('names the site folder, reads its key from site.json, and signs as the person who typed', async () => {
  const s = sitesRoot()
  try {
    const gate = signer()
    const request = await hostMomentRequest({
      cwd: path.join(s.root, 'lantern', 'TracyWork'),
      events: stamped('ada@example.com'),
      origin: 'https://cowork.tracy.ai/',
      signer: gate,
      env: { TRACY_SITES_ROOT: s.root }
    })
    assert.deepEqual(request, {
      ok: true,
      url: 'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/moment',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-tracy-actor': 'signed:ada@example.com',
        'x-tracy-workspace-label': 'lantern'
      }
    })
    assert.deepEqual(gate.minted, ['ada@example.com'])
  } finally {
    s.dispose()
  }
})

test('a folder with no readable site.json still records: the door resolves _conversation from the label', async () => {
  for (const siteJson of [null, { platform: 'joomla' }]) {
    const s = sitesRoot({ siteJson })
    try {
      const request = await hostMomentRequest({
        cwd: path.join(s.root, 'lantern'),
        events: stamped('ada@example.com'),
        origin: 'https://cowork.tracy.ai',
        signer: signer(),
        env: { TRACY_SITES_ROOT: s.root }
      })
      assert.equal(request.ok, true)
      assert.equal(request.url, 'https://cowork.tracy.ai/api/sites/_conversation/moment')
      assert.equal(request.headers['x-tracy-workspace-label'], 'lantern')
    } finally {
      s.dispose()
    }
  }
})

test('a session outside every site folder has nothing to record, and says nothing per turn', async () => {
  const s = sitesRoot()
  try {
    // A literal `..` climbs out while keeping a label that looks right; `siteOf` refuses it.
    for (const cwd of ['/desk-home/onboarding/abc', `${s.root}/lantern/../harbor`, s.root, undefined]) {
      const gate = signer()
      const request = await hostMomentRequest({
        cwd,
        events: stamped('ada@example.com'),
        origin: 'https://cowork.tracy.ai',
        signer: gate,
        env: { TRACY_SITES_ROOT: s.root }
      })
      assert.deepEqual(request, { ok: false, reason: null }, String(cwd))
      assert.deepEqual(gate.minted, [], 'nothing is signed for a session that records nothing')
    }
  } finally {
    s.dispose()
  }
})

test('without a person to sign for, a signer, or an origin, it refuses by name and signs nothing', async () => {
  const s = sitesRoot()
  try {
    const base = {
      cwd: path.join(s.root, 'lantern'),
      events: stamped('ada@example.com'),
      origin: 'https://cowork.tracy.ai',
      env: { TRACY_SITES_ROOT: s.root }
    }
    // A gate master account names a user but no address: nobody the seat book could check.
    const unstamped = [
      { type: 'user/message', data: { source: { kind: 'user', prompter: { user: 'admin', email: '' } } } }
    ]
    const gate = signer()
    const noPerson = await hostMomentRequest({ ...base, events: unstamped, signer: gate })
    assert.equal(noPerson.ok, false)
    assert.match(noPerson.reason, /email/)
    assert.deepEqual(gate.minted, [])

    const noSigner = await hostMomentRequest({ ...base, signer: undefined })
    assert.equal(noSigner.ok, false)
    assert.match(noSigner.reason, /cannot sign/)
    const refusing = await hostMomentRequest({ ...base, signer: { mint: () => null } })
    assert.equal(refusing.ok, false)

    const noOrigin = await hostMomentRequest({ ...base, origin: null, signer: signer() })
    assert.equal(noOrigin.ok, false)
    assert.match(noOrigin.reason, /MCP_TRACY_ORIGIN/)
  } finally {
    s.dispose()
  }
})

/** One Browser-tab comment turn, built by the chat input's own builder. */
const commentTurn = (text, { incomplete = false } = {}) =>
  buildCommentTurn({
    text,
    element: {
      url: 'https://acbw2709.tracy.site/',
      selector: '#wp--skip-link--target > div > h2',
      label: 'heading',
      text: 'Our services',
      marks: ['post:12']
    },
    locate: {
      status: 'resolved',
      ...(incomplete ? { incomplete: true } : {}),
      levels: [{ kind: 'block', id: 'wp:12:3', label: 'Our services', writable: true }]
    }
  })

const typed = (text, kind = 'user') => ({
  type: 'user/message',
  data: { source: { kind }, content: [{ type: 'text', text }] }
})

test("🔒 a comment turn's moment is the person's sentence, never the tracy-element block (dev 28/09)", () => {
  const forms = [
    commentTurn('Make this heading red and bigger.'),
    commentTurn('Make this heading red and bigger.', { incomplete: true }),
    // A long request gets the short hint form.
    commentTurn(`Replace it with: ${'new words '.repeat(180).trim()}`),
    // An image with no words, marks or answer: the block's body is empty (dev 28/09).
    buildCommentTurn({
      text: 'Cho tao ảnh công trường xây dựng',
      element: { url: 'https://s.test/', selector: 'main img', label: 'hero.webp', text: '', marks: [] },
      locate: null
    })
  ]
  for (const turn of forms) {
    const title = momentTitle([typed(turn)])?.title
    assert.ok(title !== undefined && !title.includes('tracy-element') && !title.includes('tracy_site'), title)
    // The same bytes the transcript's chip reads back, squeezed to one line and whole (no hard cut
    // at 200 since the dev round, 02/10: Tracy cuts the commit subject between words itself).
    const request = parseCommentTurn(turn)?.request ?? ''
    assert.equal(title, request.replace(/\s+/g, ' ').trim())
  }
  assert.deepEqual(momentTitle([typed(forms[0])]), { title: 'Make this heading red and bigger.', index: 0 })
})

test("several comments in one turn: the first comment's words, then +N for the others", () => {
  const pin = (n, text, url) => ({
    n,
    text,
    element: { url, selector: 'main h1', label: 'x', text: 'Page words', marks: [] },
    locate: null
  })
  const two = buildCommentTurn({
    items: [
      pin(1, 'Change the heading\nto something shorter', 'https://s.test/'),
      pin(3, 'Swap the photo', 'https://s.test/a')
    ]
  })
  assert.deepEqual(momentTitle([typed(two)]), {
    title: 'Change the heading to something shorter +1',
    index: 0
  })
  const three = buildCommentTurn({
    items: [
      pin(2, 'Fix the footer', 'https://s.test/'),
      pin(4, 'b', 'https://s.test/'),
      pin(5, 'c', 'https://s.test/')
    ]
  })
  const title = momentTitle([typed(three)])?.title ?? ''
  assert.equal(title, 'Fix the footer +2')
  assert.ok(!title.includes('tracy_site') && !title.includes('Page words'), title)
  // One comment in the list form is a one-comment turn: no count.
  assert.equal(
    momentTitle([typed(buildCommentTurn({ items: [pin(1, 'Just this', 'https://s.test/')] }))])?.title,
    'Just this'
  )
})

test('comments about whole pages (tracy-page blocks, plan "comment review" H4): the same title, no page block in it', () => {
  const page = (n, text, url) => ({ n, text, element: null, locate: null, url })
  const onlyPages = buildCommentTurn({
    items: [
      page(3, 'Use the new phone number', 'https://s.test/'),
      page(4, 'Add the address', 'https://s.test/about')
    ]
  })
  assert.deepEqual(momentTitle([typed(onlyPages)]), { title: 'Use the new phone number +1', index: 0 })
  const mixed = buildCommentTurn({
    items: [
      page(2, 'Use the new phone number', 'https://s.test/'),
      {
        n: 5,
        text: 'Swap the photo',
        element: { url: 'https://s.test/', selector: 'img', label: 'x', text: '', marks: [] },
        locate: null
      }
    ]
  })
  const title = momentTitle([typed(mixed)])?.title ?? ''
  assert.equal(title, 'Use the new phone number +1')
  assert.ok(!/tracy-page|<page|tracy_site/.test(title), title)
  // One page-wide comment alone is the person's words.
  assert.equal(
    momentTitle([typed(buildCommentTurn({ items: [page(1, 'Just this', 'https://s.test/')] }))])?.title,
    'Just this'
  )
})

test('a moment title is the latest person-typed text, squeezed; injected context is skipped', () => {
  const events = [typed('Fix the\n  footer'), typed('AGENTS.md reminder', 'agent-instructions')]
  assert.deepEqual(momentTitle(events), { title: 'Fix the footer', index: 0 })
  assert.equal(momentTitle([typed('   ')]), null)
  assert.equal(momentTitle([]), null)
})

test('a long prompt reaches Tracy whole: no hard cut at 200 characters (Tracy cuts the commit subject itself)', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
  assert.ok(words.length > 200)
  assert.equal(momentTitle([typed(words)])?.title, words)
  // A pasted page is still bounded: cut between words, marked "…".
  const page = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ')
  const title = momentTitle([typed(page)])?.title ?? ''
  assert.ok(title.length <= 4000, `${title.length}`)
  assert.ok(title.endsWith('…'))
  assert.ok(page.startsWith(`${title.slice(0, -1)} `))
})

// ── The built plugin ────────────────────────────────────────────────────────────────────────────

/**
 * Load `lib/index.js` afresh (its site key is read once per module instance), apply it to a fake
 * dsh with one root agent, and hand back the knobs a test turns.
 */
async function loadPlugin(instance, { cwd, events, get }) {
  const mod = await import(new URL(`../lib/index.js?${instance}`, import.meta.url).href)
  let route = null
  const handlers = {}
  const agent = {
    ctx: {
      on: (event, handler) => {
        handlers[event] = handler
        return () => {}
      }
    },
    session: { id: 'session-a1', header: { cwd }, snapshotEvents: () => events }
  }
  mod.apply({
    webServer: {
      register: (r) => {
        route = r
        return () => {}
      }
    },
    agents: { roots: () => [agent] },
    on: () => () => {},
    effect: (setup) => {
      setup()
    },
    get
  })
  const hello = (headers) =>
    new Promise((resolve) => {
      const req = Object.assign(Readable.from([Buffer.from('{}')]), {
        method: 'POST',
        url: '/api/tracy-site-tabs/hello',
        headers
      })
      route.handler(req, { writeHead: () => {}, end: resolve })
    })
  return {
    hello,
    handlers,
    idle: () => handlers['agent/status']({ status: 'idle' }),
    /** A step of turn `turn` claiming `messages`, through the pre-step waterfall. */
    step: (turn, messages) =>
      handlers['agent/pre-step']({ turn, step: 1, messages }, async () => ({ kind: 'enter', messages })),
    stopping: (turn) => handlers['agent/turn-stopping']({ turn })
  }
}

const GATEWAY_ENV = ['MCP_TRACY_SITE_KEY', 'MCP_TRACY_ORIGIN', 'DSH_PASSWORDS_ENV_FILE', 'TRACY_SITES_ROOT']

/** Swap `fetch` and the gateway env for one scenario, and wait for the moment it sends. */
async function scenario(env, run) {
  const savedFetch = globalThis.fetch
  const savedEnv = Object.fromEntries(GATEWAY_ENV.map((name) => [name, process.env[name]]))
  const sent = []
  let arrived
  const first = new Promise((resolve) => {
    arrived = resolve
  })
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), init })
    arrived()
    return new Response('{"ok":true}', { status: 200 })
  }
  for (const name of GATEWAY_ENV) delete process.env[name]
  Object.assign(process.env, env)
  try {
    await run()
    await Promise.race([first, new Promise((resolve) => setTimeout(resolve, 2000))])
    return sent
  } finally {
    globalThis.fetch = savedFetch
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('built plugin, lane: the moment still goes to the viewer origin with the viewer cookie', async () => {
  const sent = await scenario({ MCP_TRACY_SITE_KEY: 'lantern.tracy.ai' }, async () => {
    const plugin = await loadPlugin('lane', {
      cwd: '/workspace',
      events: stamped('ada@example.com'),
      get: () => ({ mint: () => 'never-used' })
    })
    await plugin.hello({ cookie: 'tracy_sess=viewer-cookie', host: 'lane.test' })
    plugin.idle()
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, 'http://lane.test/api/sites/lantern.tracy.ai/moment')
  assert.deepEqual(sent[0].init.headers, {
    'content-type': 'application/json',
    accept: 'application/json',
    cookie: 'tracy_sess=viewer-cookie'
  })
  assert.deepEqual(JSON.parse(sent[0].init.body), { title: 'Fix the footer' })
})

test('built plugin, host dsh: signed as who typed, named by the folder — never the last viewer cookie', async () => {
  const s = sitesRoot()
  try {
    const sent = await scenario(
      { MCP_TRACY_SITE_KEY: '', MCP_TRACY_ORIGIN: 'https://cowork.tracy.ai', TRACY_SITES_ROOT: s.root },
      async () => {
        const plugin = await loadPlugin('host', {
          cwd: path.join(s.root, 'lantern'),
          events: stamped('ada@example.com'),
          get: (name) => (name === 'tracyAssertion' ? { mint: (email) => `signed:${email}` } : undefined)
        })
        // Somebody else opened a page on this dsh: a process-global viewer the moment must not use.
        await plugin.hello({ cookie: 'tracy_sess=someone-else', host: 'dsh.test' })
        // On the host dsh the moment follows the TURN (plan site changes §6): opened when the
        // person's message enters a step, closed when the turn stops — an idle alone records nothing.
        plugin.idle()
        await plugin.step(
          3,
          [stamped('ada@example.com')[0].data].map((data) => ({ id: 'm-1', role: 'user', ...data }))
        )
        await plugin.stopping(3)
      }
    )
    // Turn 3 may name turns undone since the last one: its list is read early from the read-only
    // `turn/undone` door, beside the open (#1403, `REG-PR-1403-undone-read-early`).
    const door = (name) =>
      sent.find((s) => s.url === `https://cowork.tracy.ai/api/sites/lantern.tracy.ai/${name}`)
    assert.deepEqual(sent.map((s) => s.url).sort(), [
      'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/moment',
      'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn',
      'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn/undone'
    ])
    assert.deepEqual(JSON.parse(door('turn/undone').init.body), { turnId: 'session-a1:3' })
    for (const one of sent) {
      assert.deepEqual(one.init.headers, {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-tracy-actor': 'signed:ada@example.com',
        'x-tracy-workspace-label': 'lantern'
      })
    }
    assert.deepEqual(JSON.parse(door('turn').init.body), {
      turnId: 'session-a1:3',
      title: 'Fix the footer',
      source: 'panel',
      promptMessageId: 'm-1',
      rpcId: null,
      waitsForMoments: true
    })
    // dsh runs turn-stopping before it logs turn/end: a stop is `completed` (`stoppingReasonOf`).
    assert.deepEqual(JSON.parse(door('moment').init.body), {
      title: 'Fix the footer',
      turnId: 'session-a1:3',
      endReason: 'completed'
    })
  } finally {
    s.dispose()
  }
})

test('built plugin: a comment turn is recorded under the sentence the person typed', async () => {
  const events = [{ ...stamped('ada@example.com')[0] }]
  events[0] = {
    ...events[0],
    data: {
      ...events[0].data,
      content: [{ type: 'text', text: commentTurn('Make this heading red and bigger.') }]
    }
  }
  const sent = await scenario({ MCP_TRACY_SITE_KEY: 'lantern.tracy.ai' }, async () => {
    const plugin = await loadPlugin('lane-comment', { cwd: '/workspace', events, get: () => undefined })
    await plugin.hello({ cookie: 'tracy_sess=viewer-cookie', host: 'lane.test' })
    plugin.idle()
  })
  assert.equal(sent.length, 1)
  assert.deepEqual(JSON.parse(sent[0].init.body), { title: 'Make this heading red and bigger.' })
})

test('a revert request (chip + auto-send): the moment is the person’s sentence, never the tracy-revert block', () => {
  const turn =
    'Revert “Updated page About us” — only this change.\n\n```tracy-revert\nPlease revert one recorded change on the site demo.tracy.site, and only that change.\n\nRecorded: made 2026-10-02T09:00:00.000Z · source chat\n```'
  assert.deepEqual(momentTitle([typed(turn)]), {
    title: 'Revert “Updated page About us” — only this change.',
    index: 0
  })
  // Words typed with no block are untouched, a ``` in them included.
  assert.equal(momentTitle([typed('use ```tracy-revert as a word')])?.title, 'use ```tracy-revert as a word')
})

test('a block that is not on lines of its own: the moment says the element in the chip’s words, never its markup (Brian 03/10)', () => {
  const block =
    '```tracy-element\n<mentioned-element url="http://s.test/" selector="#wp--skip-link--target &gt; div" status="resolved" incomplete="true">\ntext: Our bakery\n</mentioned-element>\n```'
  assert.equal(
    momentTitle([typed(`thay ảnh này bằng ${block} nhé`)])?.title,
    'thay ảnh này bằng "Our bakery" nhé'
  )
  const page = '```tracy-page\n<page n="1" url="http://s.test/about" path="/about">\n</page>\n```'
  assert.equal(momentTitle([typed(`Tidy ${page} please`)])?.title, 'Tidy /about please')
})
