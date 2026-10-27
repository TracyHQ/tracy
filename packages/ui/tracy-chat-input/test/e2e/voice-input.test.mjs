#!/usr/bin/env node
/**
 * Voice input end to end in a real browser: a microphone made in the page → the real `VoiceInput`
 * (`test/fixtures/voice-entry.tsx`, a stand-in of dsh's chat box) → the real voice socket
 * (`apps/tracy-web/src/speech/relay.js`, on this file's server) → a scripted stand-in for ElevenLabs
 * that answers with a Vietnamese request word by word. Checked: the microphone only where the
 * deployment has a key; words live in the draft and the language heard; Done keeps the words, Enter
 * finishes then sends once, Escape gives the draft back, typing takes it over; a refused key and a
 * refused microphone are said in the row. The chat's language rides the socket (`?first=` is the
 * opening message): a Vietnamese chat's hint reaches the service, and a phrase the service starts
 * again at an English word keeps the Vietnamese already shown (both measured on the live service).
 *
 * THE COMMENT BOXES (`/comment`, `test/fixtures/voice-comment-entry.tsx`): the same `VoiceInput`,
 * published through the real `voice-bridge.mjs`, drawn by the fork's real `CommentVoice` over a
 * `<textarea>` in a stand-in of the Browser tab's comment popover. Checked: the microphone in the
 * popover's text field, words live in the box, the paperclip and "Note for team" stepping aside while it
 * listens, Done, Enter finishing then sending once, Esc taking the words back out with the box still
 * open, the interface language as the hint, a microphone published after the box was drawn, and one
 * box listening at a time.
 *
 * THE MICROPHONE IS THE PAGE'S OWN. Chrome's fake capture device still asks macOS for the microphone
 * (measured 15/10/2026: `getUserMedia` never settles under a test runner), so `getUserMedia` answers
 * with a stream the page plays itself — a voice-like tone, or the WAV in `VOICE_E2E_WAV`. Everything
 * after it is real: AudioContext, the AudioWorklet, the 16 kHz conversion, the socket, the relay.
 *
 * With `VOICE_E2E_REAL=1` (and `SPEECH_TO_TEXT_API_KEY`, `VOICE_E2E_WAV` = a WAV of speech, such as
 * `apps/tracy-web/scripts/speech-check.mjs --wav-dir` writes) the relay talks to ElevenLabs itself
 * and the one live test checks real words instead of the script.
 * `VOICE_E2E_SHOTS=<dir>` keeps a screenshot of each step; `VOICE_E2E_DEBUG=1` prints the page's
 * console and the socket's frames.
 *
 * Harness as in `tracy-mode-picker/test/e2e`: esbuild bundles the fixture, `playwright` from
 * apps/tracy-host, `ws` from apps/tracy-web; a missing dependency or browser FAILS, never skips.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const webPkg = path.join(repoRoot, 'apps/tracy-web')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium
const wsModule = await import(pathToFileURL(require.resolve('ws', { paths: [webPkg] })).href)
const { WebSocketServer } = wsModule.default ?? wsModule
const { speechRelay } = await import(pathToFileURL(path.join(webPkg, 'src/speech/relay.js')).href)

const REAL = process.env.VOICE_E2E_REAL === '1'
const SHOTS = process.env.VOICE_E2E_SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/** What the stand-in service says, by audio frames received (100 ms each), then on the final commit. */
const SCRIPT = [
  [4, { message_type: 'session_started', session_id: 'e2e', config: {} }],
  [6, { message_type: 'partial_transcript', text: 'Đổi' }],
  [9, { message_type: 'partial_transcript', text: 'Đổi màu nền' }],
  [12, { message_type: 'partial_transcript', text: 'Đổi màu nền trang chủ' }],
  // The live service's order (15/10/2026): the stamped copy first, the plain one right after.
  [
    15,
    {
      message_type: 'committed_transcript_with_timestamps',
      text: 'Đổi màu nền trang chủ sang xanh đậm.',
      language_code: 'vie'
    }
  ],
  [16, { message_type: 'committed_transcript', text: 'Đổi màu nền trang chủ sang xanh đậm.' }],
  [19, { message_type: 'partial_transcript', text: 'Thêm nút' }],
  [23, { message_type: 'partial_transcript', text: 'Thêm nút liên hệ' }]
]
const FINAL = { message_type: 'committed_transcript', text: 'Thêm nút liên hệ dưới tiêu đề.' }
/** Measured 15/10/2026 under `language_code=vi`: at the switch to English the phrase starts again. */
const RESTART = [
  [4, { message_type: 'session_started', session_id: 'e2e-mixed', config: {} }],
  [6, { message_type: 'partial_transcript', text: 'Đổi màu nền' }],
  [10, { message_type: 'partial_transcript', text: 'Đổi màu nền trang chủ sang xanh đậm. And' }],
  [14, { message_type: 'partial_transcript', text: 'And add a contact' }],
  [17, { message_type: 'partial_transcript', text: 'And add a contact button' }]
]
const RESTART_FINAL = {
  message_type: 'committed_transcript',
  text: 'And add a contact button under the headline.'
}
const SCRIPTS = { plain: [SCRIPT, FINAL], restart: [RESTART, RESTART_FINAL] }
/** The address each session asked the service for, this test's. */
let handshakes = []
const FIRST = 'Đổi màu nền trang chủ sang xanh đậm.'
const WHOLE = `${FIRST} Thêm nút liên hệ dưới tiêu đề.`

