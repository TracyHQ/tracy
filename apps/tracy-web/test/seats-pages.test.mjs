/**
 * The plain-HTML pages `seats/route.js` serves on `/:label/team`, `/:label/join` and
 * `/invite/:token` — the `cowork.tracy.ai`-equivalent surface a person invited to a site lands
 * on first. Same regression this task closed everywhere else (a bare
 * `<body style="font:15px system-ui">`, no token, no favicon): these were the one file the
 * original task-6 pass missed, flagged in its own report and folded in here.
 *
 * Tested directly against the exported page functions — pure functions of their arguments, no
 * database needed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { WEB_LANGUAGES, translator } from '../src/lib/i18n/index.js'
import {
  messagePage,
  tooManyRequestsPage,
  teamPage,
  joinPage,
  invalidInvitePage,
  wrongAccountPage,
  inviteLandingPage,
  whoamiLine
} from '../src/seats/pages.js'

// ── The shell reaches every page here ───────────────────────────────────────────────────────

test('every page in this file carries the shared shell — token block, color-scheme, favicon', () => {
  const pages = [
    messagePage('T', 'm'),
    tooManyRequestsPage(),
    teamPage({ siteKey: 'x.example', seats: [], viewer: 'a@b.c' }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c' }),
    invalidInvitePage(),
    wrongAccountPage({ email: 'a@b.c', loginHref: '/login' }),
    inviteLandingPage({ summary: 'accepted', role: 'editor', sites: [], email: 'a@b.c' })
  ]
  for (const html of pages) {
    assert.match(html, /<meta name="color-scheme" content="light dark">/)
    assert.match(html, /--primary:oklch\(0\.588 0\.136 37\.4\)/)
  }
})

test('no bare system-ui shell remains: nobody here writes body style directly', () => {
  const html = joinPage({ siteKey: 'x.example', viewer: 'a@b.c' })
  assert.doesNotMatch(html, /<body style="font:15px system-ui/)
})

// ── role="alert" on every error block ───────────────────────────────────────────────────────

test('joinPage: an error is announced with role="alert"', () => {
  const html = joinPage({ siteKey: 'x.example', viewer: 'a@b.c', error: 'Something went wrong.' })
  assert.match(html, /role="alert"/)
  assert.match(html, /Something went wrong\./)
})

test('joinPage: no error, no alert block', () => {
  const html = joinPage({ siteKey: 'x.example', viewer: 'a@b.c' })
  assert.doesNotMatch(html, /role="alert"/)
})

// ── escapeHtml around every user-supplied value ─────────────────────────────────────────────

test('joinPage: a <script> pushed through `siteKey` never reaches the page unescaped', () => {
  const html = joinPage({ siteKey: '<script>alert(1)</script>', viewer: 'a@b.c' })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('joinPage: a <script> pushed through `viewer` (whoamiLine) never reaches the page unescaped', () => {
  const html = joinPage({ siteKey: 'x.example', viewer: '<script>alert(1)</script>' })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('teamPage: a <script> pushed through a seat email never reaches the page unescaped', () => {
  const html = teamPage({
    siteKey: 'x.example',
    seats: [{ email: '<script>alert(1)</script>', role: 'editor', status: 'accepted' }],
    viewer: 'a@b.c'
  })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})

test('wrongAccountPage: a <script> pushed through `email` never reaches the page unescaped', () => {
  const html = wrongAccountPage({ email: '<script>alert(1)</script>', loginHref: '/login' })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})

// ── wrongAccountPage: the way out is a sign-out form, not a link back to the refusal (#799) ──

/** The page's `<main>`, and the pieces of its one action, read from the DOM. */
function wrongAccountAction(args) {
  const { document } = parseHTML(wrongAccountPage(args))
  const main = document.querySelector('main')
  const forms = [...main.querySelectorAll('form')]
  const form = forms[0]
  return {
    main,
    forms,
    form,
    hidden: form ? [...form.querySelectorAll('input[type="hidden"]')] : [],
    buttons: form ? [...form.querySelectorAll('button[type="submit"]')] : []
  }
}

