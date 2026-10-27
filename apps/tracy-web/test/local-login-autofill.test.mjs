// The local stand's sign-in (LOCAL_LOGIN_PREVIEW): the code is already on the page, so the page's own script fills it
// and signs in; an address is all a person types. Off the local stand nothing fills itself.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'
import { loginPage } from '../src/identity/pages.js'

const ORIGIN = 'http://tracy.test:8080'
const NEXT = '/new/?tab=tracy%3Awebsite-opportunities'
const EMAIL = 'dev@example.com'

/** Run the page's own script over its document; `answer(call)` is what the door says to each request. */
function scripted(html, answer) {
  const { document, window } = parseHTML(html)
  const calls = []
  const location = { href: `${ORIGIN}/login`, assign() {} }
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return answer(calls.at(-1))
  }
  for (const el of document.querySelectorAll('input, button'))
    if (typeof el.focus !== 'function') el.focus = () => {}
  const script = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n')
  new Function('document', 'window', 'fetch', 'location', script)(document, window, fetchImpl, location)
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const submit = async (formId) => {
    document
      .getElementById(formId)
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await settle()
  }
  return { document, calls, location, submit, settle }
}

const door = (localCode) => (call) =>
  call.url.startsWith('/verify')
    ? Response.json({ ok: true })
    : Response.json({ ok: true, ...(localCode ? { localCode } : {}) })

test('on the local stand an address is enough: the shown code is filled and sent, and the page goes on', async () => {
  const html = loginPage({ lang: 'en', next: NEXT, origin: ORIGIN, localPreview: true })
  const ui = scripted(html, door('123456'))
  ui.document.getElementById('login-email').value = EMAIL
  await ui.submit('email-form')
  assert.deepEqual(
    ui.calls.map((c) => [c.url.split('?')[0], c.body]),
    [
      ['/login', { email: EMAIL }],
      ['/verify', { email: EMAIL, code: '123456' }]
    ]
  )
  assert.equal(ui.location.href, `${ORIGIN}${NEXT}`)
})

test('a code page the server drew with the local code signs in on load', async () => {
  const html = loginPage({
    lang: 'en',
    next: NEXT,
    origin: ORIGIN,
    email: EMAIL,
    localPreview: true,
    step: 'code',
    localCode: '654321'
  })
  const ui = scripted(html, door(null))
  await ui.settle()
  assert.deepEqual(
    ui.calls.map((c) => c.body),
    [{ email: EMAIL, code: '654321' }]
  )
  assert.equal(ui.location.href, `${ORIGIN}${NEXT}`)
})

test('without the local preview the code step waits for a person', async () => {
  const html = loginPage({ lang: 'en', next: NEXT, origin: ORIGIN })
  const ui = scripted(html, door(null))
  ui.document.getElementById('login-email').value = EMAIL
  await ui.submit('email-form')
  assert.deepEqual(
    ui.calls.map((c) => c.url.split('?')[0]),
    ['/login'],
    'only the code request; nothing is verified'
  )
})
