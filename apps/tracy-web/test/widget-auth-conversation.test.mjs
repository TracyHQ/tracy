import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { createAuth } from '../src/widget/assets/auth-panel.js'
import { speechLanguageCode } from '../src/widget/assets/email-voice.js'
import { speechCursor } from '../src/widget/assets/speech-cursor.js'

const guides = JSON.parse(
  await readFile(new URL('../src/widget/assets/auth-voice.json', import.meta.url), 'utf8')
)
const live = await readFile(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
const tick = () => new Promise((resolve) => setImmediate(resolve))
function fixture(t) {
  const calls = [],
    spoken = [],
    timers = new Map(),
    elements = new Map()
  let done = 0,
    exits = 0,
    ensured = 0,
    nextTimer = 0
  const popup = {
    closed: false,
    location: '',
    close() {
      this.closed = true
    }
  }
  const host = {
    html: '',
    set innerHTML(value) {
      this.html = value
      elements.clear()
    },
    get innerHTML() {
      return this.html
    },
    scrollIntoView() {},
    remove() {},
    querySelector(selector) {
      const id = selector.slice(1)
      if (!this.html.includes('id="' + id + '"')) return null
      if (!elements.has(id)) {
        const match = this.html.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'))
        elements.set(id, {
          value: match?.[1] || '',
          addEventListener(name, fn) {
            this[name] = fn
          }
        })
      }
      return elements.get(id)
    }
  }
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = { addEventListener() {}, open: () => popup }
  globalThis.document = { getElementById: () => host }
  t.after(() => {
    for (const key of ['window', 'document'])
      if (previous[key] === undefined) delete globalThis[key]
      else globalThis[key] = previous[key]
  })
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    const id = ++nextTimer
    timers.set(id, fn)
    return id
  })
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id))
  t.mock.method(globalThis, 'setInterval', () => 1)
  t.mock.method(globalThis, 'clearInterval', () => {})
  const auth = createAuth({
    api: async (path, data) => {
      calls.push({ path, data })
      assert.match(path, /\/auth\/(email|verify|google|cancel)$/)
      return path.endsWith('/google') ? { flow: 'test-flow', url: '/test-popup' } : {}
    },
    escape: (text) => text,
    isVoiceOn: () => true,
    ensureVoice: () => ensured++,
    onGuide: async (x) => spoken.push(x),
    onExit: () => exits++,
    onDone: async () => done++,
    onClose: async () => {}
  })
  const cursor = speechCursor('chat'),
    words = ['My existing website brief']
  cursor('chat', words)
  const send = (text, partial = false) => {
    words.push(text)
    auth.receiveWords(cursor(auth.voiceRoute, words), partial)
  }
  return {
    auth,
    send,
    calls,
    spoken,
    timers,
    host,
    popup,
    get done() {
      return done
    },
    get exits() {
      return exits
    },
    get ensured() {
      return ensured
    }
  }
}
test('spoken auth happy path fills email, confirms before OTP, verifies six digits and resumes without a model turn', async (t) => {
  const f = fixture(t)
  f.auth.open()
  await f.auth.beginVoice()
  assert.deepEqual(f.spoken, ['email'])
  assert.equal(f.auth.listening, true)
  f.send('yes')
  await tick()
  assert.equal(f.calls.length, 0)
  f.send('h a at gmail dot com')
  await tick()
  assert.equal(f.host.querySelector('#auth-email').value, 'ha@gmail.com')
  assert.equal(f.spoken.at(-1).key, 'confirmEmail')
  assert.match(f.spoken.at(-1).spelling, /H as in Hotel/)
  assert.equal(f.calls.length, 0)
  f.send('đúng')
  await tick()
  assert.deepEqual(f.calls, [{ path: '/widget/api/auth/email', data: { email: 'ha@gmail.com' } }])
  assert.equal(f.spoken.at(-1), 'code')
  assert.ok(f.auth.voiceRoute.startsWith('auth:code:'))
  assert.equal(f.auth.listening, true)
  f.send('zero one two three four five', true)
  assert.equal(f.timers.size, 0)
  // A recognizer re-emits the same cumulative committed words once the partial has settled.
  f.auth.receiveWords(['zero one two three four five'], false)
  assert.equal(f.timers.size, 1)
  const verify = [...f.timers.values()][0]
  verify()
  await tick()
  assert.deepEqual(f.calls.at(-1), { path: '/widget/api/auth/verify', data: { code: '012345' } })
  assert.equal(f.done, 1)
  assert.equal(f.exits, 1)
  assert.equal(f.auth.active, false)
  assert.equal(f.calls.filter((x) => x.path.endsWith('/email')).length, 1)
  assert.equal(
    f.spoken.some((x) => JSON.stringify(x).includes('012345')),
    false
  )
  assert.ok(f.ensured >= 2)
})
test('email rejection does not send OTP; paused or changed-phase queued code cannot verify', async (t) => {
  const f = fixture(t)
  f.auth.open()
  await f.auth.beginVoice()
  f.send('first at gmail dot com')
  f.send('không')
  await tick()
  assert.equal(f.calls.length, 0)
  assert.equal(f.spoken.at(-1), 'emailAgain')
  f.send('second at gmail dot com')
  f.send('yes')
  await tick()
  assert.equal(f.calls[0].data.email, 'second@gmail.com')
  f.send('012345')
  const paused = [...f.timers.values()][0]
  f.auth.pauseVoice()
  paused()
  await tick()
  assert.equal(f.calls.filter((x) => x.path.endsWith('/verify')).length, 0)
  await f.auth.beginVoice()
  f.send('012345')
  const old = [...f.timers.values()][0]
  await f.host.querySelector('#auth-google').onclick()
  old()
  await tick()
  assert.equal(f.calls.filter((x) => x.path.endsWith('/verify')).length, 0)
  f.send('012345')
  assert.equal(f.calls.filter((x) => x.path.endsWith('/verify')).length, 0)
})
test('spoken auth guides ask for speech in EN/VI including regional STT tags, with confirmation before codes', async () => {
  const source = live.slice(
    live.indexOf('async function authGuide('),
    live.indexOf('const auth = createAuth(')
  )
  for (const language of ['en', 'en-US', 'vi', 'vi-VN', 'vi_VN']) {
    let notice = ''
    const context = vm.createContext({
      language,
      activeAuthLanguagePack: null,
      speechLanguageCode,
      authWords: guides,
      navigator: { language: 'en' },
      voiceOn: false,
      setNotice: (text) => (notice = text)
    })
    vm.runInContext(source, context)
    await context.authGuide('email')
    assert.match(notice, language.startsWith('vi') ? /đọc địa chỉ email/ : /say your email address/)
    assert.match(
      notice,
      language.startsWith('vi') ? /xác nhận trước khi gửi mã/ : /confirm before sending a code/
    )
    await context.authGuide('code')
    assert.match(
      notice,
      language.startsWith('vi') ? /đọc sáu chữ số.*tự xác minh/ : /read the six digits.*verify/
    )
  }
})