test('wrongAccountPage: one native form posts to /auth/signout and carries the sign-in address as `next`', () => {
  const { main, forms, form, hidden, buttons } = wrongAccountAction({
    email: 'invitee@x.y',
    loginHref: '/login?next=%2Finvite%2Ftok.sig'
  })
  assert.equal(forms.length, 1)
  assert.equal(form.getAttribute('method'), 'post')
  assert.equal(form.getAttribute('action'), '/auth/signout')
  // `data-fetch` would hand the submit to SEATS_SCRIPT, which posts no fields.
  assert.equal(form.hasAttribute('data-fetch'), false)
  assert.equal(hidden.length, 1)
  assert.equal(hidden[0].getAttribute('name'), 'next')
  assert.equal(hidden[0].getAttribute('value'), '/login?next=%2Finvite%2Ftok.sig&email=invitee%40x.y')
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].textContent, 'Sign in as invitee@x.y')
  // A link to `/login` is the loop: a signed-in person is sent straight back here.
  assert.equal(main.querySelectorAll('a[href*="/login"]').length, 0)
})

test('wrongAccountPage: the form wraps the paragraph — a <form> may not sit inside a <p>', () => {
  const { form, buttons } = wrongAccountAction({ email: 'a@b.c', loginHref: '/login?next=%2F' })
  const paragraph = buttons[0].closest('p')
  assert.ok(paragraph)
  assert.equal(paragraph.closest('form'), form)
  assert.equal(form.closest('p'), null)
  // linkedom is lenient where a browser's parser is not (it would close the <p> at the <form>),
  // so the source order is checked too: no <form> opens before its enclosing <p> has closed.
  const source = wrongAccountPage({ email: 'a@b.c', loginHref: '/login?next=%2F' })
  assert.doesNotMatch(source, /<p\b[^>]*>(?:(?!<\/p>)[^])*<form/)
})

test('wrongAccountPage: quotes, ampersands and markup in `email` or `loginHref` stay inside their text and attribute', () => {
  const hostile = [
    `"><img src=x onerror=alert(1)>`,
    `a&b"c'd<e>f@x.y`,
    `'onfocus='alert(1)' autofocus='`,
    `</button></form><script>alert(1)</script>`,
    `x" formaction="https://evil.example/`
  ]
  for (const email of hostile) {
    for (const loginHref of ['/login?next=%2Finvite%2Ft', `/login?next=${email}`]) {
      const html = wrongAccountPage({ email, loginHref })
      const { main, forms, form, hidden, buttons } = wrongAccountAction({ email, loginHref })
      assert.equal(forms.length, 1, email)
      assert.equal(form.getAttribute('action'), '/auth/signout')
      assert.deepEqual([...form.attributes].map((a) => a.name).sort(), ['action', 'method'])
      assert.equal(hidden.length, 1)
      assert.deepEqual([...hidden[0].attributes].map((a) => a.name).sort(), ['name', 'type', 'value'])
      assert.equal(hidden[0].getAttribute('value'), `${loginHref}&email=${encodeURIComponent(email)}`)
      assert.equal(buttons.length, 1)
      assert.deepEqual(
        [...buttons[0].attributes].map((a) => a.name),
        ['type']
      )
      assert.equal(buttons[0].textContent, `Sign in as ${email}`)
      assert.equal(main.querySelector('h1').textContent, `This invitation was sent to ${email}`)
      assert.equal(main.querySelectorAll('img, script, a, [onerror], [onfocus], [formaction]').length, 0)
      // And as a string: no raw quote or angle bracket of the payload survives anywhere.
      assert.equal(html.includes(email), false, email)
    }
  }
})

test('wrongAccountPage: every language renders the same form, with its own translated button', () => {
  const labels = new Set()
  for (const lang of WEB_LANGUAGES) {
    const { form, hidden, buttons } = wrongAccountAction({
      email: 'invitee@x.y',
      loginHref: '/login?next=%2Finvite%2Ft',
      lang
    })
    assert.equal(form.getAttribute('action'), '/auth/signout', lang)
    assert.equal(hidden[0].getAttribute('value'), '/login?next=%2Finvite%2Ft&email=invitee%40x.y', lang)
    assert.equal(buttons.length, 1, lang)
    const label = buttons[0].textContent
    assert.equal(label, translator(lang)('seats.signInAs', { email: 'invitee@x.y' }), lang)
    assert.match(label, /invitee@x\.y/, lang)
    assert.doesNotMatch(label, /seats\.|\{email\}/, lang)
    // The sentence still surrounds the button: the paragraph says more than the label alone.
    const sentence = buttons[0].closest('p').textContent
    assert.ok(sentence.length > label.length, lang)
    assert.doesNotMatch(sentence, /\{link\}|seats\./, lang)
    labels.add(label)
  }
  assert.equal(labels.size, WEB_LANGUAGES.length)
})

test('inviteLandingPage: a <script> pushed through `email` never reaches the page unescaped', () => {
  const html = inviteLandingPage({
    summary: 'accepted',
    role: 'editor',
    sites: [],
    email: '<script>alert(1)</script>'
  })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})

