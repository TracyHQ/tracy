//   node --test scripts/test/shard-env-check.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { bash, script, tempDir, writeFiles } from './_shard.mjs'

const SHARD_SECRET = '0123456789abcdef'.repeat(4)
const SESSION_SECRET = 'session-secret-of-this-shard-0123456789'

// The seven variables a shard must carry (contract v1.1 section 9) plus HOST_NAME, which the cookie name is checked against.
const REQUIRED = {
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  SHARD_SECRET,
  SESSION_SECRET,
  SESSION_DOMAIN: 'tracy.ai',
  HOST_NAME: 's1',
  SESSION_COOKIE_NAME: 'tracy_sess_s1',
  TRACY_TUNNEL: 'catch-all'
}
const lines = (entries) => Object.entries(entries).map(([k, v]) => `${k}=${v}`)
const GOOD = lines(REQUIRED).join('\n')

function run(text, ...flags) {
  const dir = writeFiles(tempDir('env-check-'), { 'tracy-web.env': text })
  return bash([script('shard-env-check.sh'), path.join(dir, 'tracy-web.env'), ...flags])
}
const check = (text) => run(text)
const withGood = (extra) => `${GOOD}\n${extra}\n`
const without = (key) =>
  `${lines(REQUIRED)
    .filter((l) => !l.startsWith(`${key}=`))
    .join('\n')}\n`
const replaced = (key, value) => `${lines({ ...REQUIRED, [key]: value }).join('\n')}\n`
const output = (r) => r.stdout + r.stderr

test('a clean shard env passes', () => {
  const r = check(withGood('TRACY_ORIGIN=https://s1.tracy.ai\nGITHUB_APP_ID=123'))
  assert.equal(r.status, 0, r.stderr)
})

test('forbidden names and prefixes are refused by NAME, never by value', () => {
  const r = check(
    withGood(
      'DEMO_HOSTS=dev=contabo2\nCLOUDFLARE_TOKEN=cf-very-secret\nJOOMLART_SSO_SECRET=sso-very-secret\nCLOUDFLARE_SAAS_TOKEN=saas-very-secret'
    )
  )
  assert.equal(r.status, 1)
  for (const name of ['DEMO_HOSTS', 'CLOUDFLARE_TOKEN', 'JOOMLART_SSO_SECRET', 'CLOUDFLARE_SAAS_TOKEN'])
    assert.match(r.stderr, new RegExp(name))
  for (const value of ['cf-very-secret', 'sso-very-secret', 'saas-very-secret', 'contabo2'])
    assert.ok(!output(r).includes(value), value)
})

test('an empty forbidden line is fine, but compose reads `KEY=   # note` as set', () => {
  assert.equal(check(withGood('API_ORIGIN=\nBADGE_URL=')).status, 0)
  assert.equal(check(withGood('API_ORIGIN=\'\'\nBADGE_URL=""')).status, 0)
  assert.equal(check(withGood('API_ORIGIN=   # left over from prod')).status, 1)
})

test('commented-out lines and blank lines are not assignments', () => {
  assert.equal(check(withGood('# SHARDS=s1,s2\n\n   # CLOUDFLARE_TOKEN=tok')).status, 0)
})

test('CS_TELEGRAM_MODE=off is the one allowed value of a forbidden family', () => {
  assert.equal(check(withGood('CS_TELEGRAM_MODE=off')).status, 0)
  assert.equal(check(withGood('CS_TELEGRAM_MODE=webhook')).status, 1)
  assert.equal(check(withGood('CS_TELEGRAM_BOT_TOKEN=abc')).status, 1)
})

test('`export KEY=` lines count too', () => {
  assert.equal(check(withGood('export DISCORD_LINK_SECRET=abc')).status, 1)
})

test("the master's shard rows, switches and DNS token are refused; the shard's own SHARD_SECRET is not", () => {
  for (const line of [
    'SHARDS=s1,s2',
    'SHARD_s1_SECRET=abc',
    'SHARD_d1_ORIGIN=https://d1.tracy.site',
    'SHARD_ADOPT_ALLOW=*',
    'CLOUDFLARE_DNS_TOKEN=tok',
    'CLOUDFLARE_DNS_ZONE_ID=0123'
  ])
    assert.equal(check(withGood(line)).status, 1, line)
  assert.equal(check(withGood('SHARD_MAX_SITES=200')).status, 0)
})

test('the Cloudflare, tunnel and demo names added by contract v1.1 are refused', () => {
  for (const name of [
    'CLOUDFLARE_ACCOUNT',
    'CLOUDFLARE_TUNNEL',
    'TRACY_CF_API_TOKEN',
    'TRACY_CF_ACCOUNT_ID',
    'TRACY_TUNNEL_ID',
    'DEMO_HOST',
    'DEMO_JOOMLART_SSH_KEY',
    'GITHUB_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID',
    'BADGE_URL',
    'API_ORIGIN'
  ]) {
    const r = check(withGood(`${name}=value-that-must-not-leak`))
    assert.equal(r.status, 1, name)
    assert.match(r.stderr, new RegExp(`(^|[^A-Z_])${name}([^A-Z_]|$)`), name)
    assert.ok(!output(r).includes('value-that-must-not-leak'), name)
  }
  // TRACY_TUNNEL itself is required, not forbidden: only its _ID sibling is.
  assert.equal(check(withGood('TRACY_TUNNEL=catch-all')).status, 0)
})

