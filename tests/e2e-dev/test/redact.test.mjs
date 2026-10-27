import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cookieAttributes, findLeaks, redact, redactText } from '../lib/redact.mjs'

const TOKEN =
  'v1.eyJlbWFpbCI6ImUyZUBleGFtcGxlLnRlc3QiLCJleHAiOjE3OTk5OTk5OTl9.abcdefghijklmnopqrstuvwxyz012345'

test('a session token disappears wherever it appears', () => {
  assert.ok(!redactText(`cookie: tracy_sess=${TOKEN}; other=1`).includes(TOKEN))
  assert.ok(!redactText(`token was ${TOKEN} here`).includes(TOKEN))
  assert.ok(!redactText(`"tracy_sess=${TOKEN}"`).includes('eyJ'))
})

test('Set-Cookie keeps its attributes, loses its value', () => {
  const out = redactText(`tracy_sess=${TOKEN}; HttpOnly; Secure; SameSite=Lax; Domain=.tracy.site; Path=/`)
  assert.match(out, /HttpOnly; Secure; SameSite=Lax; Domain=\.tracy\.site; Path=\//)
  assert.ok(!out.includes(TOKEN))
})

test('authorization headers, bearer and GitHub tokens are masked', () => {
  assert.doesNotMatch(redactText('Authorization: Bearer abcdef0123456789xyz'), /abcdef0123456789xyz/)
  assert.doesNotMatch(redactText('{"authorization":"Basic dXNlcjpwYXNz"}'), /dXNlcjpwYXNz/)
  assert.doesNotMatch(redactText('push with ghs_0123456789abcdefghijABCDEFGHIJ'), /ghs_0123/)
})

test('invitation links and sign-in codes are masked', () => {
  assert.doesNotMatch(redactText('https://cowork.tracy.site/invite/AbCdEf0123456789'), /AbCdEf0123456789/)
  assert.doesNotMatch(
    redactText('https://cowork.tracy.site/verify?email=a@b&token=s3cr3tvalue'),
    /s3cr3tvalue/
  )
  assert.doesNotMatch(redactText('your sign-in code: 481516'), /481516/)
  assert.doesNotMatch(redactText('{"otp":"123456"}'), /123456/)
})

test('error codes and ordinary numbers survive', () => {
  assert.equal(redactText('{"code":"NOT_SIGNED_IN"}'), '{"code":"NOT_SIGNED_IN"}')
  assert.equal(redactText('ready in 123456 ms'), 'ready in 123456 ms')
})

test('objects: secret keys lose their value, other strings are scrubbed, shape is kept', () => {
  const out = redact({
    headers: { cookie: 'tracy_sess=x', 'Set-Cookie': 'tracy_sess=y', accept: 'text/html' },
    code: 'SITE_UNKNOWN',
    list: [`see ${TOKEN}`],
    token: null,
    n: 3
  })
  assert.equal(out.headers.cookie, '[redacted]')
  assert.equal(out.headers['Set-Cookie'], '[redacted]')
  assert.equal(out.headers.accept, 'text/html')
  assert.equal(out.code, 'SITE_UNKNOWN')
  assert.ok(!out.list[0].includes(TOKEN))
  assert.equal(out.token, null)
  assert.equal(out.n, 3)
})

test('findLeaks finds every kind of secret the publish gate stops on, and nothing once redacted', () => {
  const raw = [
    `token ${TOKEN}`,
    'Cookie: tracy_sess=abc123def456',
    '"cookie": "sessionvalue123"',
    'Authorization: Bearer abcdef0123456789xyz',
    'your sign-in code is 482913',
    'open https://cowork.tracy.site/invite/AbCdEf0123456789',
    'ghs_0123456789abcdefghijABCDEFGHIJ'
  ].join('\n')
  const kinds = findLeaks(raw).map((h) => h.kind)
  for (const kind of [
    'session token',
    'tracy cookie value',
    'cookie header',
    'bearer token',
    'six digits after "code"',
    'invitation link',
    'GitHub token'
  ])
    assert.ok(kinds.includes(kind), kind)
  assert.ok(findLeaks(raw).every((h) => !h.excerpt.includes('482913') && !h.excerpt.includes(TOKEN)))
  assert.deepEqual(findLeaks(redactText(raw)), [])
  // What reports legitimately hold: error codes, hashes, timings.
  assert.deepEqual(
    findLeaks('{"code":"SITE_UNKNOWN","status":404} sha b21c158bc1e688ab exit code 1 took 123456 ms'),
    []
  )
})

test('cookieAttributes reads a Set-Cookie line without its value', () => {
  const { name, attributes } = cookieAttributes(
    `tracy_sess=${TOKEN}; HttpOnly; Secure; SameSite=Lax; Domain=.tracy.site; Path=/`
  )
  assert.equal(name, 'tracy_sess')
  assert.deepEqual(attributes, {
    httponly: true,
    secure: true,
    samesite: 'Lax',
    domain: '.tracy.site',
    path: '/'
  })
  assert.ok(!JSON.stringify(attributes).includes(TOKEN))
})

test('a seat key is masked wherever it sits', () => {
  const key = 'trk_abcdefghijklmnop.Zx9_secret-Part'
  assert.doesNotMatch(redactText(`minted ${key} for the site`), /secret-Part/)
  assert.doesNotMatch(redactText(JSON.stringify({ key })), /secret-Part/)
})
