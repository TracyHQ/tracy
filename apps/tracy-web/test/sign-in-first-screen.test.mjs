/**
 * The first screen of `/login` (issue #33): what Tracy is on the left, the sign-in card on the
 * right with Google first, links to tracy.ai, Discord and X under it, and a hint under the address
 * field when a big mailbox's domain looks mistyped ("gmail.con"), which would otherwise send the
 * code nowhere.
 *
 * Parses the page `loginPage` returns, and runs its script in jsdom for the hint. What this cannot
 * show is the painted result; the screenshots on the pull request show that.
 *
 *   node --test apps/tracy-web/test/sign-in-first-screen.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loginPage } from '../src/identity/pages.js'
import { translate, WEB_LANGUAGES } from '../src/lib/i18n/index.js'
import { LINKS } from '../src/public/templates-words.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..')

/** jsdom, from a workspace member that declares it. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

const { JSDOM } = loadJsdom()
const ORIGIN = 'http://tracy.test'
const parse = (options) => new JSDOM(loginPage({ origin: ORIGIN, next: '/', ...options })).window.document

test('every interface language draws the pitch and the sign-in card in its own words', () => {
  for (const lang of WEB_LANGUAGES) {
    const doc = parse({ lang, oauth: { google: true } })
    assert.equal(doc.querySelector('.signin-title').textContent, translate(lang, 'login.pitchTitle'), lang)
    assert.equal(doc.querySelector('.signin-eyebrow').textContent, translate(lang, 'login.heroTitle'), lang)
    assert.equal(doc.querySelector('.signin-lede').textContent, translate(lang, 'login.pitchLede'), lang)
    assert.equal(
      doc.querySelector('#email-step .card-title').textContent,
      translate(lang, 'login.getStarted'),
      lang
    )
    assert.equal(
      doc.querySelector('#email-form button[type=submit]').textContent,
      translate(lang, 'login.emailMeCode'),
      lang
    )
    assert.ok(
      doc
        .querySelector('form[action="/signin/google"] button')
        .textContent.includes(translate(lang, 'login.continueWithProvider', { provider: 'Google' })),
      lang
    )
    assert.match(doc.querySelector('.signin-works').textContent, /Joomla.*WordPress.*EmDash/, lang)
  }
})

test('Google comes before the address form; GitHub shows only where the deployment lights it up', () => {
  const doc = parse({ oauth: { google: true } })
  const card = doc.getElementById('email-step')
  const google = card.querySelector('form[action="/signin/google"]')
  const email = card.querySelector('#email-form')
  assert.ok(google.compareDocumentPosition(email) & doc.defaultView.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.equal(card.querySelector('form[action="/signin/github"]'), null)
  assert.ok(parse({ oauth: { google: true, github: true } }).querySelector('form[action="/signin/github"]'))
  // No provider at all: the address form alone, and no separator naming one.
  const bare = parse({ oauth: {} })
  assert.equal(bare.querySelector('#email-step .providers'), null)
  assert.equal(bare.querySelector('#email-step .separator-label'), null)
})

test('the pictures are template cards this server serves, decorative, and the links open the public pages', () => {
  const doc = parse({ oauth: { google: true } })
  const stage = doc.querySelector('.signin-stage')
  assert.equal(stage.getAttribute('aria-hidden'), 'true')
  for (const img of stage.querySelectorAll('img')) {
    assert.match(
      img.getAttribute('src'),
      /^\/api\/templates\/[a-z0-9-]+\/shots\/[a-z0-9-]+-home-1440\.png\?w=720$/
    )
    assert.equal(img.getAttribute('alt'), '')
  }
  const links = [...doc.querySelectorAll('.signin-links a')]
  assert.deepEqual(
    links.map((a) => a.getAttribute('href')),
    [LINKS.home, LINKS.discord, LINKS.x]
  )
  for (const a of links) assert.equal(a.getAttribute('rel'), 'noopener')
})

test('the code step still hides the first card, and the pitch and links stay', () => {
  const doc = parse({ oauth: { google: true }, step: 'code', email: 'person@example.test' })
  assert.equal(doc.getElementById('email-step').hidden, true)
  assert.equal(doc.getElementById('code-step').hidden, false)
  assert.ok(doc.querySelector('.signin-pitch'))
  assert.ok(doc.querySelector('.signin-links'))
})

/** The page with its own script running, as a browser runs it. */
function scripted(lang = 'en') {
  const dom = new JSDOM(loginPage({ origin: ORIGIN, next: '/', oauth: { google: true }, lang }), {
    url: `${ORIGIN}/login`,
    runScripts: 'outside-only'
  })
  dom.window.fetch = async () => new dom.window.Response(null, { status: 204 })
  for (const script of dom.window.document.querySelectorAll('script')) dom.window.eval(script.textContent)
  const doc = dom.window.document
  const type = (value) => {
    const input = doc.getElementById('login-email')
    input.value = value
    input.dispatchEvent(new dom.window.Event('blur'))
  }
  return { doc, type, box: doc.getElementById('email-suggest'), use: doc.getElementById('email-suggest-use') }
}

test('a mistyped big-mailbox domain is offered back fixed, and one press puts it in the field', () => {
  for (const [typed, likely] of [
    ['person@gmail.con', 'person@gmail.com'],
    ['person@gmial.com', 'person@gmail.com'],
    ['person@gmail.co', 'person@gmail.com'],
    ['person@hotmial.com', 'person@hotmail.com'],
    ['person@yahoo.cmo', 'person@yahoo.com'],
    ['person@outlok.com', 'person@outlook.com']
  ]) {
    const { doc, type, box, use } = scripted()
    type(typed)
    assert.equal(box.hidden, false, typed)
    assert.equal(use.textContent, translate('en', 'login.suggestEmail', { email: likely }), typed)
    assert.equal(use.querySelector('strong').textContent, likely, typed)
    use.click()
    assert.equal(doc.getElementById('login-email').value, likely, typed)
    assert.equal(box.hidden, true, typed)
  }
})

test('a real address, a provider’s own country domain and a company domain get no hint', () => {
  for (const typed of [
    'person@gmail.com',
    'person@hotmail.fr',
    'person@outlook.de',
    'person@gmx.at',
    'person@live.com',
    'person@lrv.de',
    'person@example.test',
    'not-an-address'
  ]) {
    const { type, box } = scripted()
    type(typed)
    assert.equal(box.hidden, true, typed)
  }
})

test('the hint is in the page’s language, and the address is never part of the translated words', () => {
  const { type, use } = scripted('de')
  type('person@gmail.con')
  assert.equal(use.textContent, translate('de', 'login.suggestEmail', { email: 'person@gmail.com' }))
})
