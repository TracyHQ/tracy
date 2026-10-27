// Rendered pages fence every email address with Cloudflare's email_off markers, so Email
// Obfuscation cannot turn it into "[email protected]" (measured on cowork.tracy.site 04/10).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailOff } from '../src/lib/html.js'
import { noSitesPage, workspaceUnavailablePage } from '../src/bar/pages.js'
import { deviceApprovedPage, deviceConfirmPage, loginPage } from '../src/identity/pages.js'
import { connectPage, consentPage } from '../src/mcp/pages.js'
import { inviteLandingPage, teamPage, whoamiLine, wrongAccountPage } from '../src/seats/pages.js'

const ADDRESS = 'kimdesigner@example.com'
const fenced = (html) => html.includes(`<!--email_off-->`) && html.includes(`<!--email_on-->`)

/** Every occurrence of the address in visible markup sits between the two markers. */
function assertFenced(html, where) {
  const body = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/="[^"]*"/g, '=""')
  let from = 0
  let found = 0
  for (;;) {
    const at = body.indexOf(ADDRESS, from)
    if (at < 0) break
    found += 1
    const open = body.lastIndexOf('<!--email_off-->', at)
    const close = body.lastIndexOf('<!--email_on-->', at)
    assert.ok(open > close, `${where}: the address at ${at} is outside the email_off markers`)
    from = at + ADDRESS.length
  }
  assert.ok(found > 0, `${where}: the page shows the address`)
}

test('emailOff wraps markup in the markers Cloudflare honours', () => {
  assert.equal(
    emailOff('<strong>a@b.test</strong>'),
    '<!--email_off--><strong>a@b.test</strong><!--email_on-->'
  )
})

test('the bar pages fence the signed-in address', async () => {
  const waiting = await noSitesPage(ADDRESS, {
    signInHref: '/login',
    invites: [{ label: 'wptest0929', siteKey: 'wptest0929.tracy.site' }]
  }).text()
  assertFenced(waiting, 'noSitesPage')
  assertFenced(
    await workspaceUnavailablePage(ADDRESS, { retryHref: '/', reason: 'x' }).text(),
    'workspaceUnavailablePage'
  )
})

test('the identity pages fence the address', () => {
  assertFenced(loginPage({ step: 'code', email: ADDRESS }), 'loginPage code step')
  assertFenced(deviceConfirmPage({ email: ADDRESS, nonce: 'n' }), 'deviceConfirmPage')
  assertFenced(deviceApprovedPage({ email: ADDRESS }), 'deviceApprovedPage')
})

test('the seat pages fence the address', () => {
  assertFenced(whoamiLine(ADDRESS), 'whoamiLine')
  assertFenced(wrongAccountPage({ email: ADDRESS, loginHref: '/login' }), 'wrongAccountPage')
  assertFenced(
    inviteLandingPage({
      summary: 'landed',
      role: 'editor',
      sites: [{ siteKey: 'a.test', label: 'a' }],
      email: ADDRESS
    }),
    'inviteLandingPage'
  )
  assertFenced(
    teamPage({ siteKey: 'a.test', seats: [{ email: ADDRESS, role: 'editor', acceptedAt: 'x' }], viewer: {} }),
    'teamPage'
  )
  assert.ok(fenced(whoamiLine(ADDRESS)))
})

test('the invitation-waiting page has no dash and one alignment', async () => {
  const html = await noSitesPage(ADDRESS, {
    signInHref: '/login',
    invites: [{ label: 'wptest0929', siteKey: 'wptest0929.tracy.site' }]
  }).text()
  const main = html.slice(html.indexOf('<h1>'))
  assert.doesNotMatch(main, /[—–]/)
  assert.doesNotMatch(main, /class="note"/, 'no centred note mixed into the left-aligned card text')
  assert.match(main, /<ul class="hint"><li>/)
})

test('team rows separate the address and the role with a middle dot, not a dash', () => {
  const html = teamPage({
    siteKey: 'a.test',
    seats: [{ email: ADDRESS, role: 'editor', acceptedAt: 'x' }],
    viewer: {}
  })
  const row = html.match(/<li>[\s\S]*?<\/li>/)?.[0] ?? ''
  assert.match(row, /<!--email_on--> · /)
  assert.doesNotMatch(row, /[—–]/)
})

test('the MCP consent and device connect pages fence the address', () => {
  // The connect page an outside app (Website Opportunities) sends people to read "[email protected]" (25/10/2026).
  const form = { request: 'r', signature: 's', lang: 'en' }
  assertFenced(
    connectPage({ email: ADDRESS, clientName: 'Website Opportunities', code: 'ABCD-EFGH', ...form }),
    'connectPage'
  )
  assertFenced(consentPage({ email: ADDRESS, sites: [], ...form }), 'consentPage')
})