/** How the page's `/api/speech` and the stand-in service behave for the next test. */
let mode = { available: true, refuse: false, silentAfter: Number.POSITIVE_INFINITY, script: 'plain' }
let outDir
let server
let service
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tmp-voice-e2e-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'voice-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    outdir: outDir,
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  for (const file of built.outputFiles)
    writeFileSync(path.join(outDir, path.basename(file.path).replace(/^voice-entry/, 'app')), file.text)
  // The fork's adapter imports React from its own tree: one React for the page, as dsh gives both bundles.
  const one = (name) => path.dirname(require.resolve(`${name}/package.json`, { paths: [pkgRoot] }))
  const comment = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'voice-comment-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    alias: { react: one('react'), 'react-dom': one('react-dom') },
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'comment.js'), comment.outputFiles[0].text)
  writeFileSync(
    path.join(outDir, 'comment.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script src="/comment.js"></script></body></html>'
  )
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script src="/app.js"></script></body></html>'
  )

  service = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  service.on('connection', (socket, req) => {
    handshakes.push(new URL(req.url, 'ws://service'))
    const [script, final] = SCRIPTS[mode.script]
    let frames = 0
    let step = 0
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      if (message.commit) {
        if (mode.silentAfter === Number.POSITIVE_INFINITY) socket.send(JSON.stringify(final))
        return
      }
      frames += 1
      while (step < script.length && script[step][0] <= frames && frames <= mode.silentAfter)
        socket.send(JSON.stringify(script[step++][1]))
    })
  })
  service.options.verifyClient = (_info, done) =>
    mode.refuse ? done(false, 401, 'missing the permission speech_to_text') : done(true)
  await new Promise((resolve) => service.once('listening', resolve))

  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    if (url === '/api/speech') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ available: mode.available, sessionSeconds: 300, silenceSeconds: 30 }))
      return
    }
    if (url === '/mic.wav' && process.env.VOICE_E2E_WAV) {
      res.writeHead(200, { 'content-type': 'audio/wav' })
      res.end(readFileSync(process.env.VOICE_E2E_WAV))
      return
    }
    const name =
      url === '/app.js'
        ? 'app.js'
        : url === '/comment.js'
          ? 'comment.js'
          : url === '/comment'
            ? 'comment.html'
            : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const relay = speechRelay({
    config: {
      origin,
      sessionSecret: 'unused',
      speech: { apiKey: REAL ? process.env.SPEECH_TO_TEXT_API_KEY : 'stand-in-key' }
    },
    count: async () => false,
    session: async () => 'e2e@example.com',
    log: { log: () => {}, warn: () => {} },
    ...(REAL
      ? {}
      : {
          connect: (address, options) =>
            new wsModule.default(
              `ws://127.0.0.1:${service.address().port}${address.pathname}${address.search}`,
              options
            )
        })
  })
  server.on('upgrade', (req, socket, head) => {
    if (relay.handles(req)) void relay.upgrade(req, socket, head)
    else socket.destroy()
  })

  const args = [
    '--disable-features=MacAppCodeSignClone',
    '--proxy-server=direct://',
    '--autoplay-policy=no-user-gesture-required',
    // `voice.test` is this server too, reached over plain http: not a secure context.
    '--host-resolver-rules=MAP voice.test 127.0.0.1'
  ]
  browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  service?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A page with the fixture, the given draft, and the given `/api/speech` and service behaviour. */
