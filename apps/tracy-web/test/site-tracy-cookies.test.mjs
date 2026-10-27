/**
 * A customer site never sets one of Tracy's cookies, on Tracy's own addresses either (contract
 * §3.1 (2), review I6): the site lives under the parent domain, where `tracy_sess*`, `tracy_handoff`
 * and the shard pointer are read. `proxySite` is driven directly, no database.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { proxySite } from '../src/bar/site-proxy.js'
import { outgoingCookieHeader } from '../src/lib/cookies.js'

function ask(setCookies, { canonical = null, host = 'shop.tracy.test', cookie = null, sent = [] } = {}) {
  const init = cookie ? { headers: { cookie } } : {}
  return proxySite(new Request(`https://${host}/`, init), new URL('http://shop-web-1/'), {
    email: null,
    sameHost: true,
    viewerHost: host,
    viewerProto: 'https',
    publish: 'published',
    variant: canonical ? 'none' : 'managed',
    badgeUrl: 'https://tracy.test/badge.js',
    canonical,
    fetchImpl: async (req) => {
      sent.push(req.headers.get('cookie'))
      const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8' })
      for (const cookie of setCookies) headers.append('set-cookie', cookie)
      return new Response('hello', { headers })
    }
  })
}

test('on a Tracy address the site keeps its own cookies and loses every one of Tracy’s', async () => {
  const res = await ask([
    'cart=1; Path=/',
    'tracy_shard=s9; Domain=tracy.test; Path=/',
    '__Host-tracy_shard=s9; Path=/; Secure',
    'tracy_handoff=0123456789abcdef0123456789abcdef; Domain=tracy.test; Path=/',
    'tracy_sess=forged; Domain=tracy.test; Path=/',
    'tracy_sess_s1=forged; Domain=tracy.test; Path=/',
    'wordpress_logged_in=x; Path=/'
  ])
  assert.deepEqual(res.headers.getSetCookie(), ['cart=1; Path=/', 'wordpress_logged_in=x; Path=/'])
  assert.equal(await res.text(), 'hello')
})

test('a site that sets only ordinary cookies is untouched, and one with none stays without', async () => {
  assert.deepEqual((await ask(['a=1', 'b=2; HttpOnly'])).headers.getSetCookie(), ['a=1', 'b=2; HttpOnly'])
  assert.deepEqual((await ask([])).headers.getSetCookie(), [])
})

// The theme's own cookie: Tracy Business keeps a previewed design system (`?style=<id>`) in
// `tracy_style` for a day (Joomla `tpl_tracy/resolve.php`, WordPress `tracy-base/functions.php`).
// Measured 21/10/2026 (flows case audit-cms-001-01): expected `tracy_style=airbnb`, got none.
const TRACY_NAMES = [
  'tracy_style_extra',
  'Tracy_Style',
  'tracy_sess',
  'tracy_sess_ab',
  'tracy_shard',
  '__Host-tracy_shard',
  'tracy_handoff',
  'tracy_tok_x',
  'dsh_gateway_token',
  'tracy_new'
]
const PLACES = [
  ['a Tracy address', {}],
  ['an own domain', { canonical: new URL('https://shop.tracy.test'), host: 'shop.example.com' }]
]

for (const [where, place] of PLACES) {
  test(`on ${where} the theme's tracy_style goes through both ways; every other Tracy name is dropped`, async () => {
    const sent = []
    const res = await ask(
      [
        'tracy_style=airbnb; Path=/; Max-Age=86400; SameSite=Lax',
        ...TRACY_NAMES.map((n) => `${n}=x; Path=/`)
      ],
      {
        ...place,
        sent,
        cookie: ['tracy_style=airbnb', ...TRACY_NAMES.map((n) => `${n}=x`), 'cart=1'].join('; ')
      }
    )
    assert.deepEqual(res.headers.getSetCookie(), ['tracy_style=airbnb; Path=/; Max-Age=86400; SameSite=Lax'])
    assert.deepEqual(sent, ['tracy_style=airbnb; cart=1'])
  })
}

test('dsh is not a site: the workspace path keeps dropping tracy_style', () => {
  assert.equal(outgoingCookieHeader('tracy_style=airbnb; wp=1', 'T'), 'wp=1; dsh_gateway_token=T')
  assert.equal(
    outgoingCookieHeader('tracy_style=airbnb; wp=1', null, { site: true }),
    'tracy_style=airbnb; wp=1'
  )
})
