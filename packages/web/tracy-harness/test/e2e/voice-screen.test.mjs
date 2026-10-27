/**
 * /ops › Agents › Voice in a real browser: the real `Voice` screen with the shipped /ops stylesheet,
 * against the real `GET /api/ops/speech`, `PUT /api/ops/speech/key` and key test doors
 * (`apps/tracy-web/src/ops/speech.js`) over an in-memory database, and a stand-in for the speech
 * service that accepts one key and refuses another for a missing permission. `PUT /api/ops/ui` is
 * a stand-in that keeps the one switch, as the real door's tests cover it.
 *
 * Checked: where the key comes from (environment, then saved here), the test saying what the
 * service answered, the key never shown back, the switch pressing the User Interface door and the
 * "what customers see" line following it, Remove asking first, and a staff member who may not
 * press. `VOICE_SCREEN_SHOTS=<dir>` keeps a screenshot of each step.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { opsI18nPlugin } from '../support/ops-i18n-esbuild.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const require = createRequire(resolve(repo, 'package.json'))
const hostRequire = createRequire(resolve(repo, 'apps/tracy-host/package.json'))
const webRequire = createRequire(resolve(repo, 'apps/tracy-web/package.json'))
const harnessRequire = createRequire(resolve(repo, 'packages/web/tracy-harness/package.json'))
const web = (path) => import(pathToFileURL(resolve(repo, 'apps/tracy-web/src', path)).href)

const { speechOpsRoutes } = await web('ops/speech.js')
const { mintSession, SESSION_COOKIE } = await web('lib/session.js')
const { Hono } = await import(pathToFileURL(webRequire.resolve('hono')).href)
const { serve } = webRequire('@hono/node-server')
const playwright = await import(pathToFileURL(hostRequire.resolve('playwright')).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const SHOTS = process.env.VOICE_SCREEN_SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const SECRET = 'voice-screen-secret'
const GOOD = 'sk_good_0123456789abcdef0123'
const NO_PERMISSION = 'sk_tts_only_0123456789abcd'

/** The database, as far as these doors read it. */
const db = {
  role: 'admin',
  switchOn: undefined,
  row: null,
  presses: [],
  modelCache: null,
  modelsRefused: false
}
const pool = {
  async query(sql, params) {
    if (sql.startsWith('select models')) return { rows: db.modelCache ? [db.modelCache] : [] }
    if (sql.startsWith('insert into speech_model_cache')) {
      db.modelCache = { models: JSON.parse(params[1]), read_at: params[2], fingerprint: params[3] }
      return { rows: [] }
    }
    if (sql.includes('seat_workspace')) return { rows: db.role ? [{ role: db.role }] : [] }
    if (sql.includes('ui_setting')) return { rows: db.switchOn === undefined ? [] : [{ on: db.switchOn }] }
    if (sql.startsWith('select provider')) return { rows: db.row ? [db.row] : [] }
    if (sql.startsWith('select api_key_cipher')) return { rows: db.row ? [db.row] : [] }
    if (sql.includes('insert into speech_setting')) {
      db.row = {
        api_key_cipher: params[0],
        updated_by: params[1],
        updated_at: new Date('2026-10-15T03:12:00Z')
      }
      return { rows: [] }
    }
    if (sql.includes('rate_bucket')) return { rows: [{ minutes: 37, accounts: 4 }] }
    throw new Error(`unexpected query: ${sql}`)
  }
}
/** The speech service: one key may open sessions, one lacks the permission. */
const service = async (_url, init) =>
  String(_url).endsWith('/models')
    ? db.modelsRefused
      ? new Response('{}', { status: 401 })
      : Response.json([
          { model_id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', can_do_text_to_speech: true },
          { model_id: 'eleven_v3', name: 'Eleven v3', can_do_text_to_speech: true },
          { model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true }
        ])
    : init.headers['xi-api-key'] === GOOD
      ? new Response(JSON.stringify({ token: 'sutkn_e2e' }), { status: 200 })
      : new Response(
          JSON.stringify({
            detail: {
              status: 'missing_permissions',
              message:
                'The API key you used is missing the permission speech_to_text to execute this operation.'
            }
          }),
          { status: 401 }
        )

let server
let origin
let browser

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents:
        "import React from 'react'; import {createRoot} from 'react-dom/client'; import {Voice} from './Voice'; createRoot(document.getElementById('root')).render(React.createElement(Voice));",
      resolveDir: resolve(repo, 'packages/web/tracy-harness/src'),
      loader: 'tsx'
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [opsI18nPlugin()],
    write: false,
    logLevel: 'silent'
  })
  const { build } = await import(pathToFileURL(harnessRequire.resolve('vite')).href)
  const harness = await build({
    root: resolve(repo, 'packages/web/tracy-harness'),
    configFile: resolve(repo, 'packages/web/tracy-harness/vite.config.ts'),
    build: { write: false },
    logLevel: 'silent'
  })
  const css = (Array.isArray(harness) ? harness : [harness])
    .flatMap((r) => r.output)
    .filter((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
    .map((o) => String(o.source))
    .join('\n')
  assert.ok(css.length > 0, 'the production /ops stylesheet')

  const app = new Hono()
  app.put('/api/ops/ui', async (c) => {
    const body = await c.req.json()
    db.presses.push(body)
    db.switchOn = body.switches['composer-voice-input']
    return c.json({ hidden: db.switchOn ? [] : ['composer-voice-input'] })
  })
  const routes = () =>
    speechOpsRoutes({
      pool,
      config: { origin, sessionSecret: SECRET, speech: { apiKey: 'sk_env_key_123456' } },
      fetchImpl: service,
      log: { log() {} }
    })
  app.all('/api/ops/speech/*', (c) => routes().fetch(c.req.raw))
  app.all('/api/ops/speech', (c) => routes().fetch(c.req.raw))
  app.get(
    '/stand.js',
    () => new Response(built.outputFiles[0].text, { headers: { 'content-type': 'text/javascript' } })
  )
  app.get('/stand.css', () => new Response(css, { headers: { 'content-type': 'text/css' } }))
  app.get('/', (c) =>
    c.html(
      `<!doctype html><html${new URL(c.req.url).searchParams.get('dark') ? ' class="dark"' : ''}><head><meta charset="utf-8"><link rel="stylesheet" href="/stand.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/stand.js"></script></body></html>`
    )
  )
  await new Promise((done) => {
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info) => {
      origin = `http://127.0.0.1:${info.port}`
      done()
    })
  })
  const args = ['--disable-features=MacAppCodeSignClone', '--proxy-server=direct://']
  browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
})

