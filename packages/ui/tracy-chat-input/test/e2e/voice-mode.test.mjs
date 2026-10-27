#!/usr/bin/env node
/**
 * Chat or Voice end to end in a real browser: the page `test/fixtures/voice-mode-entry.tsx` (the real
 * voice conversation and its view, footer and mode menu in a stand-in of dsh's chat column), the real voice socket
 * (`apps/tracy-web/src/speech/relay.js`) against a scripted stand-in for ElevenLabs' recognition, and
 * the real reading door (`apps/tracy-web/src/speech/route.js` + `say.js`) against a stand-in that
 * streams a tone as Tracy's voice. Checked: the mode menu (Chat checked, Voice, the voices); Voice
 * taking the conversation's body (the orb) and the chat box's place (mute, X) — no typing; the words
 * heard under the orb, the countdown, sent as the person's message; a line said while Tracy works;
 * talking while Tracy works going to the queue like a typed message; the reply read out; the ear deaf
 * while Tracy talks; mute; a hidden page pausing it; X back to Chat, where the messages are.
 *
 * THE MICROPHONE IS THE PAGE'S OWN (as in `voice-input.test.mjs`): `getUserMedia` answers with a
 * tone the test turns up (the person talks) and down (silence) through `window.__micLevel`.
 * `VOICE_MODE_SHOTS=<dir>` keeps a screenshot of each step; `VOICE_E2E_DEBUG=1` prints the console.
 *
 * Harness as in `voice-input.test.mjs`: esbuild bundles the fixture, `playwright` from
 * apps/tracy-host, `ws` and `@hono/node-server` from apps/tracy-web; a missing one FAILS, never skips.
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
const { getRequestListener } = await import(
  pathToFileURL(require.resolve('@hono/node-server', { paths: [webPkg] })).href
)
const { speechRelay } = await import(pathToFileURL(path.join(webPkg, 'src/speech/relay.js')).href)
const { speechRoutes } = await import(pathToFileURL(path.join(webPkg, 'src/speech/route.js')).href)
const { mintSession, SESSION_COOKIE } = await import(
  pathToFileURL(path.join(webPkg, 'src/lib/session.js')).href
)

const SHOTS = process.env.VOICE_MODE_SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const SECRET = 'voice-mode-e2e'
const EMAIL = 'e2e@example.com'

/** What the person says in each voice session, phrase after phrase, as the stand-in service hears it. */
const SAYS = [
  [['Đổi màu', 'Đổi màu nút liên hệ', 'Đổi màu nút liên hệ sang xanh lá.']],
  [['Thêm số', 'Thêm số điện thoại vào', 'Thêm số điện thoại vào chân trang.']],
  // Over Tracy's reply: "ừ ừ" is the person listening; "khoan đã…" is a request.
  [
    ['Ừ', 'Ừ ừ', 'Ừ ừ.'],
    ['Khoan', 'Khoan đã, để màu', 'Khoan đã, để màu đỏ thì hơn.']
  ]
]
let phrase = 0
/** The phrases the stand-in confirmed, in order. */
const confirmed = []
/** What the reading door was asked to say, in order. */
let readings = []

let outDir
let server
let service
let browser
const seenHints = new Set()
let hintAccount = 0

