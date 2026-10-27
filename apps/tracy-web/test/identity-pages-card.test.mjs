/**
 * The identity pages that are one card of text: a sign-in that did not finish, the question before
 * a device's or the desktop app's sign-in is approved, and the answer after it (approved, denied).
 *
 * Reported 06/10/2026 from a real sign-in: the heading and the sentence began exactly on the card's
 * left border. `.card` in `lib/page-shell.js` has vertical padding only; the horizontal padding
 * lives on its parts (`.card-header`, `.card-content`, `.card-footer`), and three of these pages put
 * `<h1>` and `<p>` straight into the card, inside a second `<main>` nested in the shell's own.
 *
 * Every case parses the page a renderer returns and checks the structure that gives the text its
 * padding. What this cannot show is the painted result; `e2e/signin-cancelled-page.test.mjs`
 * measures that in a browser.
 *
 *   node --test apps/tracy-web/test/identity-pages-card.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  desktopConfirmPage,
  deviceApprovedPage,
  deviceConfirmPage,
  deviceDeniedPage,
  signInFailedPage
} from '../src/identity/pages.js'
import { translate, WEB_LANGUAGES } from '../src/lib/i18n/index.js'

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
const EMAIL = 'person@example.test'
const NONCE = 'a'.repeat(64)
const CODE = 'K7-QX-42'
const PARTS = '.card-header, .card-content, .card-footer'
const REASONS = ['state', 'cancelled', 'exchange', 'email', 'link', 'provider']

/** Every variant each renderer draws, by name. */
const VARIANTS = [
  ...REASONS.flatMap((reason) =>
    ['google', 'github', ''].map((provider) => [
      `signInFailedPage ${reason} ${provider || 'no provider'}`,
      () => signInFailedPage({ reason, provider, next: '/acme/', origin: ORIGIN })
    ])
  ),
  [
    'signInFailedPage with no next',
    () => signInFailedPage({ reason: 'cancelled', provider: 'google', origin: ORIGIN })
  ],
  [
    'deviceConfirmPage with a device',
    () => deviceConfirmPage({ email: EMAIL, nonce: NONCE, device: 'Chrome on macOS' })
  ],
  ['deviceConfirmPage with no device', () => deviceConfirmPage({ email: EMAIL, nonce: NONCE })],
  ['deviceApprovedPage approved', () => deviceApprovedPage({ email: EMAIL })],
  ['deviceApprovedPage refused', () => deviceApprovedPage({ error: translate('en', 'device.linkGone') })],
  [
    'deviceApprovedPage approved for the desktop app',
    () => deviceApprovedPage({ email: EMAIL, desktop: true })
  ],
  [
    'deviceApprovedPage refused for the desktop app',
    () => deviceApprovedPage({ error: translate('en', 'device.linkGone'), desktop: true })
  ],
  [
    'desktopConfirmPage with a device',
    () => desktopConfirmPage({ email: EMAIL, nonce: NONCE, device: 'MacBook Pro', code: CODE })
  ],
  ['desktopConfirmPage with no device', () => desktopConfirmPage({ email: EMAIL, nonce: NONCE, code: CODE })],
  ['deviceDeniedPage', () => deviceDeniedPage()]
]

/**
 * The structure that keeps a card's text off its border.
 * @param {string} html a complete page.
 * @param {string} where which page, for the failure message.
 * @returns {Document} the parsed page, for further checks.
 */