// ── whoamiLine: ported for real (pages.js:955), now reachable from joinPage and teamPage ───────

test('whoamiLine: names the account and offers a real switch-account form', () => {
  const html = whoamiLine('a@b.c')
  assert.match(html, /Signed in as <!--email_off--><strong>a@b\.c<\/strong><!--email_on-->/)
  assert.match(html, /<form method="post" action="\/auth\/signout"/)
  assert.match(html, />switch account</)
})

test('joinPage and teamPage both carry whoamiLine when a viewer is known', () => {
  assert.match(joinPage({ siteKey: 'x.example', viewer: 'a@b.c' }), /Signed in as/)
  assert.match(teamPage({ siteKey: 'x.example', seats: [], viewer: 'a@b.c' }), /Signed in as/)
})

// ── existing copy this file's own route tests already assert on — kept ─────────────────────

test('joinPage: default branch reads "Request to join <siteKey>", the vocabulary\'s own words (#807)', () => {
  const html = joinPage({ siteKey: 'joinlabel.example', viewer: 'a@b.c' })
  assert.match(html, /<h1 class="card-title">Request to join joinlabel\.example<\/h1>/)
  assert.match(html, /<button type="submit">Request to join<\/button>/)
  assert.doesNotMatch(html, /Ask to join|Ask for access/)
})

test('joinPage: a site key carrying markup is escaped in the heading and the title', () => {
  const html = joinPage({ siteKey: '<b>x</b>.example', viewer: 'a@b.c' })
  assert.match(html, /Request to join &lt;b&gt;x&lt;\/b&gt;\.example/)
  assert.doesNotMatch(html, /<b>x<\/b>/)
})

test('joinPage: the requested branch shows the request-sent title, the other branch does not', () => {
  const sent = translator('en')('seats.requestedTitle')
  assert.ok(joinPage({ siteKey: 'x.example', viewer: 'a@b.c', requested: true }).includes(sent))
  assert.ok(!joinPage({ siteKey: 'x.example', viewer: 'a@b.c', requested: false }).includes(sent))
})

test('wrongAccountPage: still names the invited address', () => {
  assert.match(
    wrongAccountPage({ email: 'invitee@x.y', loginHref: '/login' }),
    /sent to <!--email_off-->invitee@x\.y<!--email_on-->/
  )
})

test('tooManyRequestsPage: shows the too-many-attempts title', () => {
  assert.ok(tooManyRequestsPage().includes(translator('en')('seats.tooManyTitle')))
})

test('inviteLandingPage: still reads "You are on N sites now"', () => {
  const html = inviteLandingPage({
    summary: 'accepted',
    role: 'editor',
    sites: [
      { siteKey: 'a.example', outcome: 'accepted' },
      { siteKey: 'b.example', outcome: 'accepted' }
    ],
    email: 'a@b.c'
  })
  assert.match(html, /You are on 2 sites now/)
})

// ── review round 2, finding 3: the accept form threads a real `next`, sanitised — no second
// sanitizer alongside identity/route.js's own safePath ───────────────────────────────────────

test('joinPage: settled "invited" threads a sanitised `next` through the accept form, not hardcoded to /', () => {
  const html = joinPage({
    siteKey: 'x.example',
    viewer: 'a@b.c',
    settled: 'invited',
    next: '/deep/path?x=1',
    origin: 'http://tracy.test'
  })
  assert.match(html, /data-redirect="http:\/\/tracy\.test\/deep\/path\?x=1"/)
})

