import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
const source = readFileSync(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
function fixture() {
  const calls = [],
    messages = [],
    listeners = {},
    removed = []
  let frame = null,
    html = '',
    legacyRenders = 0
  const session = {
    sessionId: 'session-widget-00000000-0000-4000-8000-000000000001',
    url: '/widget/native/s/session-widget-00000000-0000-4000-8000-000000000001',
    expandedUrl: '/new/s/session-widget-00000000-0000-4000-8000-000000000001'
  }
  const stage = {
    classList: { remove() {} },
    set innerHTML(value) {
      html = value
      frame = {
        dataset: { session: session.sessionId },
        contentWindow: { postMessage: (...args) => messages.push(args) }
      }
    }
  }
  const context = vm.createContext({
    nativeSession: null,
    nativeOpening: null,
    nativeVoiceWanted: false,
    voiceOn: true,
    pendingDraft: 'Uncertain earlier words',
    state: null,
    stage,
    location: { origin: 'https://widget.example.test' },
    e: String,
    document: { body: { classList: { add() {} } }, getElementById: () => frame, querySelector: () => null },
    window: { addEventListener: (type, callback) => (listeners[type] = callback) },
    sessionStorage: { removeItem: (key) => removed.push(key) },
    stopVoice: async () => {
      calls.push('stop-mic')
    },
    player: { close: async () => calls.push('stop-playback') },
    api: async (path) => {
      calls.push(path)
      return path.endsWith('/open') ? session : { history: [], guest: true }
    },
    render: () => {
      legacyRenders++
    }
  })
  vm.runInContext(
    source.slice(source.indexOf('function nativeFrame()'), source.indexOf('function render()')),
    context
  )
  return {
    context,
    calls,
    messages,
    removed,
    session,
    get frame() {
      return frame
    },
    get html() {
      return html
    },
    get renders() {
      return legacyRenders
    },
    message: (data) => listeners.message(data)
  }
}
test('concurrent native entry opens once after old audio stops and expands the same session', async () => {
  const f = fixture()
  await Promise.all([f.context.enterNative(), f.context.enterNative()])
  assert.deepEqual(f.calls, ['stop-mic', 'stop-playback', '/widget/api/native/open'])
  assert.ok(f.html.includes(f.session.url))
  assert.ok(f.html.includes(f.session.expandedUrl))
  assert.equal(f.context.player, null)
  await f.context.enterNative()
  assert.equal(f.calls.length, 3)
})
test('only the mounted same-origin frame can receive the manual draft and acknowledge ownership', async () => {
  const f = fixture()
  await f.context.enterNative()
  const event = {
    origin: 'https://widget.example.test',
    source: f.frame.contentWindow,
    data: { type: 'tracy-widget-native-ready', sessionId: f.session.sessionId }
  }
  for (const bad of [
    { ...event, origin: 'https://foreign.test' },
    { ...event, source: {} },
    { ...event, data: { ...event.data, sessionId: 'another-session' } }
  ])
    f.message(bad)
  assert.equal(f.messages.length, 0)
  f.message(event)
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages)), [
    [
      {
        type: 'tracy-widget-native-draft',
        sessionId: f.session.sessionId,
        text: 'Uncertain earlier words',
        startVoice: true
      },
      'https://widget.example.test'
    ]
  ])
  assert.equal(f.context.pendingDraft, 'Uncertain earlier words')
  f.message({ ...event, data: { type: 'tracy-widget-native-draft-kept', sessionId: f.session.sessionId } })
  assert.equal(f.context.pendingDraft, '')
  assert.deepEqual(f.removed, ['tracy-widget-pending-draft'])
  assert.equal(
    f.calls.some((path) => path.includes('/turn') || path.includes('/create')),
    false
  )
})
test('verified frame sign-out needs no session id and returns to guest state without replay', async () => {
  const f = fixture()
  await f.context.enterNative()
  const event = {
    origin: 'https://widget.example.test',
    source: f.frame.contentWindow,
    data: { type: 'tracy-widget-native-signed-out' }
  }
  f.message({ ...event, source: {} })
  assert.ok(f.context.nativeSession)
  f.message(event)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(f.context.nativeSession, null)
  assert.equal(f.context.state.guest, true)
  assert.equal(f.renders, 1)
  assert.deepEqual(f.calls, ['stop-mic', 'stop-playback', '/widget/api/native/open', '/widget/api/state'])
})

test('welcome rendering preserves an adopted native frame with empty discovery history', async () => {
  const f = fixture()
  await f.context.enterNative()
  vm.runInContext(
    source.slice(source.indexOf('function renderWelcome()'), source.indexOf('function visibleRows()')),
    f.context
  )
  f.context.state = { history: [] }
  const before = f.html
  f.context.renderWelcome()
  assert.equal(f.html, before)
  assert.ok(f.html.includes(f.session.url))
})