function assertPaddedCard(html, where) {
  const { document } = new JSDOM(html).window
  assert.equal(document.querySelectorAll('main').length, 1, `${where}: one main landmark`)
  const cards = document.querySelectorAll('.card')
  assert.equal(cards.length, 1, `${where}: one card`)
  const card = cards[0]
  assert.equal(card.tagName, 'DIV', `${where}: the card is a div, not a second main`)
  assert.equal(card.parentElement?.tagName, 'MAIN', `${where}: the card sits in the shell's main`)
  assert.ok(card.children.length > 0, `${where}: the card has parts`)
  for (const child of card.children)
    assert.ok(
      child.matches(PARTS),
      `${where}: <${child.tagName.toLowerCase()}> is put straight into the card`
    )
  for (const node of card.childNodes)
    if (node.nodeType === 3) assert.equal(node.textContent.trim(), '', `${where}: text straight in the card`)
  const readable = card.querySelectorAll('h1, h2, p, a, form, button, input, strong')
  assert.ok(readable.length >= 2, `${where}: a heading and a sentence at least`)
  for (const el of readable)
    assert.ok(el.closest(PARTS), `${where}: <${el.tagName.toLowerCase()}> is outside the padded parts`)
  assert.equal(card.querySelectorAll('h1').length, 1, `${where}: one heading`)
  assert.ok(card.querySelector('h1').textContent.trim(), `${where}: the heading says something`)
  for (const p of card.querySelectorAll('p')) assert.ok(p.textContent.trim(), `${where}: an empty paragraph`)
  return document
}

test('the shell pads the parts of a card, not the card itself', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(deviceApprovedPage({ email: EMAIL }))[1]
  // The reason a child put straight into `.card` touches the border.
  assert.match(css, /\.card\{[^}]*padding:1\.5rem 0[;}]/)
  for (const part of ['card-header', 'card-content', 'card-footer']) {
    const rule = new RegExp(`\\.${part}\\{[^}]*padding:0 (\\d+(?:\\.\\d+)?)rem[;}]`).exec(css)
    assert.ok(rule, `.${part} has no horizontal padding`)
    assert.ok(Number(rule[1]) >= 1, `.${part} pads ${rule[1]}rem`)
  }
})

for (const [name, render] of VARIANTS) {
  test(`${name}: every word is inside a padded card part, under one main`, () => {
    assertPaddedCard(render(), name)
  })
}

test('every interface language draws the same padded structure', () => {
  for (const lang of WEB_LANGUAGES) {
    assertPaddedCard(
      signInFailedPage({ reason: 'cancelled', provider: 'github', origin: ORIGIN, lang }),
      `signInFailedPage ${lang}`
    )
    assertPaddedCard(deviceConfirmPage({ email: EMAIL, nonce: NONCE, lang }), `deviceConfirmPage ${lang}`)
    assertPaddedCard(deviceApprovedPage({ email: EMAIL, lang }), `deviceApprovedPage ${lang}`)
    assertPaddedCard(
      deviceApprovedPage({ email: EMAIL, desktop: true, lang }),
      `deviceApprovedPage desktop ${lang}`
    )
    assertPaddedCard(
      desktopConfirmPage({ email: EMAIL, nonce: NONCE, code: CODE, lang }),
      `desktopConfirmPage ${lang}`
    )
    assertPaddedCard(deviceDeniedPage({ lang }), `deviceDeniedPage ${lang}`)
  }
})

test('signInFailedPage: the cancelled sentence names the provider by its brand and keeps the way back', () => {
  for (const [provider, label] of [
    ['google', 'Google'],
    ['github', 'GitHub']
  ]) {
    const html = signInFailedPage({ reason: 'cancelled', provider, next: '/acme/?tab=1', origin: ORIGIN })
    const document = assertPaddedCard(html, `cancelled ${provider}`)
    const sentence = translate('en', 'signin.cancelledBody', { provider: label })
    assert.ok(sentence.includes(label))
    assert.equal(document.querySelector('.card-header p').textContent, sentence)
    assert.ok(!html.includes(translate('en', 'signin.stateBody')), 'the state sentence is not shown')
    const back = document.querySelector('.card a.back')
    assert.equal(back.getAttribute('href'), `/login?next=${encodeURIComponent(`${ORIGIN}/acme/?tab=1`)}`)
    assert.ok(back.textContent.includes(translate('en', 'signin.backToSignIn')))
  }
})