async function open({
  draft = '',
  first = '',
  page: at = '/',
  query = '',
  scheme = 'light',
  denyMic = false,
  host = '127.0.0.1',
  ...next
} = {}) {
  mode = { available: true, refuse: false, silentAfter: Number.POSITIVE_INFINITY, script: 'plain', ...next }
  handshakes = []
  const context = await browser.newContext({
    viewport: { width: 760, height: 260 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    permissions: ['microphone']
  })
  await context.addInitScript(
    ({ deny, wav }) => {
      navigator.mediaDevices.getUserMedia = async () => {
        if (deny) throw new DOMException('Permission denied', 'NotAllowedError')
        const context = new AudioContext()
        const out = context.createMediaStreamDestination()
        if (wav) {
          const source = context.createBufferSource()
          source.buffer = await context.decodeAudioData(await (await fetch('/mic.wav')).arrayBuffer())
          source.connect(out)
          source.start()
        } else {
          // A tone whose loudness rises and falls three times a second, so the bars move.
          const voice = context.createOscillator()
          const level = context.createGain()
          const swing = context.createOscillator()
          const depth = context.createGain()
          voice.frequency.value = 220
          level.gain.value = 0.2
          swing.frequency.value = 3
          depth.gain.value = 0.18
          swing.connect(depth).connect(level.gain)
          voice.connect(level).connect(out)
          voice.start()
          swing.start()
        }
        return out.stream
      }
    },
    { deny: denyMic, wav: Boolean(process.env.VOICE_E2E_WAV) }
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (process.env.VOICE_E2E_DEBUG) {
    page.on('console', (m) => console.log(`# console ${m.type()}: ${m.text()}`))
    page.on('websocket', (ws) => {
      console.log(`# ws open ${ws.url()}`)
      let n = 0
      ws.on('framesent', (f) => {
        if (typeof f.payload === 'string' || ++n % 10 === 1)
          console.log(
            `# ws sent ${typeof f.payload === 'string' ? f.payload : `binary #${n} ${f.payload.length}B`}`
          )
      })
      ws.on('framereceived', (f) => console.log(`# ws got ${f.payload}`))
      ws.on('close', () => console.log('# ws closed'))
      ws.on('socketerror', (e) => console.log(`# ws error ${e}`))
    })
  }
  const read = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/speech', { timeout: 8000 })
  const sockets = []
  page.on('websocket', (ws) => sockets.push(new URL(ws.url())))
  await page.goto(
    `http://${host}:${server.address().port}${at}?draft=${encodeURIComponent(draft)}&first=${encodeURIComponent(first)}${query}`
  )
  await read
  await page.waitForSelector(
    at === '/comment' ? '[data-voice-composer]' : '[data-slot="conversation.composer.bar"]'
  )
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  return { page, context, errors, sockets }
}

const draftOf = (page) => page.evaluate(() => window.__voice.text())
const sentOf = (page) => page.evaluate(() => window.__voice.sent())
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}
const waitDraft = (page, check, timeout = 10_000) =>
  page.waitForFunction(check, null, { timeout, polling: 50 }).catch(async () => {
    assert.fail(`draft never matched; it reads “${await draftOf(page)}”`)
  })

test('no speech key on this deployment: no microphone is drawn', { skip: REAL }, async () => {
  const { page, context, errors } = await open({ available: false })
  assert.equal(await page.locator('.tv-voice-mic').count(), 0)
  await shot(page, '00-no-key-no-microphone')
  assert.deepEqual(errors, [])
  await context.close()
})

test('a page that is not a secure context (plain http): no microphone, since the browser offers none', {
  skip: REAL
}, async () => {
  const { page, context, errors } = await open({ host: 'voice.test' })
  assert.equal(await page.evaluate(() => window.isSecureContext), false)
  assert.equal(await page.locator('.tv-voice-mic').count(), 0)
  assert.deepEqual(
    errors.filter((e) => !/getUserMedia/.test(e)),
    []
  )
  await context.close()
})

test('dictation: words appear live in the draft, the language heard is shown, Done keeps them', {
  skip: REAL
}, async () => {
  const { page, context, errors } = await open({ draft: 'Please: ' })
  await shot(page, '01-idle-microphone')
  assert.equal(await page.locator('.tv-voice-mic').getAttribute('aria-label'), 'Dictate')
  await page.locator('.tv-voice-mic').click()
  await page.waitForSelector('.tv-voice-bars', { timeout: 8000 })
  assert.equal(await page.locator('.fx-model').isHidden(), true, 'the row widens over the model chip')
  await waitDraft(page, () => window.__voice.text() === 'Please: Đổi màu nền')
  await shot(page, '02-listening-partial')
  await waitDraft(page, () => window.__voice.text().includes('xanh đậm.'))
  await page.waitForSelector('.tv-voice-lang', { timeout: 5000 })
  assert.equal(
    await page.locator('.tv-voice-lang').innerText(),
    'VI',
    'the service’s three letters, shown short'
  )
  assert.match(await page.locator('.tv-voice-lang').getAttribute('title'), /^Language heard: Vietnamese$/)
  await waitDraft(page, () => window.__voice.text().endsWith('Thêm nút liên hệ'))
  await shot(page, '03-listening-committed-and-partial')
  await page.locator('.tv-voice-done').click()
  await waitDraft(page, () => window.__voice.text().endsWith('dưới tiêu đề.'))
  await page.waitForSelector('.tv-voice-mic', { timeout: 5000 })
  assert.equal(await draftOf(page), `Please: ${WHOLE}`)
  assert.deepEqual(await sentOf(page), [], 'Done sends nothing')
  await shot(page, '04-done-words-kept')
  assert.deepEqual(errors, [])
  await context.close()
})

test('a Vietnamese chat: its language rides the socket, and a phrase restarted at an English word keeps the Vietnamese', {
  skip: REAL
}, async () => {
  const { page, context, errors, sockets } = await open({
    first: 'Đổi màu nút liên hệ sang đỏ giúp mình',
    script: 'restart'
  })
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text().startsWith('Đổi màu nền trang chủ sang xanh đậm. And'))
  await waitDraft(
    page,
    () => window.__voice.text() === 'Đổi màu nền trang chủ sang xanh đậm. And add a contact button'
  )
  await shot(page, '06-mixed-language-listening')
  assert.equal(sockets[0].searchParams.get('language'), 'vi', 'the page names the chat’s language')
  assert.equal(handshakes[0].searchParams.get('language_code'), 'vi', 'the relay passes a `vi` hint on')
  await page.locator('.tv-voice-done').click()
  await page.waitForSelector('.tv-voice-mic', { timeout: 5000 })
  assert.equal(
    await draftOf(page),
    'Đổi màu nền trang chủ sang xanh đậm. And add a contact button under the headline.',
    'the Vietnamese the service dropped at the switch stays in the draft'
  )
  await shot(page, '07-mixed-language-done')
  assert.deepEqual(errors, [])
  await context.close()
})