after(async () => {
  await browser?.close()
  server?.close()
})

async function open({ dark = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 })
  await context.addCookies([
    { name: SESSION_COOKIE, value: await mintSession('ops@example.com', SECRET), url: origin }
  ])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${origin}/${dark ? '?dark=1' : ''}`)
  await page.waitForSelector('[data-voice-key]', { timeout: 15_000 })
  return { page, context, errors }
}
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}
const sourceOf = (page) => page.locator('[data-voice-key-source]').getAttribute('data-voice-key-source')

test('the key: from the environment at first, tested, saved here, never shown back, removed after asking', async () => {
  db.role = 'admin'
  db.switchOn = undefined
  db.row = null
  const { page, context, errors } = await open()
  assert.equal(await sourceOf(page), 'env')
  assert.match(
    await page.locator('[data-voice-key]').innerText(),
    /SPEECH_TO_TEXT_API_KEY \(sk_… \(17 chars\)\)/
  )
  assert.equal(
    await page.locator('[data-voice-seen]').innerText(),
    'Microphone shown in every chat and comment box'
  )
  await shot(page, '01-voice-key-from-environment')

  const field = page.getByLabel('Speech key')
  await field.fill(NO_PERMISSION)
  await page.getByRole('button', { name: 'Test', exact: true }).click()
  await page.waitForSelector('[data-voice-test="failed"]')
  assert.match(await page.locator('[data-voice-test]').innerText(), /missing the permission speech_to_text/)
  await shot(page, '02-voice-key-test-missing-permission')

  await field.fill(GOOD)
  await page.getByRole('button', { name: 'Test', exact: true }).click()
  await page.waitForSelector('[data-voice-test="ok"]')
  await page.getByRole('button', { name: 'Save key' }).click()
  await page.waitForFunction(
    () => document.querySelector('[data-voice-key-source]')?.getAttribute('data-voice-key-source') === 'ops'
  )
  assert.equal(await field.inputValue(), '', 'the field is emptied after a save')
  const text = await page.locator('[data-voice-key]').innerText()
  assert.match(text, /Saved here \(sk_… \(28 chars\)\) by ops@example\.com/)
  assert.ok(!(await page.content()).includes(GOOD), 'the key is never on the page after a save')
  assert.ok(!db.row.api_key_cipher.includes(GOOD))
  await shot(page, '03-voice-key-saved-here')

  await page.getByRole('button', { name: 'Remove saved key…' }).click()
  assert.equal(await sourceOf(page), 'ops', 'the first press only asks')
  await shot(page, '04-voice-key-remove-asks')
  await page.getByRole('button', { name: 'Remove key' }).click()
  await page.waitForFunction(
    () => document.querySelector('[data-voice-key-source]')?.getAttribute('data-voice-key-source') === 'env'
  )
  assert.deepEqual(errors, [])
  await context.close()
})

test('the switch presses the User Interface door; off, customers see no microphone', async () => {
  db.role = 'admin'
  db.switchOn = undefined
  db.presses = []
  const { page, context } = await open()
  const toggle = page.getByRole('switch', { name: 'Voice input' })
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await toggle.click()
  await page.waitForFunction(
    () => document.querySelector('[data-voice-seen]')?.getAttribute('data-voice-seen') === 'off'
  )
  assert.deepEqual(db.presses, [{ switches: { 'composer-voice-input': false } }])
  assert.equal(await page.locator('[data-voice-seen]').innerText(), 'No microphone: voice is off')
  await page.waitForFunction(
    () => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false'
  )
  await page.waitForTimeout(400)
  await shot(page, '05-voice-switched-off')
  await toggle.click()
  await page.waitForFunction(
    () => document.querySelector('[data-voice-seen]')?.getAttribute('data-voice-seen') === 'on'
  )
  assert.deepEqual(db.presses.at(-1), { switches: { 'composer-voice-input': true } })
  await context.close()
})

test('staff who may not press: the switch is read-only and no key field is drawn', async () => {
  db.role = 'member'
  db.switchOn = undefined
  const { page, context } = await open({ dark: true })
  assert.equal(await page.getByRole('switch', { name: 'Voice input' }).isDisabled(), true)
  assert.equal(await page.getByLabel('Speech key').count(), 0)
  await shot(page, '06-voice-read-only-dark')
  db.role = 'admin'
  await context.close()
})

test('speech model dropdowns retain draft choices when metadata refresh fails and disable incompatible transports', async () => {
  db.role = 'admin'
  db.modelsRefused = false
  const { context, page } = await open()
  await page.getByLabel('Provider', { exact: true }).selectOption('elevenlabs')
  await page.getByRole('button', { name: 'Get model list', exact: true }).click()
  const tts = page.getByLabel('Text-to-Speech (TTS)', { exact: true })
  await tts.locator('option[value=eleven_v3]').waitFor({ state: 'attached' })
  assert.equal(await tts.locator('option[value=eleven_v4]').evaluate((option) => option.disabled), false)
  assert.equal(
    await page
      .getByLabel('Speech-to-Text (STT)', { exact: true })
      .locator('option[value=scribe_v2]')
      .evaluate((option) => option.disabled),
    true
  )
  await tts.selectOption('eleven_v4')
  db.modelsRefused = true
  await page.getByRole('button', { name: 'Get model list', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Could not refresh model list' }).waitFor()
  assert.equal(await tts.inputValue(), 'eleven_v4')
  assert.equal(await page.getByLabel('Provider', { exact: true }).inputValue(), 'elevenlabs')
  assert.ok((await page.getByLabel('Speech model list').inputValue()).includes('eleven_v4'))
  db.modelsRefused = false
  await context.close()
})
