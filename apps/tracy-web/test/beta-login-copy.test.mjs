/**
 * #811 F-S1-008 — the sign-in code step does not say a mail was sent when none was.
 *
 * With the beta gate on, `POST /login` answers every address alike (it must not tell an admitted
 * address from a refused or a rate-limited one), and the page moves to the code step. That step
 * used to read "We sent an email to …" — also on the rate-limited branch, which queues nothing and
 * sends nothing, and on the queued branch, where no letter has left yet and the queue's own cap or
 * the admission decision may mean a sign-in code never does.
 *
 * WHAT THIS FILE RUNS. The real `identityRoutes` and `loginPage`, the real `createBetaLogin` queue
 * (in memory) for the queue's own cap, and the page's inline script inside a linkedom document
 * with a recorded `fetch`. WHAT IT DOES NOT. No PostgreSQL, no mail provider, no browser: the
 * script's DOM is linkedom's and its form submission is a dispatched event.
 *
 *   node --test apps/tracy-web/test/beta-login-copy.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseHTML } from 'linkedom'

import { readConfig } from '../src/config.js'
import { loginPage } from '../src/identity/pages.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { generateCode, hashCode } from '../src/identity/otp.js'
import { createBetaLogin } from '../src/lib/beta-login.js'
import { WEB_LANGUAGES, translate } from '../src/lib/i18n/index.js'

const ORIGIN = 'http://tracy.test'
const EMAIL = 'person@example.test'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/** "We sent an email to <address>." in a language, as the page would print it for `EMAIL`. */
const sentClaim = (lang) => translate(lang, 'login.sentTo', { email: EMAIL })
const neutral = (lang) => translate(lang, 'login.codeFor', { email: EMAIL })

/**
 * The sign-in doors over fixtures. `beta` is the gate as `identityRoutes` sees it: `null` (off), or
 * a recorder standing in for the queue. `over` is what the mail limiter answers.
 */