test('an English chat names English; the relay keeps no hint it was not measured to help with', {
  skip: REAL
}, async () => {
  const { page, context, sockets } = await open({ first: 'Make the header sticky please' })
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text().includes('Đổi màu nền'))
  assert.equal(sockets[0].searchParams.get('language'), 'en')
  assert.equal(handshakes[0].searchParams.has('language_code'), false)
  await page.keyboard.press('Escape')
  await context.close()
})

test('Enter while speaking: the last phrase is confirmed, then the message is sent once', {
  skip: REAL
}, async () => {
  const { page, context } = await open()
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text().endsWith('Thêm nút liên hệ'))
  await page.locator('.fx-draft').focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__voice.sent().length > 0, null, { timeout: 8000 })
  assert.deepEqual(await sentOf(page), [WHOLE], 'the confirmed last phrase is in, sent once')
  assert.equal(await draftOf(page), '')
  await context.close()
})

test('Escape takes the dictated words back out; the draft is as it was', { skip: REAL }, async () => {
  const { page, context } = await open({ draft: 'Keep this. ' })
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text().includes('Đổi màu nền'))
  await page.keyboard.press('Escape')
  await page.waitForSelector('.tv-voice-mic', { timeout: 5000 })
  assert.equal(await draftOf(page), 'Keep this. ')
  await context.close()
})

