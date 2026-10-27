import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  CLIENT_CHAT_MODE,
  LOGO_RESEARCH_PENDING,
  pendingDelay,
  prepareWhenReady,
  clientChatEntry,
  clientChatState,
  preparedChatHref,
  readChatCarry,
  receiveClientDemoChat,
  sendClientDemoBrief,
  startClientDemoChat,
  waitForChat
} from '../src/client/client-demo-chat.ts'

const id = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const nativeId = '33333333-3333-4333-8333-333333333333'
const winningId = '44444444-4444-4444-8444-444444444444'
const digest = (text) => createHash('sha256').update(text).digest('hex')
function fixture(actionId = id) {
  const sessionId = `wo-demo-${actionId}`,
    siteKey = actionId === id ? 'new-place.tracy.test' : 'next-place.tracy.test'
  const text = 'Build a demo for Real Place using Joomla and JA Essence. Read its real reviews and photos.'
  return {
    action: {
      id: actionId,
      opportunityId: 'place',
      workflow: 'agent-demo/1',
      chatMode: CLIENT_CHAT_MODE,
      state: 'queued'
    },
    chat: { siteKey, sessionId, href: `/${siteKey}/s/${sessionId}` },
    brief: { text, hash: digest(text) }
  }
}
const ok = (body) => ({ ok: true, status: 200, body })
function storage() {
  const map = new Map()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  }
}
function harness(prepared = fixture(), override = {}) {
  const events = []
  const session = {
    getSnapshot: () => ({}),
    beginSubmission: (input) => {
      events.push(['echo', input])
      return { requestId: nativeId, abandon: () => events.push(['abandon']) }
    },
    prompt: async (...args) => {
      events.push(['prompt', ...args])
      return { ok: true }
    },
    ...override
  }
  const api = {
    reserveDemoChatSend: async (actionId, input) => {
      events.push(['reserve', actionId, input])
      return ok({ ...prepared, submission: { nativeRequestId: input.nativeRequestId, state: 'reserved' } })
    }
  }
  return { session, events, api }
}

test('a CMS choice prepares only a claimed chat and carries IDs before opening it', async () => {
  const prepared = fixture(),
    saved = storage(),
    opened = [],
    calls = []
  assert.equal(
    await startClientDemoChat([prepared.action], {
      api: {
        prepareDemoChat: async (actionId) => {
          calls.push(actionId)
          return ok(prepared)
        }
      },
      storage: saved,
      current: () => true,
      open: (href) => {
        assert.deepEqual(readChatCarry(saved).actions, [id])
        opened.push(href)
      }
    }),
    true
  )
  assert.deepEqual(calls, [id])
  assert.match(opened[0], /wo-demo-chat=11111111/)
  assert.equal(
    new URL(opened[0], 'https://tracy.test').searchParams.get('tab'),
    'tracy:website-opportunities'
  )
  assert.ok(!JSON.stringify(readChatCarry(saved)).includes(prepared.brief.text))
  assert.equal(
    await startClientDemoChat([{ ...prepared.action, chatMode: undefined }], {
      api: {},
      storage: saved,
      current: () => true,
      open() {
        throw Error('old action')
      }
    }),
    false
  )
})

