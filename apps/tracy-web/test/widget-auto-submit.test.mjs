import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { speechCursor } from '../src/widget/assets/speech-cursor.js'

const source = await readFile(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
function fixture(restored = '') {
  const storage = new Map(restored ? [['tracy-widget-voice-draft', restored]] : [])
  const timers = new Map(),
    sent = [],
    links = []
  let nextTimer = 0
  const context = vm.createContext({
    pendingDraft: '',
    draft: '',
    committed: '',
    preroll: [],
    loudFrames: 0,
    speech: {},
    voiceGeneration: 0,
    voiceOn: true,
    reconnects: 0,
    reconnectUntil: 0,
    auth: { active: false },
    authOpening: false,
    talking: false,
    language: '',
    link: null,
    speechCursor,
    readySpeechFacts: (old, ready) => ({ ...old, ...ready }),
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, text) => storage.set(key, text),
      removeItem: (key) => storage.delete(key)
    },
    document: { getElementById: () => ({ hidden: true }) },
    render() {},
    status() {},
    setNotice() {},
    widgetSocket: () => 'ws://widget.invalid',
    submit: (text) => sent.push(text),
    sendTimer: null,
    setTimeout: (fn, ms) => {
      const id = ++nextTimer
      timers.set(id, { fn, ms })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    openWidgetSpeechLink: (handlers) => {
      links.push(handlers)
      return { stop() {}, close() {} }
    }
  })
  const helpers = source.slice(
    source.indexOf('function keepPendingDraft('),
    source.indexOf('function status(')
  )
  vm.runInContext(helpers, context)
  vm.runInContext(source.slice(source.indexOf('const restoredDraft ='), source.indexOf('const e =')), context)
  vm.runInContext(
    source.slice(source.indexOf('function openLink()'), source.indexOf('async function startVoice()')),
    context
  )
  function open() {
    context.openLink()
    return links.at(-1)
  }
  function fire() {
    const timer = timers.get(context.sendTimer)
    assert.ok(timer)
    assert.equal(timer.ms, 1600)
    timer.fn()
  }
  return { context, storage, timers, sent, open, fire }
}

test('restored uncertain words stay manual while fresh committed speech auto-submits', () => {
  const f = fixture('Old words from failed 401')
  assert.equal(f.context.pendingDraft, 'Old words from failed 401')
  assert.equal(f.context.draft, '')
  assert.equal(f.storage.get('tracy-widget-voice-draft'), undefined)
  const link = f.open()
  link.onReady({ provider: 'voicestudio' })
  link.onWords(['A fresh question'], '')
  f.fire()
  assert.deepEqual(f.sent, ['A fresh question'])
  assert.equal(f.context.pendingDraft, 'Old words from failed 401')
})

test('partial words cancel the auto timer until the new phrase is committed', () => {
  const f = fixture(),
    link = f.open()
  link.onWords(['First phrase'], '')
  link.onWords(['First phrase'], 'still speaking')
  assert.equal(f.timers.size, 0)
  assert.deepEqual(f.sent, [])
  link.onWords(['First phrase', 'second phrase'], '')
  f.fire()
  assert.deepEqual(f.sent, ['First phrase second phrase'])
})

test('settled end and queued timer race submit at most once; stale generations cannot send', () => {
  const f = fixture(),
    link = f.open()
  link.onWords(['Once only'], '')
  const queued = f.timers.get(f.context.sendTimer).fn
  link.onEnd('silence', true)
  queued()
  link.onWords(['Late old words'], '')
  assert.deepEqual(f.sent, ['Once only'])
  const g = fixture(),
    old = g.open()
  old.onWords(['Old generation'], '')
  const stale = g.timers.get(g.context.sendTimer).fn
  g.context.voiceGeneration++
  stale()
  assert.deepEqual(g.sent, [])
})

test('actual network loss parks uncertain words without replay and fresh connection resumes auto', () => {
  const f = fixture(),
    old = f.open()
  old.onWords([], 'Uncertain old words')
  old.onEnd('network', false)
  assert.deepEqual(f.sent, [])
  assert.equal(f.context.pendingDraft, 'Uncertain old words')
  assert.equal(f.context.draft, '')
  old.onWords(['Late old commit before reconnect'], '')
  assert.equal(f.context.draft, '')
  assert.equal(f.timers.size, 0)
  const fresh = f.open()
  fresh.onReady({ provider: 'voicestudio' })
  old.onWords(['Late old commit'], '')
  fresh.onWords(['New confirmed words'], '')
  f.fire()
  assert.deepEqual(f.sent, ['New confirmed words'])
  assert.equal(f.storage.get('tracy-widget-pending-draft'), 'Uncertain old words')
})

test('unsettled stop does not automatically submit unconfirmed text', () => {
  const f = fixture(),
    link = f.open()
  link.onWords([], 'Unconfirmed phrase')
  link.onEnd('stopped', false)
  assert.deepEqual(f.sent, [])
  assert.equal(f.context.pendingDraft, 'Unconfirmed phrase')
  assert.equal(f.context.draft, '')
})

test('fresh successful request keeps earlier manual draft and failed requests are not replayed', async () => {
  const f = fixture('Earlier failed request'),
    requests = []
  Object.assign(f.context, {
    nativeSession: null,
    busy: false,
    auth: { active: false },
    stopSpeaking() {},
    state: { history: [] },
    visibleRows: () => [],
    pageSize: 12,
    mode: 'templates',
    notice: '',
    api: async (path, body) => {
      if (path.endsWith('/turn')) {
        requests.push(body.message)
        return { history: [], speak: '' }
      }
      return {}
    },
    say() {}
  })
  vm.runInContext(
    source.slice(source.indexOf('async function submit('), source.indexOf('async function say(')),
    f.context
  )
  await f.context.submit('Fresh confirmed message')
  assert.deepEqual(requests, ['Fresh confirmed message'])
  assert.equal(f.context.pendingDraft, 'Earlier failed request')
  assert.equal(f.storage.get('tracy-widget-pending-draft'), 'Earlier failed request')
  f.context.api = async (path, body) => {
    if (path.endsWith('/turn')) {
      requests.push(body.message)
      throw Error('MODEL_UNAVAILABLE')
    }
    return {}
  }
  await f.context.submit('New refused message')
  assert.deepEqual(requests, ['Fresh confirmed message', 'New refused message'])
  assert.match(f.context.pendingDraft, /Earlier failed request/)
  assert.match(f.context.pendingDraft, /New refused message/)
  assert.equal(f.context.busy, false)
})