test('typing while speaking takes the draft back: the words stay, nothing is written over the typing', {
  skip: REAL
}, async () => {
  const { page, context } = await open()
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text() === 'Đổi màu nền')
  const draft = page.locator('.fx-draft')
  await draft.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' ngay')
  await page.waitForSelector('.tv-voice-mic', { timeout: 8000 })
  await page.waitForTimeout(1500)
  assert.equal(await draftOf(page), 'Đổi màu nền ngay')
  await context.close()
})

test('a key the speech service refuses: the row says dictation is not available, with a retry', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ refuse: true })
  await page.locator('.tv-voice-mic').click()
  await page.waitForSelector('.tv-voice-note[role="status"]', { timeout: 8000 })
  await page.waitForFunction(
    () => document.querySelector('.tv-voice-note')?.textContent === 'Dictation is not available right now.',
    null,
    { timeout: 8000 }
  )
  assert.equal(await page.locator('.tv-voice-round[aria-label="Dictate again"]').count(), 1)
  await shot(page, '05-provider-refused')
  assert.equal(await draftOf(page), '')
  await context.close()
})

test('a refused microphone: the row says how to allow it, and no session is opened', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ denyMic: true })
  const sockets = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  await page.locator('.tv-voice-mic').click()
  await page.waitForFunction(
    () => /Allow it for this page/.test(document.querySelector('.tv-voice-note')?.textContent ?? ''),
    null,
    { timeout: 8000 }
  )
  await shot(page, '06-microphone-denied')
  assert.deepEqual(sockets, [])
  await context.close()
})

test('dark theme: the listening row reads on a dark page', { skip: REAL }, async () => {
  const { page, context } = await open({ scheme: 'dark', draft: 'Please: ' })
  await page.locator('.tv-voice-mic').click()
  await waitDraft(page, () => window.__voice.text().endsWith('Thêm nút liên hệ'))
  await shot(page, '07-listening-dark')
  await page.keyboard.press('Escape')
  await context.close()
})

const commentText = (page, id = 'a') => page.evaluate((box) => window.__comment.text(box), id)
const commentSent = (page, id = 'a') => page.evaluate((box) => window.__comment.sent(box), id)
const waitBox = (page, check, arg) =>
  page.waitForFunction(check, arg, { timeout: 10_000, polling: 50 }).catch(async () => {
    assert.fail(`comment box never matched; it reads “${await commentText(page)}”`)
  })
const inBox = (page, selector, id = 'a') => page.locator(`[data-box="${id}"] ${selector}`)

test('comment popover: the microphone in the text field, words live in the box, the paperclip and Note for team step aside, Done keeps the words', {
  skip: REAL
}, async () => {
  const { page, context, errors, sockets } = await open({ page: '/comment', query: '&lang=vi' })
  await inBox(page, 'textarea').focus()
  await shot(page, '08-comment-idle-microphone')
  assert.equal(await inBox(page, '.tv-voice-mic').getAttribute('aria-label'), 'Dictate')
  assert.equal(await inBox(page, '.fx-clip').count(), 1)
  await inBox(page, '.tv-voice-mic').click()
  await page.waitForSelector('[data-box="a"] .tv-voice-bars', { timeout: 8000 })
  await waitBox(page, () => window.__comment.text() === 'Đổi màu nền')
  assert.equal(await inBox(page, '.fx-clip').count(), 0, 'the paperclip steps aside')
  assert.equal(await inBox(page, '.fx-secondary').count(), 0, 'Note for team steps aside')
  assert.equal(await inBox(page, '.fx-send').count(), 1, 'Ask Tracy, which Enter presses, stays')
  assert.equal(sockets[0].searchParams.get('language'), 'vi', 'the hint is the interface language')
  assert.equal(handshakes[0].searchParams.get('language_code'), 'vi')
  await waitBox(page, () => window.__comment.text().endsWith('Thêm nút liên hệ'))
  await shot(page, '09-comment-listening')
  await inBox(page, '.tv-voice-done').click()
  await waitBox(page, () => window.__comment.text().endsWith('dưới tiêu đề.'))
  await page.waitForSelector('[data-box="a"] .tv-voice-mic', { timeout: 5000 })
  assert.equal(await commentText(page), WHOLE)
  assert.deepEqual(await commentSent(page), [], 'Done sends nothing')
  assert.equal(await inBox(page, '.fx-clip').count(), 1)
  await shot(page, '10-comment-done-words-kept')
  assert.deepEqual(errors, [])
  await context.close()
})