test('a name that merely starts like a shard row is not a row', () => {
  assert.equal(check(withGood('SHARD_MAX_SITES=1\nSHARD_SECRET_FILE=/run/secret')).status, 0)
  assert.equal(check(withGood('SHARD_ADOPT_ALLOWED=1')).status, 0)
})

test('every required variable must be present: absence is refused by NAME', () => {
  for (const key of Object.keys(REQUIRED)) {
    const r = check(without(key))
    assert.equal(r.status, 1, key)
    assert.match(r.stderr, new RegExp(key), key)
  }
})

test('an empty required variable counts as absent', () => {
  for (const key of Object.keys(REQUIRED)) {
    const r = check(replaced(key, ''))
    assert.equal(r.status, 1, key)
    assert.match(r.stderr, new RegExp(key), key)
  }
})

test('required values are checked, and a wrong value is never printed', () => {
  const wrong = {
    TRACY_DEPLOYMENT_ROLE: 'masterish',
    SHARD_SECRET: 'ABCDEF0123456789'.repeat(4),
    SESSION_SECRET: 'too-short-secret-value',
    SESSION_COOKIE_NAME: 'tracy_sess_somebody_else',
    TRACY_TUNNEL: 'none-of-your-business'
  }
  for (const [key, value] of Object.entries(wrong)) {
    const r = check(replaced(key, value))
    assert.equal(r.status, 1, key)
    assert.match(r.stderr, new RegExp(key), key)
    assert.ok(!output(r).includes(value), `${key} value leaked`)
  }
  assert.equal(check(replaced('SHARD_SECRET', SHARD_SECRET.slice(1))).status, 1, '63 hex characters')
  assert.equal(check(replaced('SHARD_SECRET', `${SHARD_SECRET}0`)).status, 1, '65 hex characters')
  assert.equal(check(replaced('SESSION_SECRET', 'x'.repeat(31))).status, 1, '31 characters')
  assert.equal(check(replaced('SESSION_SECRET', 'x'.repeat(32))).status, 0, '32 characters')
})

test('the cookie name must follow HOST_NAME', () => {
  assert.equal(check(`${replaced('HOST_NAME', 'd1')}SESSION_COOKIE_NAME=tracy_sess_d1\n`).status, 0)
  assert.equal(check(replaced('HOST_NAME', 'd1')).status, 1)
})

test('the last assignment of a required variable wins, as compose reads it', () => {
  assert.equal(check(`SHARD_SECRET=nonsense\n${GOOD}\n`).status, 0)
  assert.equal(check(`${GOOD}\nSHARD_SECRET=nonsense\n`).status, 1)
})

test('quoted required values are read without their quotes', () => {
  assert.equal(check(replaced('SHARD_SECRET', `"${SHARD_SECRET}"`)).status, 0)
  assert.equal(check(replaced('TRACY_DEPLOYMENT_ROLE', "'shard'")).status, 0)
})

test('forbidden and required problems are reported together', () => {
  const r = check(`${without('MASTER_ORIGIN')}SHARDS=s1\n`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /SHARDS/)
  assert.match(r.stderr, /MASTER_ORIGIN/)
})

test('--forbidden-only skips the required variables and still refuses forbidden ones', () => {
  const bare = 'TRACY_ORIGIN=https://d1.tracy.site\nHOST_NAME=d1\n'
  assert.equal(check(bare).status, 1)
  assert.equal(run(bare, '--forbidden-only').status, 0)
  assert.equal(run(`${bare}SHARDS=d1\n`, '--forbidden-only').status, 1)
})

test('--list prints the names, the prefixes and the shard-row pattern', () => {
  const r = bash([script('shard-env-check.sh'), '--list'])
  assert.equal(r.status, 0)
  const listed = r.stdout.trim().split('\n')
  for (const entry of [
    'DEMO_HOST',
    'DEMO_HOSTS',
    'DEMO_JOOMLART_*',
    'JOOMLART_SSO_*',
    'GITHUB_OAUTH_*',
    'GOOGLE_OAUTH_*',
    'CS_TELEGRAM_*',
    'CLOUDFLARE_SAAS_*',
    'CLOUDFLARE_TOKEN',
    'CLOUDFLARE_ACCOUNT',
    'CLOUDFLARE_TUNNEL',
    'CLOUDFLARE_DNS_TOKEN',
    'CLOUDFLARE_DNS_ZONE_ID',
    'TRACY_CF_API_TOKEN',
    'TRACY_CF_ACCOUNT_ID',
    'TRACY_TUNNEL_ID',
    'DISCORD_LINK_SECRET',
    'BADGE_URL',
    'API_ORIGIN',
    'SHARDS',
    'SHARD_ADOPT_ALLOW',
    'SHARD_<name>_*'
  ])
    assert.ok(listed.includes(entry), entry)
  assert.ok(
    !listed.includes('GITHUB_APP_PRIVATE_KEY'),
    'each shard holds its own GitHub App key (amendment 5)'
  )
  assert.ok(!listed.includes('SHARD_SECRET') && !listed.includes('TRACY_TUNNEL'), 'required, not forbidden')
})

test('no argument or an unreadable file is a usage error', () => {
  assert.equal(bash([script('shard-env-check.sh')]).status, 2)
  assert.equal(bash([script('shard-env-check.sh'), '/nonexistent/tracy-web.env']).status, 2)
  assert.equal(bash([script('shard-env-check.sh'), '--forbidden-only']).status, 2)
})
