/**
 * The site-mail token: the fleet computes it with `openssl dgst -hmac` at provision, this process
 * recomputes it from `config.hosts`. The two must agree byte for byte, or every site's mail is 401.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { siteMailToken, verifySiteMailToken } from '../src/mail/site-mail/token.js'

const hasOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

test('the token is the one the fleet computes with openssl', {
  skip: hasOpenssl ? false : 'no openssl'
}, () => {
  const label = 'bao-cao-1a2b'
  const secret = 'host-secret-value'
  // The exact pipeline written in the contract (`lib/relay-git-token.sh` style).
  const fleet = execFileSync(
    'sh',
    [
      '-c',
      `printf '%s' "site-mail:v1:$LABEL" | openssl dgst -sha256 -hmac "$HOST_SECRET" -hex | sed 's/^.*= //'`
    ],
    { env: { ...process.env, LABEL: label, HOST_SECRET: secret }, encoding: 'utf8' }
  ).trim()
  assert.equal(siteMailToken(secret, label), fleet)
})

test('verify accepts the exact token only', () => {
  const t = siteMailToken('s1', 'lantern')
  assert.match(t, /^[0-9a-f]{64}$/)
  assert.equal(verifySiteMailToken('s1', 'lantern', t), true)
  assert.equal(verifySiteMailToken('s1', 'lantern', t.toUpperCase()), true)
  assert.equal(verifySiteMailToken('s2', 'lantern', t), false, 'another host secret')
  assert.equal(verifySiteMailToken('s1', 'ember', t), false, 'another site')
  assert.equal(verifySiteMailToken('s1', 'lantern', t.slice(0, 63)), false, 'short')
  assert.equal(verifySiteMailToken('s1', 'lantern', `${t.slice(0, 63)}g`), false, 'not hex')
  assert.equal(verifySiteMailToken('s1', 'lantern', null), false)
  assert.equal(verifySiteMailToken('', 'lantern', t), false, 'no secret is never a match')
  assert.equal(verifySiteMailToken(undefined, 'lantern', t), false)
})