test('a chat whose logo research is still pending is prepared again until the brief is made', async () => {
  const prepared = fixture(),
    opened = [],
    calls = [],
    waits = []
  const pending = { ok: false, status: 409, code: LOGO_RESEARCH_PENDING }
  const answers = [pending, pending]
  // What the page says, in order: the logo line while the research is pending, gone before the chat opens.
  const said = []
  assert.equal(
    await startClientDemoChat([prepared.action], {
      api: {
        prepareDemoChat: async (actionId) => {
          said.push('prepare')
          calls.push(actionId)
          return answers.shift() ?? ok(prepared)
        }
      },
      storage: storage(),
      current: () => true,
      open: (href) => {
        said.push('open')
        opened.push(href)
      },
      wait: async (ms) => {
        waits.push(ms)
      },
      onLogoWait: (waiting) => said.push(waiting ? 'logo line shown' : 'logo line gone')
    }),
    true
  )
  assert.deepEqual(calls, [id, id, id])
  assert.equal(waits.length, 2)
  assert.equal(opened.length, 1)
  assert.deepEqual(said, ['prepare', 'logo line shown', 'prepare', 'prepare', 'logo line gone', 'open'])
  // Any other refusal, a page left, or a wait past the server's minute is answered as it is, at once.
  const refused = { ok: false, status: 409, code: 'NOT_GRANTED' }
  assert.deepEqual(
    await prepareWhenReady({ prepareDemoChat: async () => refused }, id, {
      current: () => true,
      wait: async () => {}
    }),
    refused
  )
  let tries = 0
  assert.deepEqual(
    await prepareWhenReady(
      {
        prepareDemoChat: async () => {
          tries++
          return pending
        }
      },
      id,
      { current: () => tries < 3, wait: async () => {} }
    ),
    pending
  )
  assert.equal(tries, 3)
  tries = 0
  await prepareWhenReady(
    {
      prepareDemoChat: async () => {
        tries++
        return pending
      }
    },
    id,
    { current: () => true, wait: async () => {} }
  )
  assert.ok(tries > 1 && tries <= 40, `bounded: ${tries}`)
})

test('a pending logo research is asked again every 3 s, sooner only when its retryAt deadline is nearer', async () => {
  const at = Date.parse('2026-10-24T10:00:00Z')
  const waits = []
  const answers = [
    { ok: false, status: 409, code: LOGO_RESEARCH_PENDING, retryAt: '2026-10-24T10:00:45.000Z' },
    { ok: false, status: 409, code: LOGO_RESEARCH_PENDING }
  ]
  const done = { ok: true, status: 200, body: {} }
  assert.deepEqual(
    await prepareWhenReady({ prepareDemoChat: async () => answers.shift() ?? done }, id, {
      current: () => true,
      now: () => at,
      wait: async (ms) => {
        waits.push(ms)
      }
    }),
    done
  )
  assert.deepEqual(waits, [3_000, 3_000])
  // The research can finish long before its deadline, so a far deadline never lengthens the beat; a near one
  // shortens it, and one already past never makes the loop spin.
  assert.equal(pendingDelay('2026-10-24T09:59:00.000Z', at), 500)
  assert.equal(pendingDelay('soon', at), 3_000)
  assert.equal(pendingDelay('2026-10-24T11:00:00.000Z', at), 3_000)
  assert.equal(pendingDelay('2026-10-24T10:00:02.000Z', at), 2_000)
})

test('the frontend uses the actual composer submission and native user prompt without touching another draft', async () => {
  const p = fixture(),
    h = harness(p)
  h.session.draft = 'words in the previous conversation'
  await sendClientDemoBrief(p, { ...h, current: () => true })
  assert.deepEqual(
    h.events.map((e) => e[0]),
    ['echo', 'reserve', 'prompt']
  )
  assert.deepEqual(h.events[0][1], { mode: 'queue', text: p.brief.text, attachments: [] })
  assert.deepEqual(h.events[2].slice(1), [
    [{ type: 'text', text: p.brief.text }],
    'queue',
    undefined,
    nativeId
  ])
  assert.equal(h.session.draft, 'words in the previous conversation')
})

test('two tabs adopt the winning native identity, abandoning only the unused local echo', async () => {
  const p = fixture(),
    h = harness(p)
  h.api.reserveDemoChatSend = async () =>
    ok({ ...p, submission: { nativeRequestId: winningId, state: 'reserved' } })
  await sendClientDemoBrief(p, { ...h, current: () => true })
  assert.deepEqual(
    h.events.map((e) => e[0]),
    ['echo', 'abandon', 'prompt']
  )
  assert.equal(h.events.at(-1).at(-1), winningId)
})