test('comment popover: Enter while speaking confirms the last phrase, then presses the box’s Enter once', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ page: '/comment' })
  await inBox(page, 'textarea').focus()
  await inBox(page, '.tv-voice-mic').click()
  await waitBox(page, () => window.__comment.text().endsWith('Thêm nút liên hệ'))
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__comment.sent().length > 0, null, { timeout: 8000 })
  assert.deepEqual(await commentSent(page), [WHOLE], 'the confirmed last phrase is in, sent once')
  assert.equal(await commentText(page), '')
  await context.close()
})

test('comment popover: Escape takes the dictated words back out and leaves the box open; the next Escape closes it', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ page: '/comment' })
  await inBox(page, 'textarea').fill('Keep this.')
  await inBox(page, '.tv-voice-mic').click()
  await waitBox(page, () => window.__comment.text().includes('Đổi màu nền'))
  await page.keyboard.press('Escape')
  await waitBox(page, () => window.__comment.text() === 'Keep this.')
  assert.equal(await page.evaluate(() => window.__comment.closed()), false, 'the box stays open')
  await page.waitForSelector('[data-box="a"] .tv-voice-mic', { timeout: 5000 })
  await inBox(page, 'textarea').focus()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.__comment.closed()), true)
  await context.close()
})

test('comment popover: a microphone published after the box was drawn appears in it', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ page: '/comment', query: '&late=1' })
  await page.waitForSelector('[data-box="a"] .tv-voice-mic', { timeout: 5000 })
  const { drawn, published } = await page.evaluate(() => window.__comment.times())
  assert.ok(
    drawn > 0 && published - drawn > 1000,
    'the box was drawn well before the microphone was published'
  )
  await context.close()
})

test('two comment boxes: pressing the second microphone finishes the first, its words kept and nothing said', {
  skip: REAL
}, async () => {
  const { page, context } = await open({ page: '/comment', query: '&two=1' })
  await inBox(page, 'textarea').focus()
  await inBox(page, '.tv-voice-mic').click()
  await waitBox(page, () => window.__comment.text('a').includes('Đổi màu nền'))
  await inBox(page, 'textarea', 'b').focus()
  await inBox(page, '.tv-voice-mic', 'b').click()
  await page.waitForSelector('[data-box="b"] .tv-voice-bars', { timeout: 8000 })
  await page.waitForSelector('[data-box="a"] .tv-voice-mic', { timeout: 8000 })
  await waitBox(page, () => window.__comment.text('b').includes('Đổi màu nền'))
  assert.match(await commentText(page, 'a'), /^Đổi màu nền/, 'the first box keeps its words')
  assert.equal(await inBox(page, '.tv-voice-note').count(), 0, 'and says nothing about the handover')
  await shot(page, '11-two-boxes-one-listens')
  await page.keyboard.press('Escape')
  await context.close()
})

test('the real speech service: spoken audio comes back as words and a language', {
  skip: !REAL
}, async () => {
  const expect = process.env.VOICE_E2E_EXPECT ?? ''
  const { page, context, errors } = await open()
  await page.locator('.tv-voice-mic').click()
  await page.waitForSelector('.tv-voice-bars', { timeout: 8000 })
  await page.waitForFunction(() => window.__voice.text().split(' ').length >= 3, null, { timeout: 20_000 })
  await shot(page, 'real-01-listening')
  await page.waitForSelector('.tv-voice-lang', { timeout: 20_000 })
  await page.waitForTimeout(Number(process.env.VOICE_E2E_LISTEN_MS ?? 4000))
  await shot(page, 'real-02-language')
  const language = await page.locator('.tv-voice-lang').innerText()
  await page.locator('.tv-voice-done').click()
  await page.waitForSelector('.tv-voice-mic', { timeout: 10_000 })
  await shot(page, 'real-03-done')
  const heard = await draftOf(page)
  console.log(`# heard (${language}): ${heard}`)
  if (process.env.VOICE_E2E_LANGUAGE)
    assert.match(language.toLowerCase(), new RegExp(`^${process.env.VOICE_E2E_LANGUAGE}`))
  if (expect) assert.match(heard.toLowerCase(), new RegExp(expect.toLowerCase()))
  assert.deepEqual(errors, [])
  await context.close()
})
