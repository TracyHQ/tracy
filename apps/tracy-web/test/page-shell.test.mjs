import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pageShellModule from '../src/lib/page-shell.js'
import { pageShell, roleLabel } from '../src/lib/page-shell.js'
import { unknownSitePage, messagePage as barMessagePage } from '../src/bar/pages.js'
import {
  messagePage as seatsMessagePage,
  tooManyRequestsPage,
  teamPage as seatsTeamPage,
  joinPage,
  invalidInvitePage,
  wrongAccountPage,
  inviteLandingPage
} from '../src/seats/pages.js'

// ── pageShell: the token contract from docs/references/page-shell-tokens.md ────────────────────

test('pageShell: doctype, lang, viewport, color-scheme and favicon are present', () => {
  const html = pageShell('A title', '<p>body</p>')
  assert.match(html, /^<!doctype html><html lang="en">/)
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/)
  assert.match(html, /<meta name="color-scheme" content="light dark">/)
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/)
})

test('pageShell: escapes the title', () => {
  const html = pageShell('<script>alert(1)</script>', '<p>body</p>')
  assert.doesNotMatch(html, /<title><script>/)
  assert.match(html, /<title>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/)
})

test('pageShell: the token block mirrors docs/references/page-shell-tokens.md, values unchanged', () => {
  const html = pageShell('T', '<p>body</p>')
  assert.match(html, /:root\{/)
  assert.match(html, /--background:oklch\(1 0 0\)/)
  assert.match(html, /--foreground:oklch\(0\.145 0 0\)/)
  // --primary is Tracy's terracotta since 14/09/2026 (Akemi: one primary for the whole system;
  // Tracy blue retired) — as oklch, mirroring tokens.css, never as a raw hex.
  // #228: one step darker than the brand mark (#bf5b3d) so its label and its words read at WCAG AA.
  assert.match(html, /--primary:oklch\(0\.565 0\.136 37\.4\)/)
  assert.doesNotMatch(html, /--primary:oklch\(0\.623 0\.16 259\.8\)/)
  assert.doesNotMatch(html, /--primary:#/i)
  assert.match(html, /@media \(prefers-color-scheme:dark\)/)
})

test('pageShell: two font stylesheets, each with its preconnect', () => {
  const html = pageShell('T', '<p>body</p>')
  assert.match(html, /rel="preconnect" href="https:\/\/api\.fontshare\.com"/)
  assert.match(html, /rel="stylesheet" href="https:\/\/api\.fontshare\.com/)
  assert.match(html, /rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/)
})

test('pageShell: Vietnamese pages swap General Sans for Be Vietnam Pro, other languages keep it', () => {
  // General Sans stacks Vietnamese double diacritics wrongly ("cần" renders as "cân").
  const vi = pageShell('T', '<p>body</p>', '', { lang: 'vi' })
  assert.match(vi, /<html lang="vi">/)
  assert.match(
    vi,
    /rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Be\+Vietnam\+Pro:wght@300;400;500;600/
  )
  assert.doesNotMatch(vi, /api\.fontshare\.com/)
  assert.match(
    vi,
    /:lang\(vi\) body,:lang\(vi\) button,:lang\(vi\) input,:lang\(vi\) select\{\s*font-family:"Be Vietnam Pro"/
  )
  // Headings keep Newsreader in every language.
  assert.match(vi, /family=Newsreader/)
  for (const lang of ['en', 'de', 'zh']) {
    const html = pageShell('T', '<p>body</p>', '', { lang })
    assert.match(html, /rel="stylesheet" href="https:\/\/api\.fontshare\.com\/v2\/css\?f%5B%5D=general-sans/)
    assert.doesNotMatch(html, /Be\+Vietnam\+Pro/)
  }
})

test('pageShell: no inline script unless one is passed', () => {
  assert.doesNotMatch(pageShell('T', '<p>body</p>'), /<script>/)
  assert.match(pageShell('T', '<p>body</p>', 'console.log(1)'), /<script>console\.log\(1\)<\/script>/)
})

// ── #807: three helpers nothing rendered, in English only ────────────────────────────────────────
// ADR 0018 took away the last caller of `noindexBadge`, `guestAccessControl` and `permissionsTable`
// (`privatePage` and `teamPage`). They stayed, exported and tested, as sentences no translation
// covered and no page showed. Gone now; what a live page still needs from this file is below.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const source = (file) => readFileSync(join(REPO, file), 'utf8')

test('the three unused English-only helpers are gone, with the table only they read', () => {
  for (const name of ['noindexBadge', 'guestAccessControl', 'permissionsTable']) {
    assert.equal(name in pageShellModule, false, `${name} is exported again`)
  }
  const text = source('apps/tracy-web/src/lib/page-shell.js')
  assert.doesNotMatch(text, /\b(?:noindexBadge|guestAccessControl|permissionsTable|PERMISSION_ROWS)\b/)
  assert.doesNotMatch(text, /Hidden from search and AI|Guest access|What each role can do/)
  // The rules that styled only their markup went with them: dead bytes on every page otherwise.
  const stylesheet = pageShell('T', '<p>x</p>').match(/<style>([\s\S]*)<\/style>/)[1]
  assert.doesNotMatch(
    stylesheet,
    /\.(?:noindex|guest|guest-row|guest-state|guest-form|dot|perm-title|perm-note)\b|table\.perm/
  )
})

test('roleLabel stays: Owner, Admin, and Member for every other role', () => {
  assert.equal(roleLabel('owner'), 'Owner')
  assert.equal(roleLabel('admin'), 'Admin')
  for (const role of ['editor', 'viewer', '', undefined, null]) {
    assert.equal(roleLabel(role), 'Member', String(role))
  }
})

test('every page of the shell still tells crawlers to stay out', () => {
  assert.match(pageShell('T', '<p>body</p>'), /<meta name="robots" content="noindex">/)
  assert.match(pageShell('T', '<p>body</p>', '', { lang: 'vi' }), /<meta name="robots" content="noindex">/)
})

test('the token contract is cited where it lives, and it names the file that carries it out', () => {
  const contract = 'docs/references/page-shell-tokens.md'
  assert.ok(existsSync(join(REPO, contract)), `${contract} is missing`)
  for (const file of [
    'apps/tracy-web/src/lib/page-shell.js',
    'apps/tracy-web/src/bar/pages.js',
    'apps/tracy-web/src/seats/route.js'
  ]) {
    const text = source(file)
    assert.doesNotMatch(text, /worker-tokens\.md/, `${file} cites the deleted worker-tokens.md`)
    assert.ok(text.includes(contract), `${file} does not cite ${contract}`)
  }
  for (const file of ['apps/tracy-web/src/lib/page-shell.js', 'apps/tracy-web/src/bar/pages.js']) {
    assert.doesNotMatch(source(file), /workers\/fleet-bar/, `${file} points into the deleted Worker tree`)
  }
  const doc = source(contract)
  const implementer = doc.slice(doc.indexOf('## Where the contract is implemented'))
  assert.ok(
    doc.includes('## Where the contract is implemented'),
    'the contract lost its "who implements it" section'
  )
  assert.doesNotMatch(implementer, /workers\/fleet-bar/)
  assert.match(implementer, /apps\/tracy-web\/src\/lib\/page-shell\.js/)
  assert.ok(existsSync(join(REPO, 'apps/tracy-web/src/lib/page-shell.js')))
})

// ── The shared stylesheet must carry every class a real page renders ───────────────────────────
//
// Review round 2, finding 1: `ul.hint` was dropped from page-shell.js's CSS as "proposals-only",
// but `otpPage` uses it for its seat-holder hint list and `seats/pages.js` (teamPage's roster,
// the invite-outcome lists) reuses the same class — both rendered completely unstyled, and no
// test caught it because every existing test only checked MARKUP, never that the stylesheet
// backing it still existed. This test asserts the other half: every `class="..."` token any page
// function actually renders must appear as a real selector in `pageShell`'s own `<style>` block.

function classesIn(html) {
  const found = new Set()
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) found.add(cls)
  }
  return found
}

test('the shared stylesheet carries every class bar/pages.js and seats/pages.js actually render', async () => {
  // Four pages left `bar/pages.js` with ADR 0018 (the bar stopped gating and stopped signing
  // anyone in), so the classes they rendered are no longer rendered by this file.
  const barPages = [await unknownSitePage('x.example').text(), await barMessagePage('T', 'm').text()]
  const seatsPages = [
    seatsMessagePage('T', 'm'),
    tooManyRequestsPage(),
    seatsTeamPage({
      siteKey: 'x.example',
      seats: [{ email: 'a@b.c', role: 'editor', status: 'accepted' }],
      viewer: 'a@b.c'
    }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c', error: 'e' }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c', requested: true }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c', settled: 'invited' }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c', settled: 'granted' }),
    joinPage({ siteKey: 'x.example', viewer: 'a@b.c', settled: 'unclaimed' }),
    invalidInvitePage(),
    wrongAccountPage({ email: 'a@b.c', loginHref: '/login' }),
    inviteLandingPage({
      summary: 'accepted',
      role: 'editor',
      sites: [{ siteKey: 'a.example', outcome: 'accepted' }],
      email: 'a@b.c'
    }),
    inviteLandingPage({ summary: 'revoked', role: 'editor', sites: [], email: 'a@b.c' }),
    inviteLandingPage({ summary: 'already', role: 'editor', sites: [], email: 'a@b.c' })
  ]

  const stylesheet = pageShell('T', '<p>x</p>').match(/<style>([\s\S]*)<\/style>/)[1]
  const classes = new Set()
  for (const html of [...barPages, ...seatsPages]) for (const cls of classesIn(html)) classes.add(cls)

  const missing = [...classes].filter((cls) => !new RegExp(`\\.${cls}(?![-\\w])`).test(stylesheet))
  assert.deepEqual(missing, [])
})

test('ul.hint is styled — the roster/invite-outcome list class, not a proposals leftover', () => {
  const html = pageShell('T', '<p>x</p>')
  assert.match(html, /ul\.hint\{/)
  assert.match(html, /ul\.hint li\{/)
})

// ── The desktop app's Windows frame (tasks/todo-desktop-windows.md §4 row F) ───────────────────

/** The CSS of one page, from its <style> block. */
function shellCss(html = pageShell('T', '<p>body</p>')) {
  return html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'))
}

test('pageShell: under a window-controls overlay the top strip drags the window, sized only by the overlay', () => {
  const css = shellCss()
  // The strip exists only where the Window Controls Overlay env() variables do (the desktop app on
  // Windows): every size falls back to 0, so a browser and the Mac app draw nothing and drag nothing.
  const strip = /body::before\{([^}]*)\}/.exec(css)
  assert.ok(strip, 'a body::before strip')
  assert.match(strip[1], /-webkit-app-region:drag/)
  assert.match(strip[1], /position:fixed/)
  assert.match(strip[1], /height:env\(titlebar-area-height,0px\)/)
  assert.match(strip[1], /width:env\(titlebar-area-width,0px\)/)
  assert.match(strip[1], /left:env\(titlebar-area-x,0px\)/)
  assert.match(strip[1], /top:env\(titlebar-area-y,0px\)/)
  assert.match(strip[1], /background:var\(--background\)/)
  // Every env() in the sheet has a zero fallback: none can change a page outside the overlay.
  for (const use of css.match(/env\([^)]*\)/g) ?? [])
    assert.match(use, /^env\(titlebar-area-[a-z]+,0px\)$/, use)
})

test("pageShell: the page's content starts below the overlay's height, and only there", () => {
  const body = /(?:^|\n)body\{([^}]*)\}/.exec(shellCss())
  assert.ok(body)
  assert.match(body[1], /padding:calc\(32px \+ env\(titlebar-area-height,0px\)\) 20px 32px/)
})

test("pageShell: the page tells the app's overlay buttons its own background and text colours", () => {
  // dsh's desktop preload paints the Windows caption buttons with what it measures from these two
  // names; without them it measured a transparent fill.
  const css = shellCss()
  assert.match(css, /--dsw-specific-sidebar-fill:var\(--background\)/)
  assert.match(css, /--dsw-alias-label-primary:var\(--foreground\)/)
})

test('pageShell: a theme change never fades a button fill while its text has already flipped', () => {
  // Measured on the Windows VM 10/10: the fill faded for 150 ms from the old theme while the label
  // took the new colour at once — dark on dark ("Continue with email" without its text).
  const css = shellCss()
  const base = /(?:^|\n)button\{([^}]*)\}/.exec(css)
  assert.ok(base)
  assert.doesNotMatch(base[1], /transition:[^;]*background-color/)
  assert.match(css, /button:hover,button:active\{transition:background-color \.15s,box-shadow \.15s\}/)
})