test('joinPage: an off-origin `next` on the accept form is sanitised, never trusted raw', () => {
  const html = joinPage({
    siteKey: 'x.example',
    viewer: 'a@b.c',
    settled: 'invited',
    next: 'https://evil.example/steal',
    origin: 'http://tracy.test'
  })
  assert.doesNotMatch(html, /evil\.example/)
  assert.match(html, /data-redirect="http:\/\/tracy\.test\//)
})

test('joinPage: with no `next` given, the accept form still redirects somewhere sane (the origin root)', () => {
  const html = joinPage({
    siteKey: 'x.example',
    viewer: 'a@b.c',
    settled: 'invited',
    origin: 'http://tracy.test'
  })
  assert.match(html, /data-redirect="http:\/\/tracy\.test\/"/)
})

// ── #792: a closed row is worded by the act that closed it ──────────────────────────────────

test('teamPage: a cancelled invitation and a declined request are not printed as a revoke', () => {
  const seats = [
    { email: 'gone@x.y', role: 'editor', status: 'revoked', removalKind: 'revoke' },
    { email: 'cancelled@x.y', role: 'editor', status: 'revoked', removalKind: 'cancel_invite' },
    { email: 'turned-down@x.y', role: 'editor', status: 'revoked', removalKind: 'decline_request' },
    // Closed before the kind was stored, by a row that carries no such field, or by a kind this
    // build does not know: still "revoked" — nothing is guessed, and no key is printed raw.
    { email: 'older@x.y', role: 'editor', status: 'revoked', removalKind: null },
    { email: 'oldest@x.y', role: 'editor', status: 'revoked' },
    { email: 'newer@x.y', role: 'editor', status: 'revoked', removalKind: 'something_new' },
    { email: 'proto@x.y', role: 'editor', status: 'revoked', removalKind: 'toString' },
    // A kind on a row that is not revoked says nothing about it.
    { email: 'live@x.y', role: 'editor', status: 'active', removalKind: 'cancel_invite' }
  ]
  const { document } = parseHTML(teamPage({ siteKey: 'x.example', seats, viewer: 'a@b.c' }))
  const lines = [...document.querySelectorAll('ul.hint li')].map((li) => li.textContent)
  assert.deepEqual(lines, [
    'gone@x.y · Editor (revoked)',
    'cancelled@x.y · Editor (invitation cancelled)',
    'turned-down@x.y · Editor (request declined)',
    'older@x.y · Editor (revoked)',
    'oldest@x.y · Editor (revoked)',
    'newer@x.y · Editor (revoked)',
    'proto@x.y · Editor (revoked)',
    'live@x.y · Editor (active)'
  ])
})

test('teamPage: the two new statuses are worded in every language, each differently from "revoked"', () => {
  for (const lang of WEB_LANGUAGES) {
    const t = translator(lang)
    const words = ['seatStatus.revoked', 'seatStatus.inviteCancelled', 'seatStatus.requestDeclined'].map(
      (key) => t(key)
    )
    assert.equal(new Set(words).size, 3, `${lang}: ${words.join(' / ')}`)
    for (const [i, key] of ['revoked', 'inviteCancelled', 'requestDeclined'].entries())
      assert.notEqual(words[i], `seatStatus.${key}`, `${lang} has no words for ${key}`)
    if (lang !== 'en') {
      const en = translator('en')
      assert.notEqual(words[1], en('seatStatus.inviteCancelled'), `${lang}: not translated`)
      assert.notEqual(words[2], en('seatStatus.requestDeclined'), `${lang}: not translated`)
    }
    const html = teamPage({
      siteKey: 'x.example',
      seats: [{ email: 'c@x.y', role: 'editor', status: 'revoked', removalKind: 'cancel_invite' }],
      viewer: 'a@b.c',
      lang
    })
    assert.ok(parseHTML(html).document.querySelector('ul.hint li').textContent.includes(`(${words[1]})`))
  }
})

test('joinPage: granted access is one sentence and a native button to open that site in every language', () => {
  for (const lang of WEB_LANGUAGES) {
    const siteKey = 'wptest0929.tracy.site'
    const { document } = parseHTML(joinPage({ siteKey, viewer: 'a@b.c', settled: 'granted', lang }))
    const card = document.querySelector('.auth-card')
    assert.equal(
      card.querySelector('h1').textContent,
      translator(lang)('seats.grantedTitle', { site: siteKey })
    )
    assert.equal(card.querySelectorAll('.card-description, .note').length, 0)
    const form = card.querySelector('form[data-open-site]')
    assert.equal(form.getAttribute('method'), 'get')
    assert.equal(form.getAttribute('action'), `/${siteKey}`)
    assert.equal(form.hasAttribute('data-fetch'), false)
    assert.equal(form.querySelector('button').textContent, translator(lang)('seats.openSite'))
  }
})

test('joinPage: granted access escapes the site name and cannot navigate to an external origin', () => {
  const siteKey = '//evil.example/"><img src=x onerror=alert(1)>'
  const { document } = parseHTML(joinPage({ siteKey, settled: 'granted', next: 'https://evil.example/' }))
  const card = document.querySelector('.auth-card')
  assert.equal(card.querySelector('h1').textContent, `You already have access to ${siteKey}.`)
  assert.equal(card.querySelector('img, [onerror]'), null)
  assert.equal(
    card.querySelector('[data-open-site]').getAttribute('action'),
    `/${encodeURIComponent(siteKey)}`
  )
})
