import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
const playback = source.slice(source.indexOf('async function say('), source.indexOf('function stopSpeaking('))
function fixture(fetchImpl) {
  const calls = [],
    notices = [],
    deadlines = []
  const context = vm.createContext({
    voiceOn: true,
    player: { play: (...args) => calls.push(args) },
    speech: {
      revision: 'local-revision',
      sessionToken: 'opaque-tab-a',
      voices: [{ id: 'local-preset' }],
      speak: { maxChars: 600, answerMs: 90000 }
    },
    authSpeechId: 0,
    auth: { active: false },
    link: null,
    preroll: [],
    language: '',
    audioAbort: null,
    talking: false,
    AbortController,
    AbortSignal: {
      any: AbortSignal.any.bind(AbortSignal),
      timeout(ms) {
        deadlines.push(ms)
        return new AbortController().signal
      }
    },
    document: { getElementById: () => null },
    status() {},
    setNotice: (text) => notices.push(text),
    fetch: fetchImpl,
    api: async () => ({ available: true, revision: 'new' })
  })
  context.stopVoice = async () => {
    context.voiceOn = false
    context.authSpeechId++
    context.audioAbort?.abort()
  }
  vm.runInContext(playback, context)
  return { context, calls, notices, deadlines }
}

test('local TTS uses backend voice, revision and cold-model deadline', async () => {
  let request
  const f = fixture(async (_url, init) => {
    request = JSON.parse(init.body)
    return new Response(new Uint8Array([0, 0]))
  })
  await f.context.say('A real answer')
  assert.equal(request.voice, 'local-preset')
  assert.equal(request.revision, 'local-revision')
  assert.equal(request.sessionToken, 'opaque-tab-a')
  assert.deepEqual(f.deadlines, [90000])
  assert.equal(f.calls.length, 1)
})

test('late audio after cancellation is discarded even when fetch ignores abort', async () => {
  let deliver
  const f = fixture(
    () =>
      new Promise((resolve) => {
        deliver = resolve
      })
  )
  const pending = f.context.say('A late answer')
  await f.context.stopVoice()
  deliver(new Response(new Uint8Array([0, 0])))
  await pending
  assert.equal(f.calls.length, 0)
})

test('revision conflict stops voice, reloads facts and never replays the prompt', async () => {
  let requests = 0
  const f = fixture(async () => {
    requests++
    return Response.json({ code: 'VOICE_RESTART_REQUIRED' }, { status: 409 })
  })
  await f.context.say('Keep my answer in chat')
  assert.equal(requests, 1)
  assert.equal(f.context.voiceOn, false)
  assert.equal(f.context.speech.revision, 'new')
  assert.equal(f.calls.length, 0)
  assert.match(f.notices[0], /Start the microphone again/)
})

test('stop clears token and invalidates the old socket generation', async () => {
  const begin = source.indexOf('async function stopVoice()')
  const end = source.indexOf('function modal(', begin)
  const context = vm.createContext({
    voiceGeneration: 2,
    speech: { sessionToken: 'old-tab-token', revision: 'revision' },
    auth: { pauseVoice() {} },
    holdVoiceDraft() {},
    voiceOn: true,
    sendTimer: null,
    clearTimeout,
    link: { close() {} },
    microphone: { async close() {} },
    stopSpeaking() {},
    render() {}
  })
  vm.runInContext(source.slice(begin, end), context)
  await context.stopVoice()
  assert.equal(context.speech.sessionToken, undefined)
  assert.equal(context.voiceGeneration, 3)
  assert.equal(context.voiceOn, false)
})

test('two widget instances with the same revision send their own opaque tokens', async () => {
  const requests = []
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(new Uint8Array([0, 0]))
  }
  const a = fixture(fetchImpl),
    b = fixture(fetchImpl)
  a.context.speech.sessionToken = 'tab-a'
  b.context.speech.sessionToken = 'tab-b'
  await Promise.all([a.context.say('First tab'), b.context.say('Second tab')])
  assert.deepEqual(
    requests.map((request) => request.sessionToken),
    ['tab-a', 'tab-b']
  )
  assert.equal(requests[0].revision, requests[1].revision)
})

test('insecure-context explanation only replaces unsupported microphone errors', async () => {
  const begin = source.indexOf('async function startVoice()')
  const end = source.indexOf('async function stopVoice()', begin)
  for (const [secure, problem, expected] of [
    [false, 'unsupported', /page is not secure.*HTTPS/],
    [true, 'unsupported', /^Could not open the microphone: unsupported$/],
    [false, 'denied', /^Microphone permission was denied/],
    [false, 'noMicrophone', /^Could not open the microphone: noMicrophone$/]
  ]) {
    const notices = []
    const context = vm.createContext({
      isSecureContext: secure,
      voiceOn: false,
      player: null,
      openPlayer: () => ({}),
      reconnects: 0,
      reconnectUntil: 0,
      speech: {},
      render() {},
      status() {},
      api: async () => ({ available: true }),
      visibleChoices: () => ({ templates: [], systems: [] }),
      onFrame() {},
      openMicrophone: async () => {
        throw Object.assign(new Error(problem), { problem })
      },
      setNotice: (text) => notices.push(text)
    })
    vm.runInContext(source.slice(begin, end), context)
    await context.startVoice()
    assert.match(notices[0], expected)
    assert.equal(context.voiceOn, false)
  }
})
