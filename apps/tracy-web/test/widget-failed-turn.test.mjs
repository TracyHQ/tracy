import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
const source = readFileSync(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
function fixture() {
  const storage = new Map(),
    requests = [],
    handlers = [],
    notices = []
  const confirmed = { role: 'user', text: 'A repeated question' }
  const context = vm.createContext({
    nativeSession: null,
    busy: false,
    auth: { active: false },
    pendingDraft: '',
    voiceGeneration: 0,
    stopSpeaking() {},
    clearTimeout() {},
    setTimeout() {
      throw Error('Unexpected retry timer')
    },
    sendTimer: null,
    link: null,
    committed: '',
    draft: '',
    preroll: [],
    loudFrames: 0,
    speech: {},
    voiceOn: true,
    reconnects: 0,
    reconnectUntil: 0,
    authOpening: false,
    talking: false,
    language: '',
    state: { history: [confirmed, { role: 'assistant', text: 'An earlier confirmed answer' }] },
    sessionStorage: { setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    render() {},
    visibleRows: () => [],
    pageSize: 12,
    mode: 'templates',
    notice: '',
    document: { getElementById: () => null },
    status() {},
    widgetSocket: () => 'wss://fixture.invalid',
    speechCursor: () => (_, words) => words,
    readySpeechFacts: (old, facts) => ({ ...old, ...facts }),
    openWidgetSpeechLink: (callbacks) => {
      handlers.push(callbacks)
      return { close() {}, stop() {} }
    },
    setNotice(text) {
      context.notice = text
      notices.push(text)
    },
    say() {},
    api: async (path, body) => {
      if (!path.endsWith('/turn')) return {}
      requests.push(body.message)
      throw Object.assign(Error('private upstream detail'), {
        code: 'MODEL_UNAVAILABLE',
        status: 502,
        reason: 'upstream'
      })
    }
  })
  vm.runInContext(
    source.slice(source.indexOf('function modelFailureMessage('), source.indexOf('function head(')),
    context
  )
  vm.runInContext(
    source.slice(source.indexOf('function keepPendingDraft('), source.indexOf('function status(')),
    context
  )
  vm.runInContext(
    source.slice(source.indexOf('async function submit('), source.indexOf('async function say(')),
    context
  )
  vm.runInContext(
    source.slice(source.indexOf('function openLink()'), source.indexOf('async function startVoice()')),
    context
  )
  return { context, storage, requests, handlers, notices, confirmed }
}
test('failed turns roll back only their optimistic row and stay manual through microphone readiness', async () => {
  const f = fixture()
  await f.context.submit('A repeated question')
  assert.equal(f.context.state.history.length, 2)
  assert.equal(f.context.state.history[0], f.confirmed)
  assert.equal(f.context.pendingDraft, 'A repeated question')
  const notice = f.context.notice
  assert.match(notice, /could not get a valid answer/)
  f.context.openLink()
  f.handlers.at(-1).onReady({ provider: 'elevenlabs' })
  assert.equal(f.context.notice, notice)
  assert.deepEqual(f.requests, ['A repeated question'])
  assert.equal(f.context.busy, false)
})
test('recovery copies of existing manual words do not accumulate or automatically resend', async () => {
  const f = fixture()
  await f.context.submit('A repeated question')
  await f.context.submit('Another question')
  await f.context.submit('A repeated question')
  f.context.keepPendingDraft('A repeated   question Another question')
  assert.equal(f.context.pendingDraft, 'A repeated question Another question')
  assert.equal(f.context.state.history.length, 2)
  assert.equal(f.requests.length, 3)
})
test('a failure after a successful turn never turns an answered message into an unsent draft', async () => {
  const f = fixture()
  f.context.api = async (path) =>
    path.endsWith('/turn')
      ? {
          history: [
            { role: 'user', text: 'Accepted' },
            { role: 'assistant', text: 'Answered' }
          ],
          speak: 'Answered'
        }
      : {}
  f.context.say = async () => {
    throw Error('playback failed')
  }
  await f.context.submit('Accepted')
  assert.equal(f.context.state.history.length, 2)
  assert.equal(f.context.pendingDraft, '')
  assert.doesNotMatch(f.context.notice, /words are kept|message is kept/)
})