/** A tone standing in for Tracy's voice: 24 kHz 16-bit PCM, about 45 ms a character, in network chunks. */
function toneFor(text) {
  const seconds = Math.min(2.5, Math.max(0.6, [...text].length * 0.045))
  const samples = Math.round(24_000 * seconds)
  const pcm = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) {
    const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * 4 * i) / 24_000)
    pcm.writeInt16LE(Math.round(9000 * swell * Math.sin((2 * Math.PI * 180 * i) / 24_000)), i * 2)
  }
  let at = 0
  return new ReadableStream({
    async pull(controller) {
      if (at >= pcm.length) return controller.close()
      controller.enqueue(new Uint8Array(pcm.subarray(at, at + 4800)))
      at += 4800
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  })
}

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tmp-voice-mode-e2e-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'voice-mode-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script src="/app.js"></script></body></html>'
  )

  // The recognition stand-in: each session hears the next phrase, word by word, then confirms it.
  service = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  service.on('connection', (socket) => {
    const phrases = SAYS[phrase % SAYS.length]
    phrase += 1
    const script = [[2, { message_type: 'session_started', session_id: `e2e-${phrase}`, config: {} }]]
    for (const [k, words] of phrases.entries()) {
      const at = 12 * k
      script.push(
        [at + 4, { message_type: 'partial_transcript', text: words[0] }],
        [at + 8, { message_type: 'partial_transcript', text: words[1] }],
        [
          at + 12,
          { message_type: 'committed_transcript_with_timestamps', text: words[2], language_code: 'vie' }
        ],
        [at + 12, { message_type: 'committed_transcript', text: words[2] }]
      )
    }
    let frames = 0
    let step = 0
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      if (message.commit) return
      frames += 1
      while (step < script.length && script[step][0] <= frames) {
        const sent = script[step++][1]
        socket.send(JSON.stringify(sent))
        if (sent.message_type === 'committed_transcript') confirmed.push(sent.text)
      }
    })
  })
  await new Promise((resolve) => service.once('listening', resolve))

  // The reading door, the real route: both switches on, a key, and the stand-in voice.
  const pool = {
    async query(sql, params) {
      if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
      if (sql.includes('speech_setting')) return { rows: [] }
      if (sql.includes('rate_bucket')) return { rows: [{ count: params[2] }] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  const doors = speechRoutes({
    config: { sessionSecret: SECRET, speech: { apiKey: 'stand-in-key' } },
    pool,
    log: { log: () => {}, warn: () => {} },
    fetchImpl: async (_url, init) => {
      const { text } = JSON.parse(init.body)
      readings.push(text)
      return new Response(toneFor(text), { status: 200 })
    }
  })
  const answerDoor = getRequestListener(doors.fetch)

  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    if (url.startsWith('/api/speech')) return answerDoor(req, res)
    if (url === '/api/seen-hints') {
      const account = req.headers.cookie?.match(/(?:^|;\s*)hint-account=([^;]+)/)?.[1]
      res.setHeader('content-type', 'application/json')
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          assert.equal(JSON.parse(body).hint, 'voice-tip')
          seenHints.add(account)
          res.end(JSON.stringify({ ok: true }))
        })
      } else res.end(JSON.stringify({ hints: seenHints.has(account) ? ['voice-tip'] : [] }))
      return
    }
    const name = url === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const relay = speechRelay({
    config: { origin, sessionSecret: SECRET, speech: { apiKey: 'stand-in-key' } },
    count: async () => false,
    session: async () => EMAIL,
    log: { log: () => {}, warn: () => {} },
    connect: (address, options) =>
      new wsModule.default(
        `ws://127.0.0.1:${service.address().port}${address.pathname}${address.search}`,
        options
      )
  })
  server.on('upgrade', (req, socket, head) => {
    if (relay.handles(req)) void relay.upgrade(req, socket, head)
    else socket.destroy()
  })

  const args = [
    '--disable-features=MacAppCodeSignClone',
    '--proxy-server=direct://',
    '--autoplay-policy=no-user-gesture-required'
  ]
  browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  service?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

async function open({
  scheme = 'light',
  width = 760,
  height = 620,
  query = '',
  account = `account-${++hintAccount}`
} = {}) {
  phrase = 0
  readings = []
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    permissions: ['microphone']
  })
  const port = server.address().port
  await context.addCookies([
    { name: SESSION_COOKIE, value: await mintSession(EMAIL, SECRET), domain: '127.0.0.1', path: '/' },
    { name: 'hint-account', value: account, domain: '127.0.0.1', path: '/' }
  ])
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      await audio.resume()
      const out = audio.createMediaStreamDestination()
      const voice = audio.createOscillator()
      const level = audio.createGain()
      voice.frequency.value = 220
      level.gain.value = 0
      voice.connect(level).connect(out)
      voice.start()
      // The person talks (0.2) or is silent (0).
      window.__micLevel = (value) => {
        level.gain.value = value
      }
      return out.stream
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (process.env.VOICE_E2E_DEBUG)
    page.on('console', (m) => console.log(`# console ${m.type()}: ${m.text()}`))
  await page.goto(`http://127.0.0.1:${port}/${query}`)
  await page.waitForSelector('.tv-vm-pill')
  return { page, context, errors }
}