function harness({ beta = null, over = false, extraEnv = {} } = {}) {
  const sent = []
  const queued = []
  const gate =
    beta === 'recorder'
      ? { access: { enabled: true }, enqueue: async (email, via, lang) => void queued.push({ email, lang }) }
      : beta
  const app = identityRoutes({
    store: memoryIdentityStore(),
    mail: { send: async (m) => void sent.push(m), signInCodeMail: (code) => ({ text: code }) },
    config: readConfig({ ...env, ...extraEnv }),
    beta: gate,
    mailRate: { over: async () => over, overLane: async () => over }
  })
  const form = (fields, query = '') =>
    app.fetch(
      new Request(`${ORIGIN}/login${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString()
      })
    )
  const json = (body, query = '') =>
    app.fetch(
      new Request(`${ORIGIN}/login${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  const page = (query = '') => app.fetch(new Request(`${ORIGIN}/login${query}`))
  return { app, sent, queued, form, json, page }
}

/** The step a page shows, and the words of that step as a reader sees them. */
function shownStep(html) {
  const { document } = parseHTML(html)
  const steps = [...document.querySelectorAll('.auth-card')]
  const visible = steps.filter((el) => !el.hasAttribute('hidden'))
  assert.equal(visible.length, 1, 'exactly one step shows')
  return { id: visible[0].id, text: visible[0].textContent.replace(/\s+/g, ' '), document }
}
const codeStepText = (html) =>
  parseHTML(html).document.getElementById('code-step').textContent.replace(/\s+/g, ' ')

test('F-S1-008: beta on and rate-limited — the code step shows and does not say a mail was sent', async () => {
  const h = harness({ beta: 'recorder', over: true })
  const res = await h.form({ email: EMAIL })
  assert.equal(res.status, 200, 'the answer stays the same as for any other address')
  const shown = shownStep(await res.text())
  assert.equal(shown.id, 'code-step')
  assert.ok(!shown.text.includes(sentClaim('en')), `claims a mail: ${shown.text}`)
  assert.doesNotMatch(shown.text, /We sent/)
  assert.ok(shown.text.includes(neutral('en')), 'names the address the code is for')
  assert.equal(h.sent.length, 0, 'no mail left')
  assert.equal(h.queued.length, 0, 'nothing was queued')
})

test('F-S1-008: no language claims a mail on the rate-limited beta branch', async () => {
  for (const lang of WEB_LANGUAGES) {
    const h = harness({ beta: 'recorder', over: true })
    const shown = shownStep(await (await h.form({ email: EMAIL }, `?lang=${lang}`)).text())
    assert.equal(shown.id, 'code-step', lang)
    assert.ok(!shown.text.includes(sentClaim(lang)), `${lang}: ${shown.text}`)
    assert.ok(shown.text.includes(neutral(lang)), `${lang}: the neutral sentence`)
    assert.equal(h.sent.length + h.queued.length, 0, lang)
  }
})

test('F-S1-008: beta answers a queued and a rate-limited request with the same page and the same JSON', async () => {
  const limited = harness({ beta: 'recorder', over: true })
  const queued = harness({ beta: 'recorder', over: false })
  const [a, b] = [await limited.form({ email: EMAIL }), await queued.form({ email: EMAIL })]
  assert.equal(a.status, b.status)
  assert.equal(await a.text(), await b.text(), 'the page does not tell the two apart')
  const [ja, jb] = [await limited.json({ email: EMAIL }), await queued.json({ email: EMAIL })]
  assert.equal(ja.status, 200)
  assert.deepEqual(await ja.json(), { ok: true })
  assert.deepEqual(await jb.json(), { ok: true })
  // The queue is asked once per admitted request and never by a limited one; no mail leaves here.
  assert.equal(limited.queued.length, 0)
  assert.deepEqual(queued.queued, [
    { email: EMAIL, lang: 'en' },
    { email: EMAIL, lang: 'en' }
  ])
  assert.equal(limited.sent.length + queued.sent.length, 0)
  // Queued is not sent either: the code step makes no claim on that branch.
  assert.ok(!codeStepText(await (await queued.form({ email: EMAIL })).text()).includes(sentClaim('en')))
})

test('F-S1-008: the queue’s own cap sends nothing, and the page still makes no claim', async () => {
  const sent = []
  const store = memoryIdentityStore()
  const config = readConfig(env)
  const beta = createBetaLogin({
    access: {
      enabled: true,
      decide: async () => ({ status: 'allow', badge: 'test', plans: [], gate: true })
    },
    identity: store,
    mail: { send: async (m) => void sent.push(m), signInCodeMail: (code) => ({ text: code }) },
    otp: { generateCode, hashCode },
    config,
    signal: { record: async () => {} },
    log: { log() {}, warn() {}, error() {} }
  })
  const h = harness({ beta })
  try {
    let last = ''
    for (let i = 0; i < 8; i++) {
      const res = await h.form({ email: EMAIL })
      assert.equal(res.status, 200, `request ${i}`)
      last = await res.text()
    }
    await beta.drain()
    assert.ok(sent.length <= 5, `the queue caps what it sends (${sent.length})`)
    assert.ok(!shownStep(last).text.includes(sentClaim('en')))
  } finally {
    beta.stop?.()
  }
})

/** Run the page's own script over its document; `answer` is what the door says to each request. */
async function scripted(html, answer) {
  const { document, window } = parseHTML(html)
  const calls = []
  const fetchImpl = async (url, init) => {
    // The visit beacon (`POST /login/visit`) fires on every page; it is not a sign-in request.
    if (String(url) === '/login/visit') return new Response(null, { status: 204 })
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return answer(calls.length)
  }
  const script = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n')
  for (const el of document.querySelectorAll('input, button'))
    if (typeof el.focus !== 'function') el.focus = () => {}
  new Function('document', 'window', 'fetch', 'location', script)(document, window, fetchImpl, {
    assign() {},
    href: `${ORIGIN}/login`
  })
  const submit = async (formId) => {
    const form = document.getElementById(formId)
    const event = new window.Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const visible = () =>
    [...document.querySelectorAll('.auth-card')].filter((el) => !el.hidden && !el.hasAttribute('hidden'))
  return { document, calls, submit, visible }
}

test('F-S1-008: with script, the step the page moves to makes no claim — first request and resend', async () => {
  const h = harness({ beta: 'recorder', over: true })
  const html = await (await h.page()).text()
  // The door's real answer on the rate-limited beta branch, replayed to the page's script.
  const door = await h.json({ email: EMAIL })
  assert.equal(door.status, 200)
  const said = await door.json()
  const ui = await scripted(html, () => Response.json(said))
  ui.document.getElementById('login-email').value = EMAIL
  await ui.submit('email-form')
  assert.equal(ui.calls.length, 1)
  assert.deepEqual(ui.calls[0].body, { email: EMAIL })
  let step = ui.document.getElementById('code-step')
  assert.ok(!step.hasAttribute('hidden') || step.hidden === false, 'the code step shows')
  let text = step.textContent.replace(/\s+/g, ' ')
  assert.ok(!text.includes(sentClaim('en')), `claims a mail: ${text}`)
  assert.ok(text.includes(neutral('en')))

  await ui.submit('resend-form')
  assert.equal(ui.calls.length, 2, 'resend asks the same door again')
  assert.deepEqual(ui.calls[1].body, { email: EMAIL })
  step = ui.document.getElementById('code-step')
  text = step.textContent.replace(/\s+/g, ' ')
  assert.ok(!text.includes(sentClaim('en')), `resend claims a mail: ${text}`)
  assert.equal(h.sent.length + h.queued.length, 0)
})

test('with script, a resend that cannot reach the door says so and claims nothing', async () => {
  const html = loginPage({ origin: ORIGIN, email: EMAIL, step: 'code' })
  const ui = await scripted(html, () => {
    throw new TypeError('network down')
  })
  await ui.submit('resend-form')
  const text = ui.document.getElementById('code-step').textContent.replace(/\s+/g, ' ')
  assert.ok(text.includes(translate('en', 'login.sendFailed')), 'the failure is shown on the code step')
  assert.ok(!text.includes(sentClaim('en')))
})

test('outside beta the limiter still refuses with 429 and the email step', async () => {
  const h = harness({ over: true })
  const res = await h.form({ email: EMAIL })
  assert.equal(res.status, 429)
  const shown = shownStep(await res.text())
  assert.equal(shown.id, 'email-step')
  assert.ok(shown.text.includes(translate('en', 'login.rateLimited')))
  assert.equal((await h.json({ email: EMAIL })).status, 429)
  assert.equal(h.sent.length, 0)
})

test('beta off: one mail leaves and the code step names the address it is for', async () => {
  const h = harness()
  const res = await h.form({ email: EMAIL })
  assert.equal(res.status, 200)
  const shown = shownStep(await res.text())
  assert.equal(shown.id, 'code-step')
  assert.ok(shown.text.includes(neutral('en')))
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].to, EMAIL)
})

test('local preview keeps its own words and its code on the page', async () => {
  const h = harness({ extraEnv: { LOCAL_LOGIN_PREVIEW: '1' } })
  const res = await h.form({ email: EMAIL })
  assert.equal(res.status, 200)
  const shown = shownStep(await res.text())
  assert.equal(shown.id, 'code-step')
  assert.ok(shown.text.includes(translate('en', 'login.localTitle')))
  assert.ok(shown.text.includes(neutral('en')))
  assert.match(shown.document.getElementById('local-code').textContent, /^\d{6}$/)
})

test('a missing, empty or malformed address is refused as before, beta on or off', async () => {
  for (const beta of [null, 'recorder']) {
    const h = harness({ beta })
    for (const email of ['', '   ', 'not-an-address', 'a@', '@b.c']) {
      const res = await h.form({ email })
      assert.notEqual(shownStep(await res.text()).id, 'code-step', `form ${JSON.stringify(email)}`)
      assert.ok((await h.json({ email })).status >= 400, `json ${JSON.stringify(email)}`)
    }
    assert.ok((await h.json({})).status >= 400)
    assert.equal(h.sent.length + h.queued.length, 0)
  }
})