test('reload after an observed native message creates no pending echo and dispatches no second prompt', async () => {
  const p = { ...fixture(), submission: { nativeRequestId: winningId, state: 'observed' } },
    h = harness(p)
  h.api.reserveDemoChatSend = async () => ok(p)
  await sendClientDemoBrief(p, { ...h, current: () => true })
  assert.deepEqual(h.events, [])
})

test('an uncertain dispatch reuses the same native request after reload, without a second charged admission', async () => {
  const p = fixture(),
    admitted = new Set(),
    h = harness(p, {
      prompt: async (_content, _mode, _signal, requestId) => {
        admitted.add(requestId)
        throw Error('lost reply')
      }
    })
  await assert.rejects(sendClientDemoBrief(p, { ...h, current: () => true }), /lost reply/)
  const retry = harness(
    { ...p, submission: { nativeRequestId: nativeId, state: 'reserved' } },
    {
      prompt: async (_content, _mode, _signal, requestId) => {
        admitted.add(requestId)
        return { ok: true }
      }
    }
  )
  await sendClientDemoBrief(
    { ...p, submission: { nativeRequestId: nativeId, state: 'reserved' } },
    { ...retry, current: () => true }
  )
  assert.equal(admitted.size, 1)
  assert.ok(!retry.events.some((e) => e[0] === 'echo'))
})

test('a changed brief, foreign session receipt or navigation during admission never sends to the agent', async () => {
  const p = fixture(),
    h = harness(p)
  await assert.rejects(
    sendClientDemoBrief({ ...p, brief: { ...p.brief, text: 'changed' } }, { ...h, current: () => true }),
    /CHANGED_BRIEF/
  )
  assert.deepEqual(h.events, [])
  h.api.reserveDemoChatSend = async () =>
    ok({
      ...p,
      chat: { ...p.chat, sessionId: 'someone-else' },
      submission: { nativeRequestId, state: 'reserved' }
    })
  const nativeRequestId = nativeId
  await assert.rejects(sendClientDemoBrief(p, { ...h, current: () => true }), /INVALID_RECEIPT/)
  assert.ok(!h.events.some((e) => e[0] === 'prompt'))
  let active = true
  h.api.reserveDemoChatSend = async () => {
    active = false
    return ok({ ...p, submission: { nativeRequestId, state: 'reserved' } })
  }
  await assert.rejects(sendClientDemoBrief(p, { ...h, current: () => active }), /LEFT/)
  assert.ok(!h.events.some((e) => e[0] === 'prompt'))
})

test('only the exact new session is opened, never any existing conversation in the workspace', async () => {
  const p = fixture(),
    h = harness(p),
    opened = []
  let main = false
  const services = {
    sessions: {
      list: {
        getSnapshot: () => ({
          phase: 'ready',
          byId: {
            old: { retainedBy: { mainView: main ? 0 : 1 } },
            [p.chat.sessionId]: { retainedBy: { mainView: main ? 1 : 0 } }
          }
        })
      },
      binding: (sid) => ({ session: sid === p.chat.sessionId ? h.session : null })
    },
    get: () => ({
      openSession: (sid) => {
        opened.push(sid)
        main = true
      }
    })
  }
  assert.equal(
    await waitForChat(services, p.chat.sessionId, { current: () => true, wait: async () => {}, tries: 2 }),
    h.session
  )
  assert.deepEqual(opened, [p.chat.sessionId])
  await assert.rejects(
    waitForChat(services, 'absent', { current: () => true, wait: async () => {}, tries: 1 }),
    /UNAVAILABLE/
  )
})

test('unsafe chat URLs and preparing a different action refuse navigation', async () => {
  const p = fixture()
  assert.throws(() => preparedChatHref({ ...p, chat: { ...p.chat, href: 'https://evil.test/a' } }), /INVALID/)
  assert.throws(() => preparedChatHref({ ...p, chat: { ...p.chat, href: '/another/s/session' } }), /INVALID/)
  await assert.rejects(
    startClientDemoChat([p.action], {
      api: { prepareDemoChat: async () => ok(fixture(secondId)) },
      storage: storage(),
      current: () => true,
      open() {
        throw Error('must not open')
      }
    }),
    /INVALID/
  )
})