const state = (page) => page.evaluate(() => window.__vm.state())
const until = (page, check, what, timeout = 15_000) =>
  page.waitForFunction(check, null, { timeout, polling: 50 }).catch(async () => {
    assert.fail(`${what} never came; the conversation reads ${JSON.stringify(await state(page))}`)
  })
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}
/** Wait until the reading door was last asked to say `text`. */
async function readOut(text, timeout = 10_000) {
  const start = Date.now()
  while (readings.at(-1) !== text) {
    if (Date.now() - start > timeout)
      assert.fail(`the door was never asked to say “${text}”; it last said “${readings.at(-1)}”`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
const talk = (page, on) => page.evaluate((v) => window.__micLevel?.(v), on ? 0.2 : 0)
const append = (page, events) => page.evaluate((e) => window.__vm.append(e), events)
const said = (text) => ({
  type: 'assistant/message',
  data: { message: { content: [{ type: 'text', text }] } }
})

test('Chat or Voice: Voice takes the body and the chat box, listens, sends, works out loud, reads the reply, stops for the person; X back to Chat', async () => {
  const { page, context, errors } = await open()
  await shot(page, '01-chat-mode')
  assert.equal(
    await page.locator('[data-conversation-tabs] [data-view="tracy-voice"]').isVisible(),
    false,
    'the voice view has no tab'
  )

  // The mode menu: Chat checked, Voice, and the voices.
  await page.click('.tv-vm-pill')
  await page.waitForSelector('[role="menu"]')
  assert.equal(
    await page.locator('[data-conversation-mode-pick="chat"]').getAttribute('aria-checked'),
    'true'
  )
  assert.equal(
    await page.locator('[data-conversation-mode-pick="voice"]').getAttribute('aria-checked'),
    'false'
  )
  assert.equal(await page.locator('[role="menuitemradio"][data-voice-id]').count(), 6)
  await shot(page, '02-mode-menu')

  // Voice: the orb takes the body, the footer the chat box's place — no draft to type into.
  await page.click('[data-conversation-mode-pick="voice"]')
  await until(page, () => window.__vm.state().phase === 'on', 'the microphone')
  await page.waitForSelector('.tv-vo[data-voice-mode="listening"]')
  assert.equal(await page.locator('[data-fixture="draft"]').count(), 0, 'no chat box in Voice')
  assert.equal(await page.locator('[data-voice-mode-footer]').count(), 1)
  assert.equal(await page.locator('.tv-vm[data-conversation-mode="voice"]').count(), 1, 'the menu says Voice')
  await shot(page, '03-voice-listening')

  // Silence opens no voice session; speech does, and the words show under the orb as they come.
  await page.waitForTimeout(600)
  assert.equal((await state(page)).hearing, false)
  await talk(page, true)
  await until(page, () => window.__vm.state().words.startsWith('Đổi màu nút'), 'the first words')
  assert.match(await page.locator('.tv-vo-line[data-voice-words]').textContent(), /^Đổi màu nút/)
  await shot(page, '04-voice-hearing')
  await until(page, () => window.__vm.state().sendAt !== null, 'the countdown')
  await talk(page, false)
  assert.equal(await page.locator('.tv-vo [data-voice-mode-action="send"]').count(), 1)
  assert.equal(await page.locator('.tv-vo [data-voice-mode-action="drop"]').count(), 1)
  await shot(page, '05-voice-sending')

  // Sent as the person's own message; Tracy says it heard.
  await until(page, () => window.__vm.sent().length === 1, 'the message')
  assert.deepEqual(await page.evaluate(() => window.__vm.sent()), ['Đổi màu nút liên hệ sang xanh lá.'])
  // Read when the voice started and kept for the page: it plays at once, with no reading asked now.
  assert.ok(
    readings.includes('Okay, on it.') && readings.includes('Got it. I will work that in now.'),
    readings.join(' | ')
  )
  const readBefore = readings.length
  await until(page, () => window.__vm.state().saying === 'Okay, on it.', 'the acknowledgement')
  assert.equal(readings.length, readBefore, 'played from the page’s copy')
  await page.waitForSelector('.tv-vo[data-voice-mode="speaking"]')
  await shot(page, '06-voice-acknowledged')
  await until(page, () => window.__vm.state().talking === null, 'the end of the acknowledgement')

  // Tracy works: its own words between calls are said, as a caption under the orb.
  await append(page, [
    { type: 'turn/start', data: { turn: 1 } },
    said('Mình xem trang chủ trước nhé.'),
    {
      type: 'tool/call',
      data: { callId: 'c1', name: 'tracy_site', arguments: '{"action":"content.locate"}' }
    }
  ])
  await until(page, () => window.__vm.state().tracy === 'working', 'Tracy at work')
  await until(page, () => window.__vm.state().talking === 'progress', 'the line said while working', 10_000)
  await readOut('Mình xem trang chủ trước nhé.')
  assert.equal(
    await page.locator('.tv-vo-line[data-voice-saying]').textContent(),
    'Mình xem trang chủ trước nhé.'
  )
  await shot(page, '07-voice-working-says')
  await until(page, () => window.__vm.state().talking === null, 'the end of the line')
  await page.waitForTimeout(400)
  await shot(page, '08-voice-working')

  // The person talks while Tracy works: steered into the work, as a person takes in a correction.
  await talk(page, true)
  await until(page, () => window.__vm.state().words.startsWith('Thêm số'), 'words while Tracy works')
  await shot(page, '09-voice-talking-while-working')
  // The person has said it: quiet now, as a person is. (While they still speak, it is never sent.)
  await talk(page, false)
  await until(page, () => window.__vm.sent().length === 2, 'the second message', 12_000)
  assert.equal((await page.evaluate(() => window.__vm.sent()))[1], 'Thêm số điện thoại vào chân trang.')
  await until(page, () => window.__vm.state().saying === 'Got it. I will work that in now.', 'the steer said')
  await until(page, () => window.__vm.state().talking === null, 'the end of it')

  // The reply, read out; the microphone loud meanwhile is never taken for the person.
  await append(page, [
    {
      type: 'tool/call',
      data: { callId: 'c2', name: 'tracy_site', arguments: '{"action":"content.replace"}' }
    },
    said('Xong rồi. Mình đã đổi nút **Liên hệ** sang màu xanh lá.\n\n- Trang chủ\n- Chân trang'),
    { type: 'turn/end', data: { turn: 1, reason: 'completed' } }
  ])
  await until(page, () => window.__vm.state().talking === 'reply', 'the reply read out')
  await readOut('Xong rồi. Mình đã đổi nút Liên hệ sang màu xanh lá. Trang chủ. Chân trang')
  await shot(page, '10-voice-reading-reply')
  // The person says "ừ ừ" over the reply: listening, so Tracy reads on. Then "khoan đã…": Tracy stops
  // at those words, hears them out, and the phrase goes like any other — Tracy answers that.
  await talk(page, true)
  for (const start = Date.now(); !confirmed.includes('Ừ ừ.'); ) {
    if (Date.now() - start > 10_000) assert.fail('the stand-in never confirmed “Ừ ừ.”')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  await page.waitForTimeout(150)
  assert.equal(
    await page.evaluate(() => window.__vm.state().talking),
    'reply',
    'still reading: the person was only listening'
  )
  assert.equal(await page.evaluate(() => window.__vm.sent().length), 2, '“ừ ừ” is not a message')
  await shot(page, '11-voice-listening-over-tracy')
  await until(
    page,
    () => window.__vm.state().talking === null && window.__vm.state().words.startsWith('Khoan'),
    'Tracy stopped for the person'
  )
  await shot(page, '12-voice-talking-over-tracy')
  await talk(page, false)
  await until(page, () => window.__vm.sent().length === 3, 'the phrase said over Tracy', 12_000)
  assert.equal((await page.evaluate(() => window.__vm.sent()))[2], 'Khoan đã, để màu đỏ thì hơn.')
  await until(page, () => window.__vm.state().talking === null, 'the end of the acknowledgement')

  // Mute in the footer pauses the ear; pressed again, it listens.
  assert.equal(
    await page.locator('[data-voice-mode-action="mute"] svg.lucide-mic').count(),
    1,
    'listening: a microphone'
  )
  await page.click('[data-voice-mode-footer] [data-voice-mode-action="mute"]')
  await until(page, () => window.__vm.state().phase === 'paused', 'muted')
  assert.equal(await page.locator('[data-voice-mode-action="mute"]').getAttribute('aria-pressed'), 'true')
  assert.equal(
    await page.locator('[data-voice-mode-action="mute"] svg.lucide-mic-off').count(),
    1,
    'muted: crossed out'
  )
  await shot(page, '13-voice-muted')
  await page.click('[data-voice-mode-footer] [data-voice-mode-action="mute"]')
  await until(page, () => window.__vm.state().phase === 'on', 'listening again')
  // A hidden page pauses it too; the orb takes it back.
  await page.evaluate(() => window.__vm.hide())
  await until(page, () => window.__vm.state().phase === 'paused', 'the pause')
  await page.click('.tv-vo-orb[data-voice-mode-action="resume"]')
  await until(page, () => window.__vm.state().phase === 'on', 'talking again')

  // Tracy works again: the footer has a Stop for the work, as the chat box's Stop it replaces.
  await append(page, [
    { type: 'turn/start', data: { turn: 2 } },
    {
      type: 'tool/call',
      data: { callId: 'c3', name: 'tracy_site', arguments: '{"action":"content.replace"}' }
    }
  ])
  await page.waitForSelector('[data-voice-mode-footer] [data-voice-mode-action="stop-work"]')
  await shot(page, '13b-voice-stop-work')
  await page.click('[data-voice-mode-footer] [data-voice-mode-action="stop-work"]')
  await until(page, () => window.__vm.cancels() === 1, 'the work stopped')
  await readOut('Stopped. Anything already saved stays.')
  await append(page, [{ type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted', reason: 'user' } } }])
  await page.waitForSelector('[data-voice-mode-footer] [data-voice-mode-action="stop-work"]', {
    state: 'detached'
  })

  // X: back to Chat, where the words sent are the person's messages; the voice is over.
  await page.click('[data-voice-mode-footer] [data-voice-mode-action="end"]')
  await until(page, () => window.__vm.state().phase === 'off', 'the end')
  await page.waitForSelector('[data-fixture="draft"]')
  assert.equal(await page.locator('.tv-vo').count(), 0)
  assert.equal(await page.locator('.tv-vm[data-conversation-mode="chat"]').count(), 1)
  assert.deepEqual(await page.locator('[data-fixture="user-message"]').allTextContents(), [
    'Đổi màu nút liên hệ sang xanh lá.',
    'Thêm số điện thoại vào chân trang.',
    'Khoan đã, để màu đỏ thì hơn.'
  ])
  await shot(page, '14-back-to-chat')

  assert.deepEqual(errors, [])
  await context.close()
})

test('the note introducing Voice: on the start screen, its arrow on the wave; pressed it goes into Voice; it shows once per account', async () => {
  const first = await open({ account: 'cross-browser' })
  await first.page.waitForSelector('[data-voice-tip]')
  const wave = await first.page.locator('.fx-activity [data-voice-mode-action="start"]').boundingBox()
  const tip = await first.page.locator('[data-voice-tip]').boundingBox()
  const arrow = await first.page.locator('.tv-vm-tip-arrow').boundingBox()
  assert.ok(arrow, 'the arrow is drawn')
  const middle = (b) => b.x + b.width / 2
  assert.ok(
    Math.abs(middle(arrow) - middle(wave)) <= 3,
    `the arrow points at the wave (${middle(arrow)} vs ${middle(wave)})`
  )
  assert.ok(tip.y + tip.height <= wave.y, 'above the chat box')
  // The chat box moves after the note shows (on the real page it did, and the arrow pointed beside
  // the wave): the arrow follows it.
  await first.page.evaluate(() => {
    const bar = document.querySelector('[data-slot="conversation.composer.bar"]')
    bar.style.marginRight = '72px'
  })
  await first.page.waitForTimeout(150)
  const moved = await first.page.locator('.fx-activity [data-voice-mode-action="start"]').boundingBox()
  const followed = await first.page.locator('.tv-vm-tip-arrow').boundingBox()
  assert.ok(Math.abs(moved.x - wave.x) > 20, 'the wave moved')
  assert.ok(
    Math.abs(middle(followed) - middle(moved)) <= 3,
    `the arrow follows the wave (${middle(followed)} vs ${middle(moved)})`
  )
  await first.page.evaluate(() => {
    document.querySelector('[data-slot="conversation.composer.bar"]').style.marginRight = ''
  })
  await first.page.waitForTimeout(150)
  await shot(first.page, '00-voice-tip')
  await first.page.click('[data-voice-tip-close]')
  assert.equal(await first.page.locator('[data-voice-tip]').count(), 0)
  // Into Voice and back: the note stays closed for this page.
  await first.page.click('.fx-activity [data-voice-mode-action="start"]')
  await first.page.waitForSelector('.tv-vo')
  await first.page.click('[data-voice-mode-footer] [data-voice-mode-action="end"]')
  await first.page.waitForSelector('[data-fixture="draft"]')
  assert.equal(await first.page.locator('[data-voice-tip]').count(), 0)
  // A reload does not bring it back: the signed-in account has seen it.
  await first.page.reload()
  await first.page.waitForSelector('[data-fixture="draft"]')
  await first.page.waitForTimeout(600)
  assert.equal(await first.page.locator('[data-voice-tip]').count(), 0, 'seen once, never again')
  assert.deepEqual(first.errors, [])
  await first.context.close()

  // The same account on a new browser never sees it again.
  const sameAccount = await open({ account: 'cross-browser' })
  await sameAccount.page.waitForTimeout(600)
  assert.equal(await sameAccount.page.locator('[data-voice-tip]').count(), 0)
  assert.deepEqual(sameAccount.errors, [])
  await sameAccount.context.close()

  // A different account on a new browser has its own note, which goes into Voice when pressed.
  const second = await open()
  await second.page.waitForSelector('[data-voice-tip]')
  await second.page.click('[data-voice-tip-start]')
  await second.page.waitForSelector('.tv-vo')
  assert.equal(await second.page.locator('[data-voice-tip]').count(), 0)
  await second.page.click('[data-voice-mode-footer] [data-voice-mode-action="end"]')
  await second.page.waitForSelector('[data-fixture="draft"]')
  assert.equal(await second.page.locator('[data-voice-tip]').count(), 0)
  assert.deepEqual(second.errors, [])
  await second.context.close()

  // Another new browser: seen without being touched is seen too; a reload shows nothing.
  const third = await open()
  await third.page.waitForSelector('[data-voice-tip]')
  await third.page.reload()
  await third.page.waitForSelector('[data-fixture="draft"]')
  await third.page.waitForTimeout(600)
  assert.equal(await third.page.locator('[data-voice-tip]').count(), 0, 'shown once is enough')
  // Nor does the header's place show it once the chat box's place has.
  const url = new URL(third.page.url())
  url.searchParams.set('tip', 'header')
  await third.page.goto(url.href)
  await third.page.waitForSelector('.tv-vm-pill')
  await third.page.waitForTimeout(600)
  assert.equal(await third.page.locator('[data-voice-tip]').count(), 0, 'one place, once')
  assert.deepEqual(third.errors, [])
  await third.context.close()
})

test('in a chat that has a header the note is under its Chat/Voice button, arrow on the button; pressed it goes into Voice', async () => {
  const one = await open({ query: '?tip=header' })
  await one.page.waitForSelector('[data-voice-tip="header"]')
  assert.equal(await one.page.locator('[data-voice-tip="wave"]').count(), 0, 'one note at a time')
  const pill = await one.page.locator('.tv-vm-pill').boundingBox()
  const tip = await one.page.locator('[data-voice-tip="header"]').boundingBox()
  const arrow = await one.page.locator('[data-voice-tip="header"] .tv-vm-tip-arrow').boundingBox()
  const middle = (b) => b.x + b.width / 2
  assert.ok(arrow, 'the arrow is drawn')
  assert.ok(
    Math.abs(middle(arrow) - middle(pill)) <= 3,
    `the arrow points at the button (${middle(arrow)} vs ${middle(pill)})`
  )
  assert.ok(tip.y >= pill.y + pill.height, 'under the button')
  assert.ok(tip.x >= 0 && tip.x + tip.width <= 760, 'inside the page')
  await shot(one.page, '00b-voice-tip-header')
  await one.page.click('[data-voice-tip-start]')
  await one.page.waitForSelector('.tv-vo')
  assert.equal(await one.page.locator('[data-voice-tip]').count(), 0)
  await one.page.click('[data-voice-mode-footer] [data-voice-mode-action="end"]')
  await one.page.waitForSelector('[data-fixture="draft"]')
  assert.equal(await one.page.locator('[data-voice-tip]').count(), 0, 'closed for this page')
  assert.deepEqual(one.errors, [])
  await one.context.close()

  // Opening the Chat/Voice menu the note points at closes the note for good: the person found it.
  const two = await open({ query: '?tip=header' })
  await two.page.waitForSelector('[data-voice-tip="header"]')
  await two.page.click('.tv-vm-pill')
  await two.page.waitForSelector('[role="menu"]')
  assert.equal(await two.page.locator('[data-voice-tip]').count(), 0)
  await two.page.keyboard.press('Escape')
  await two.page.waitForTimeout(600)
  assert.equal(await two.page.locator('[data-voice-tip]').count(), 0, 'the menu closed the note')
  assert.deepEqual(two.errors, [])
  await two.context.close()
})

test('into Voice from the chat box, out by another tab; dark; a narrow column', async () => {
  const one = await open()
  // The audio wave beside the microphone goes into Voice too (a new chat has no header menu yet).
  await one.page.click('.fx-activity [data-voice-mode-action="start"]')
  await until(one.page, () => window.__vm.state().phase === 'on', 'the microphone')
  await one.page.waitForSelector('.tv-vo')
  // Another tab leaves Voice, and leaving the view ends the voice.
  await one.page.click('[data-conversation-tabs] [data-view="comments"]')
  await until(one.page, () => window.__vm.state().phase === 'off', 'the voice ended with the view')
  assert.equal(await one.page.locator('[data-fixture="draft"]').count(), 1, 'the chat box is back')
  assert.deepEqual(one.errors, [])
  await one.context.close()

  const dark = await open({ scheme: 'dark' })
  await dark.page.click('.tv-vm-pill')
  await dark.page.waitForSelector('[role="menu"]')
  await shot(dark.page, '15-dark-mode-menu')
  await dark.page.click('[data-conversation-mode-pick="voice"]')
  await until(dark.page, () => window.__vm.state().phase === 'on', 'the microphone')
  await talk(dark.page, true)
  await until(dark.page, () => window.__vm.state().sendAt !== null, 'the countdown')
  await talk(dark.page, false)
  await shot(dark.page, '16-dark-voice-sending')
  await dark.context.close()

  const narrow = await open({ width: 390, height: 720 })
  await narrow.page.click('.tv-vm-pill')
  await narrow.page.waitForSelector('[role="menu"]')
  const box = await narrow.page.locator('[role="menu"]').boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `the menu stays on screen (${JSON.stringify(box)})`)
  await narrow.page.click('[data-conversation-mode-pick="voice"]')
  await until(narrow.page, () => window.__vm.state().phase === 'on', 'the microphone')
  await talk(narrow.page, true)
  await until(narrow.page, () => window.__vm.state().words !== '', 'the words')
  const scroll = await narrow.page.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(scroll <= 390, `no sideways scroll (${scroll})`)
  await shot(narrow.page, '17-narrow-voice-hearing')
  assert.deepEqual(narrow.errors, [])
  await narrow.context.close()
})
