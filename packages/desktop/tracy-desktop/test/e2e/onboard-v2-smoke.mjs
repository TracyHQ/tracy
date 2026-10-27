/**
 * Smoke for desktop first-run v2 (tasks/todo-desktop-onboard-v2.md, package B), app FROM SOURCE
 * against a stand: a fresh profile (first run) lands on `/login?onboard=1`; the email door is taken
 * by the app (a desktop round, the waiting page in the Setup frame, words in the OS language); dsh's
 * `__DSH_LOCALE__` is there on the product page and answers the OS languages.
 *
 *   node test/e2e/onboard-v2-smoke.mjs [origin]      # default http://tracy.test:8080
 */
import assert from 'node:assert/strict'
import { launchFromSource } from './launch.mjs'

const origin = process.argv[2] ?? 'http://tracy.test:8080'
const { app, window } = await launchFromSource({ origin })
try {
  await window.waitForURL((url) => url.pathname === '/login', { timeout: 30_000 })
  const login = new URL(window.url())
  assert.equal(login.searchParams.get('onboard'), '1', `first run marks the sign-in page: ${window.url()}`)
  console.log(`first run: ${window.url()}`)

  const locale = await window.evaluate(async () =>
    globalThis.__DSH_LOCALE__ ? globalThis.__DSH_LOCALE__.read() : null
  )
  const system = await app.evaluate(({ app: electronApp }) => electronApp.getPreferredSystemLanguages())
  assert.deepEqual(locale?.languages, system, '__DSH_LOCALE__ answers the OS languages')
  console.log(`__DSH_LOCALE__.read() = ${JSON.stringify(locale)}`)

  // The email door: the app must take it (no request reaches the server's /signin/email).
  await window.evaluate((home) => {
    location.href = `${home}/signin/email?email=${encodeURIComponent('smoke@example.com')}`
  }, origin)
  await window.waitForURL((url) => url.protocol === 'file:', { timeout: 30_000 })
  const waiting = new URL(window.url())
  assert.equal(waiting.searchParams.get('email'), 'smoke@example.com')
  assert.equal(waiting.searchParams.get('setup'), '1')
  const shown = await window.evaluate(() => ({
    setup: !document.getElementById('setup').hidden,
    code: document.getElementById('code').textContent,
    lang: document.documentElement.lang
  }))
  assert.equal(shown.setup, true, 'the waiting page draws the Setup frame on a first run')
  assert.ok(shown.code.length > 0, 'the match code shows')
  console.log(`waiting page: ${JSON.stringify(shown)}`)

  // Cancel goes back to the sign-in page, marked again.
  await window.click('#cancel')
  await window.waitForURL((url) => url.pathname === '/login', { timeout: 30_000 })
  assert.equal(new URL(window.url()).searchParams.get('onboard'), '1')
  console.log(`after Cancel: ${window.url()}`)
  console.log('onboard-v2 smoke: PASS')
} finally {
  await app.close()
}