test('bulk advances only after each real frontend send, then returns to the first conversation', async () => {
  const first = fixture(),
    second = fixture(secondId),
    saved = storage(),
    opened = [],
    sent = []
  const all = new Map([
    [id, first],
    [secondId, second]
  ])
  const api = {
    prepareDemoChat: async (actionId) => ok(all.get(actionId)),
    reserveDemoChatSend: async (actionId, input) =>
      ok({ ...all.get(actionId), submission: { nativeRequestId: input.nativeRequestId, state: 'reserved' } })
  }
  await startClientDemoChat([first.action, second.action], {
    api,
    storage: saved,
    current: () => true,
    open: (href) => opened.push(href)
  })
  for (const p of [first, second]) {
    const location = { pathname: p.chat.href, search: new URL(clientChatEntry(p), 'https://local').search }
    const h = harness(p, {
      prompt: async () => {
        sent.push(p.action.id)
        return { ok: true }
      }
    })
    const services = {
      sessions: {
        list: {
          getSnapshot: () => ({
            phase: 'ready',
            byId: { [p.chat.sessionId]: { retainedBy: { mainView: 1 } } }
          })
        },
        binding: () => ({ session: h.session })
      }
    }
    const previous = opened.length
    const stop = receiveClientDemoChat({
      api,
      services,
      location,
      storage: saved,
      replaceUrl() {},
      open: (href) => opened.push(href)
    })
    for (let i = 0; i < 30 && opened.length === previous; i++) await new Promise((r) => setTimeout(r, 1))
    assert.equal(clientChatState.getSnapshot().phase, 'sent')
    stop?.()
  }
  assert.deepEqual(sent, [id, secondId])
  assert.match(opened[1], new RegExp(secondId))
  assert.equal(opened[2], first.chat.href)
  assert.equal(readChatCarry(saved), null)
})

test('on a plain-http stand (no crypto.subtle) the brief still goes out; the send door keeps the hash check', async () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a) => a }, configurable: true })
  try {
    const p = fixture(),
      h = harness(p)
    await sendClientDemoBrief(p, { ...h, current: () => true })
    assert.deepEqual(
      h.events.map((e) => e[0]),
      ['echo', 'reserve', 'prompt']
    )
    assert.equal(h.events[1][2].briefHash, p.brief.hash)
  } finally {
    Object.defineProperty(globalThis, 'crypto', real)
  }
})

test('in the chat, the delivery says it looks for the logo while the research is pending, and stops saying it after', async () => {
  const p = fixture()
  const seen = []
  const unsubscribe = clientChatState.subscribe(() => {
    const now = clientChatState.getSnapshot()
    seen.push(`${now.phase}${now.logo ? ' logo' : ''}`)
  })
  const pending = { ok: false, status: 409, code: LOGO_RESEARCH_PENDING }
  const answers = [pending, pending]
  const h = harness(p)
  const stop = receiveClientDemoChat({
    api: {
      prepareDemoChat: async () => answers.shift() ?? ok(p),
      reserveDemoChatSend: h.api.reserveDemoChatSend
    },
    services: {
      sessions: {
        list: {
          getSnapshot: () => ({
            phase: 'ready',
            byId: { [p.chat.sessionId]: { retainedBy: { mainView: 1 } } }
          })
        },
        binding: () => ({ session: h.session })
      }
    },
    location: { pathname: p.chat.href, search: new URL(clientChatEntry(p), 'https://local').search },
    storage: storage(),
    replaceUrl() {},
    open() {},
    wait: async () => {}
  })
  for (let i = 0; i < 30 && clientChatState.getSnapshot().phase !== 'sent'; i++)
    await new Promise((r) => setTimeout(r, 1))
  stop?.()
  unsubscribe()
  assert.deepEqual(seen, ['sending', 'sending logo', 'sending', 'sent'])
})