test('signInFailedPage: a reason or a provider it does not know is the state sentence and no name, never what it was handed', () => {
  for (const reason of [
    'access_denied',
    '<script>alert(1)</script>',
    '__proto__',
    'constructor',
    '',
    undefined
  ]) {
    const html = signInFailedPage({ reason, provider: 'google', origin: ORIGIN })
    assertPaddedCard(html, `reason ${String(reason)}`)
    assert.ok(html.includes(translate('en', 'signin.stateBody')), `reason ${String(reason)}`)
    assert.doesNotMatch(html, /<script>alert|access_denied/)
  }
  for (const provider of ['<img src=x onerror=alert(1)>', 'gitlab', '__proto__', 'Google']) {
    const html = signInFailedPage({ reason: 'cancelled', provider, origin: ORIGIN })
    const document = assertPaddedCard(html, `provider ${provider}`)
    // No name is better than a name that arrived in the address.
    const sentence = document.querySelector('.card-header p').textContent
    assert.ok(!/Google|GitHub/.test(sentence), `provider ${provider}: named ${sentence}`)
    assert.ok(sentence.includes('Nothing was changed.'))
    assert.doesNotMatch(html, /onerror|gitlab/)
  }
})

test('signInFailedPage: a hostile next never becomes the way back', () => {
  for (const next of [
    '//evil.example/x',
    'https://evil.example/',
    '/\\evil.example',
    'javascript:alert(1)',
    '"><script>'
  ]) {
    const html = signInFailedPage({ reason: 'cancelled', provider: 'google', next, origin: ORIGIN })
    const document = assertPaddedCard(html, `next ${next}`)
    const href = document.querySelector('.card a.back').getAttribute('href')
    assert.ok(href === '/login' || href.startsWith('/login?next='), `the way back leaves /login: ${href}`)
    // Another origin is dropped; a path on this one is kept, encoded, as a path on this one.
    const back = new URL(href, ORIGIN).searchParams.get('next') ?? `${ORIGIN}/`
    assert.equal(new URL(back).origin, ORIGIN, `the way back leaves Tracy: ${back}`)
    if (next.includes('evil') || next.startsWith('javascript')) assert.equal(href, '/login')
    assert.doesNotMatch(html, /evil\.example|javascript:|<script>/)
  }
})

test('deviceConfirmPage: the form still posts the nonce to /signin/approve, and what it is handed stays escaped and fenced', () => {
  const html = deviceConfirmPage({
    email: '<x>@y.test',
    nonce: '"><script>n</script>',
    device: '<b>Mac</b> & "phone"'
  })
  const document = assertPaddedCard(html, 'deviceConfirmPage hostile')
  const form = document.querySelector('.card-content form')
  assert.equal(form.getAttribute('method'), 'post')
  assert.equal(form.getAttribute('action'), '/signin/approve')
  assert.equal(form.querySelector('input[type=hidden][name=n]').value, '"><script>n</script>')
  assert.equal(form.querySelectorAll('button[type=submit]').length, 1)
  assert.equal(document.querySelectorAll('script').length, 0, 'no script, no auto-submit')
  assert.equal(document.querySelectorAll('.card b').length, 0)
  assert.match(html, /<!--email_off--><strong>&lt;x&gt;@y\.test<\/strong><!--email_on-->/)
  assert.match(html, /<strong>&lt;b&gt;Mac&lt;\/b&gt; &amp; &quot;phone&quot;<\/strong>/)
  const text = document.querySelector('.card').textContent
  for (const key of ['device.heading', 'device.warning', 'device.approve'])
    assert.ok(text.includes(translate('en', key)), key)
  // No device named: the sentence that says so, never a guess.
  const unnamed = assertPaddedCard(deviceConfirmPage({ email: EMAIL, nonce: NONCE }), 'no device')
  assert.ok(unnamed.querySelector('.card').textContent.includes(translate('en', 'device.unknown')))
})

test('deviceApprovedPage: approved names the fenced address; refused shows the escaped reason and where to start again', () => {
  const approved = deviceApprovedPage({ email: '<x>@y.test' })
  const ok = assertPaddedCard(approved, 'approved')
  assert.equal(ok.querySelector('.card h1').textContent, translate('en', 'device.signedInHeading'))
  assert.match(approved, /<!--email_off-->&lt;x&gt;@y\.test<!--email_on-->/)

  const refused = deviceApprovedPage({ email: EMAIL, error: '<i>gone</i> & over' })
  const bad = assertPaddedCard(refused, 'refused')
  assert.equal(bad.querySelector('.card h1').textContent, translate('en', 'device.linkInvalidHeading'))
  assert.equal(bad.querySelectorAll('.card i').length, 0)
  const text = bad.querySelector('.card').textContent
  assert.ok(text.includes('<i>gone</i> & over'))
  assert.ok(text.includes(translate('en', 'device.startAgain')))
  assert.ok(!text.includes(EMAIL), 'a refused approval names no address')
})

