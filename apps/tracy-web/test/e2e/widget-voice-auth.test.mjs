/** Real widget assets, with synthetic speech and API responses. No email or provider calls. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const { chromium } = createRequire(new URL('../../../tracy-host/package.json', import.meta.url))('playwright')

import { fr } from '../_widget-auth-language.mjs'

const assets = new URL('../../src/widget/assets/', import.meta.url)
let browser, server, base, temp
before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'tracy-widget-voice-'))
  // Continuous PCM tone makes Chromium's fake microphone deterministic, including VAD.
  const samples = 16000 * 20
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16000, 24)
  wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(5000 * Math.sin((i * Math.PI) / 20)), 44 + i * 2)
  await writeFile(join(temp, 'tone.wav'), wav)
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    const file = path === '/widget' ? 'index.html' : path.match(/^\/widget\/assets\/([a-z.-]+)$/)?.[1]
    if (!file) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const body = await readFile(new URL(file, assets))
      res.writeHead(200, {
        'content-type': file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.json')
              ? 'application/json'
              : 'text/javascript'
      })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + server.address().port
  browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-features=MacAppCodeSignClone',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + join(temp, 'tone.wav')
    ]
  })
})
after(async () => {
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  if (temp) await rm(temp, { recursive: true, force: true })
})

async function fixture(language = 'en') {
  const context = await browser.newContext({
    locale: language.replace('_', '-'),
    viewport: { width: 390, height: 844 },
    permissions: ['microphone']
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = [],
    emails = [],
    codes = [],
    turns = [],
    spoken = [],
    sockets = [],
    natives = []
  const history = Array.from({ length: 24 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    text: 'A website for my architecture studio, with a gallery and contact details. Conversation ' + i
  }))
  const state = {
    history,
    brief: { platform: 'wordpress' },
    selectedTemplate: 'studio',
    selectedSystem: 'design',
    templateIds: [],
    systemIds: [],
    speech: {
      available: true,
      provider: 'fixture',
      revision: 'fixture-r1',
      voices: [{ id: 'fixture' }],
      capabilities: { listen: true, speak: true },
      speak: { maxChars: 600 }
    }
  }
  let signedIn = false
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.widgetTracks = []
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await get(options)
      window.widgetTracks.push(...stream.getTracks())
      return stream
    }
  })
  await page.route('**/widget/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    const body = request.postData() ? JSON.parse(request.postData()) : {}
    let data = { ok: true }
    if (path.endsWith('/state')) data = { ...state, signedIn }
    if (path.endsWith('/catalogue'))
      data = {
        templates: [
          { id: 'studio', label: 'Studio', platforms: [{ platform: 'wordpress', tag: 'fixture' }], card: {} }
        ],
        systems: [{ id: 'design', name: 'Design', colors: [] }]
      }
    if (path.endsWith('/auth/language')) {
      assert.deepEqual(body, { language: 'fr' })
      data = fr
    }
    if (path.endsWith('/auth/email')) emails.push(body.email)
    if (path.endsWith('/auth/verify')) {
      codes.push(body.code)
      signedIn = body.code === '012345'
    }
    if (path.endsWith('/auth/status')) data = { signedIn }
    if (path.endsWith('/native/open')) {
      natives.push(body)
      data = { sessionId: 'native-fixture', url: 'about:blank', expandedUrl: 'about:blank' }
    }
    if (path.endsWith('/turn')) {
      turns.push(body.message)
      data = { ...state, speak: 'Your choices are kept.' }
    }
    await route.fulfill({ json: data })
  })
  await page.route('**/widget/backend/api/speech', (route) => route.fulfill({ json: state.speech }))
  await page.route('**/widget/backend/api/speech/say', async (route) => {
    spoken.push(JSON.parse(route.request().postData()).text)
    await route.fulfill({
      contentType: 'application/octet-stream',
      headers: { 'x-sample-rate': '24000' },
      body: Buffer.alloc(4800)
    })
  })
  await page.routeWebSocket('**/widget/api/speech/stream**', (ws) => {
    const socket = { ws, words: [] }
    sockets.push(socket)
    ws.send(JSON.stringify({ ...state.speech, type: 'ready', sessionToken: 'fixture-session' }))
    ws.send(JSON.stringify({ type: 'language', code: language }))
  })
  const send = (text) => {
    const socket = sockets.at(-1)
    socket.words.push(text)
    socket.ws.send(JSON.stringify({ type: 'committed', text }))
  }
  const listening = () =>
    page.waitForFunction(() => document.querySelector('#voice-status')?.textContent.startsWith('Listening'))
  await page.goto(base + '/widget')
  await page.locator('#mic').click()
  await listening()
  return { context, page, errors, emails, codes, turns, spoken, sockets, natives, send, listening }
}

test('mobile voice keeps the orb and composer visible while scrolling, browsing and resizing', async () => {
  const h = await fixture(),
    { page } = h
  try {
    assert.equal(await page.locator('nav').isVisible(), false)
    assert.equal(await page.locator('h1').isVisible(), false)
    assert.equal(await page.locator('.catalogue-panel').isVisible(), false)
    assert.equal(await page.locator('.bubble').count(), 24)
    const presence = await page.locator('.voice-presence').boundingBox()
    await page.locator('.transcript').evaluate((el) => {
      el.scrollTop = 0
    })
    assert.deepEqual(await page.locator('.voice-presence').boundingBox(), presence)
    assert.ok(presence.y + presence.height < (await page.locator('.live-dock').boundingBox()).y)
    const track = await page.evaluate(() => window.widgetTracks[0].id)
    await page.locator('.mobile-browse').click()
    assert.equal(await page.locator('.catalogue-panel').isVisible(), true)
    assert.equal(await page.locator('.voice-presence').isVisible(), true)
    await page.locator('.mobile-browse').click()
    assert.equal(await page.evaluate(() => window.widgetTracks[0].id), track)
    await page.setViewportSize({ width: 360, height: 500 })
    await page.waitForFunction(
      () => document.querySelector('.live-dock').getBoundingClientRect().bottom <= innerHeight
    )
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(h.errors, [])
  } finally {
    await h.context.close()
  }
})

async function checkSpokenSignIn(language) {
  const h = await fixture(language),
    { page } = h
  try {
    const track = await page.evaluate(() => window.widgetTracks[0].id)
    await page.evaluate(() => window.widgetLogin())
    await page.locator('#auth-email').waitFor()
    await h.listening()
    const count = h.sockets.length
    assert.ok(
      h.spoken.some((text) =>
        text.includes(
          language.startsWith('vi')
            ? 'đọc địa chỉ email'
            : language.startsWith('fr')
              ? 'Dites votre adresse'
              : 'say your email address'
        )
      )
    )
    h.send('h a at gmail dot com')
    await page.locator('.auth-confirm').waitFor()
    await h.listening()
    assert.equal(await page.locator('#auth-email').inputValue(), 'ha@gmail.com')
    assert.equal(h.emails.length, 0)
    assert.ok(
      h.spoken.some(
        (text) =>
          text.includes(language.startsWith('fr') ? 'H comme Hotel' : 'H as in Hotel') &&
          text.includes(language.startsWith('fr') ? 'A comme Alpha' : 'A as in Alpha')
      )
    )
    h.send(language.startsWith('vi') ? 'đúng' : language.startsWith('fr') ? 'oui' : 'yes')
    await page.locator('#auth-code').waitFor()
    await h.listening()
    assert.equal(h.sockets.length, count)
    h.send(
      language.startsWith('vi')
        ? 'không một hai ba bốn năm'
        : language.startsWith('fr')
          ? 'zéro un deux trois quatre cinq'
          : 'zero one two three four five'
    )
    await page.locator('#auth-host').waitFor({ state: 'detached' })
    assert.deepEqual(h.emails, ['ha@gmail.com'])
    assert.deepEqual(h.codes, ['012345'])
    assert.equal(await page.evaluate(() => JSON.stringify(sessionStorage).includes('012345')), false)
    // Signed in, the conversation moves into the native frame (d0de80f03e): the widget's own
    // microphone was the same one all along and is now released, and the frame is asked to start voice.
    await page.locator('#native-conversation[data-session="native-fixture"]').waitFor()
    assert.equal(h.natives.length, 1)
    assert.deepEqual(
      await page.evaluate(() => window.widgetTracks.map((t) => ({ id: t.id, state: t.readyState }))),
      [{ id: track, state: 'ended' }]
    )
    const frame = page.frames().find((f) => f !== page.mainFrame())
    const handed = await frame.evaluate(
      (origin) =>
        new Promise((resolve) => {
          addEventListener('message', (event) => resolve(event.data))
          parent.postMessage({ type: 'tracy-widget-native-ready', sessionId: 'native-fixture' }, origin)
        }),
      base
    )
    assert.equal(handed.type, 'tracy-widget-native-draft')
    assert.equal(handed.sessionId, 'native-fixture')
    assert.equal(handed.startVoice, true)
    assert.equal(h.sockets.length, count)
    assert.deepEqual(h.turns, [])
    assert.equal(
      h.spoken.some((text) => text.includes('012345')),
      false
    )
    assert.deepEqual(h.errors, [])
  } finally {
    await h.context.close()
  }
}

test('voice sign-in confirms the spoken email and verifies OTP without replacing the microphone', () =>
  checkSpokenSignIn('en'))
test('Vietnamese regional voice guide accepts spoken confirmation and six digits on the same microphone', () =>
  checkSpokenSignIn('vi-VN'))

test('French voice sign-in loads public instructions and verifies localized confirmation and digits privately', () =>
  checkSpokenSignIn('fr-FR'))