test('desktopConfirmPage: Approve and Deny each post the nonce to their own door, the match code is shown, and what it is handed stays escaped and fenced', () => {
  const html = desktopConfirmPage({
    email: '<x>@y.test',
    nonce: '"><script>n</script>',
    device: '<b>Mac</b> & "phone"',
    code: '<i>K7</i>&42'
  })
  const document = assertPaddedCard(html, 'desktopConfirmPage hostile')
  const forms = [...document.querySelectorAll('.card-content form')]
  assert.deepEqual(
    forms.map((form) => [form.getAttribute('method'), form.getAttribute('action')]),
    [
      ['post', '/signin/approve'],
      ['post', '/signin/deny']
    ]
  )
  for (const form of forms) {
    assert.equal(form.querySelector('input[type=hidden][name=n]').value, '"><script>n</script>')
    assert.equal(form.querySelectorAll('button[type=submit]').length, 1)
  }
  assert.equal(forms[0].querySelector('button').textContent, translate('en', 'device.approve'))
  assert.equal(forms[1].querySelector('button').textContent, translate('en', 'device.deny'))
  assert.ok(forms[1].querySelector('button').classList.contains('ghost'))
  assert.equal(document.querySelectorAll('script').length, 0, 'no script, no auto-submit')
  assert.equal(document.querySelectorAll('.card b, .card i').length, 0)
  assert.match(html, /<!--email_off--><strong>&lt;x&gt;@y\.test<\/strong><!--email_on-->/)
  assert.match(html, /<strong>&lt;b&gt;Mac&lt;\/b&gt; &amp; &quot;phone&quot;<\/strong>/)
  assert.match(html, /<p><strong>&lt;i&gt;K7&lt;\/i&gt;&amp;42<\/strong><\/p>/)
  const text = document.querySelector('.card').textContent
  for (const key of ['device.heading', 'device.matchCode', 'device.desktopWarning'])
    assert.ok(text.includes(translate('en', key)), key)
  assert.ok(text.includes('Tracy Cowork for Mac'), 'the desktop question, not the lane one')
  // No device named: the sentence that says so, never a guess.
  const unnamed = assertPaddedCard(
    desktopConfirmPage({ email: EMAIL, nonce: NONCE, code: CODE }),
    'desktop, no device'
  )
  const unnamedText = unnamed.querySelector('.card').textContent
  assert.ok(unnamedText.includes(translate('en', 'device.unknown')))
  assert.ok(unnamedText.includes(CODE))
})

test('deviceApprovedPage: a desktop round is sent back to the app, a lane round is not; deviceDeniedPage says nothing was signed in', () => {
  const desktop = assertPaddedCard(deviceApprovedPage({ email: '<x>@y.test', desktop: true }), 'desktop')
  const sentence = desktop.querySelector('.card-header p').textContent
  assert.equal(sentence, translate('en', 'device.desktopApprovedAs', { email: '<x>@y.test' }))
  assert.notEqual(sentence, translate('en', 'device.approvedAs', { email: '<x>@y.test' }))
  const lane = assertPaddedCard(deviceApprovedPage({ email: EMAIL }), 'lane')
  assert.equal(
    lane.querySelector('.card-header p').textContent,
    translate('en', 'device.approvedAs', { email: EMAIL })
  )

  const denied = assertPaddedCard(deviceDeniedPage(), 'denied')
  assert.equal(denied.querySelector('.card h1').textContent, translate('en', 'device.deniedHeading'))
  assert.equal(denied.querySelector('.card-header p').textContent, translate('en', 'device.deniedBody'))
  assert.equal(denied.title, translate('en', 'device.deniedTitle'))
  assert.equal(denied.querySelectorAll('form, button, script').length, 0, 'nothing to press')
})
