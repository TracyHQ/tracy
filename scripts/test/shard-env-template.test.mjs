//   node --test scripts/test/shard-env-template.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { R, bash, script } from './_shard.mjs'

const TEMPLATE = path.join(R, 'deploy/shard.env.example')
const text = () => readFileSync(TEMPLATE, 'utf8')
const mentioned = (body, key) => new RegExp(`(^|[^A-Za-z0-9_])${key}([^A-Za-z0-9_]|$)`, 'm').test(body)
const forbiddenOf = (body) =>
  [...body.matchAll(/^# \[FORBIDDEN\] ([A-Za-z0-9_<>]+\*?) /gm)].map((m) => m[1]).sort()
// A FORBIDDEN entry as a pattern: NAME, PREFIX_* or SHARD_<name>_* (<name>: the contract's shard name).
const asPattern = (f) =>
  new RegExp(`^${f.replace(/\*$/, '').replace('<name>', '[a-z][a-z0-9]{0,15}')}${f.endsWith('*') ? '' : '$'}`)
const coveredByForbidden = (forbidden, key) => forbidden.some((f) => asPattern(f).test(key))

test('the FORBIDDEN block and shard-env-check.sh --list name the same variables', () => {
  const listed = bash([script('shard-env-check.sh'), '--list'])
    .stdout.trim()
    .split('\n')
    .sort()
  assert.deepEqual(forbiddenOf(text()), listed)
})

test('the template itself passes shard-env-check.sh (no forbidden name, every required one set)', () => {
  const run = bash([script('shard-env-check.sh'), TEMPLATE])
  assert.equal(run.status, 0, run.stderr)
})

test('every variable deploy/.env.example declares is classified here', () => {
  const body = text()
  const forbidden = forbiddenOf(body)
  const keys = [...readFileSync('deploy/.env.example', 'utf8').matchAll(/^([A-Z][A-Za-z0-9_]*)=/gm)].map(
    (m) => m[1].replace(/^HOST_local_/, 'HOST_s1_').replace(/^SEAT_local_/, 'SEAT_s1_')
  )
  assert.ok(keys.length > 100, 'deploy/.env.example was read')
  const missing = keys.filter((k) => !mentioned(body, k) && !coveredByForbidden(forbidden, k))
  assert.deepEqual(missing, [])
})

test("every key tracy-web's config.js reads with need() is classified here", () => {
  const body = text()
  const forbidden = forbiddenOf(body)
  const needed = [
    ...readFileSync('apps/tracy-web/src/config.js', 'utf8').matchAll(/need\(env, '([A-Z0-9_]+)'\)/g)
  ].map((m) => m[1])
  assert.ok(needed.includes('TRACY_ORIGIN') && needed.includes('SESSION_SECRET'))
  const missing = needed.filter((k) => !mentioned(body, k) && !coveredByForbidden(forbidden, k))
  assert.deepEqual(missing, [])
})

test('the names W2 reads are assigned, with the amended spellings and the contract (section 9)', () => {
  const body = text()
  for (const line of [
    'TRACY_DEPLOYMENT_ROLE=shard',
    'SESSION_COOKIE_NAME=tracy_sess_s1',
    'TRACY_TUNNEL=catch-all',
    'BETA_GATE=off',
    'GITHUB_ORG=tracy-sites-s1'
  ])
    assert.match(body, new RegExp(`^${line}$`, 'm'), line)
  for (const key of [
    'MASTER_ORIGIN',
    'SHARD_SECRET',
    'SESSION_SECRET',
    'SESSION_DOMAIN',
    'DOCS_ORIGIN',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_WEBHOOK_SECRET'
  ])
    assert.match(body, new RegExp(`^${key}=`, 'm'), key)
  assert.doesNotMatch(body, /^TRACY_ROLE=/m, 'renamed to TRACY_DEPLOYMENT_ROLE (amendment 5)')
  assert.doesNotMatch(body, /^GITHUB_ORG=TracyHQ$/m, "a shard's App lives in the shard's own org")
  for (const name of [
    'SHARD_ADOPT_ALLOW',
    'SHARDS',
    'SHARD_<name>_*',
    'CLOUDFLARE_DNS_TOKEN',
    'CLOUDFLARE_DNS_ZONE_ID',
    'CLOUDFLARE_TOKEN',
    'CLOUDFLARE_ACCOUNT',
    'CLOUDFLARE_TUNNEL',
    'TRACY_CF_API_TOKEN',
    'TRACY_CF_ACCOUNT_ID',
    'TRACY_TUNNEL_ID'
  ])
    assert.ok(forbiddenOf(body).includes(name), `${name} is FORBIDDEN on a shard`)
})

test('no forbidden key appears in the template, not even commented out as an assignment', () => {
  const listed = bash([script('shard-env-check.sh'), '--list'])
    .stdout.trim()
    .split('\n')
  const assignment = /^#?\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/
  const keys = text()
    .split('\n')
    .map((l) => assignment.exec(l)?.[1])
    .filter(Boolean)
  const hits = keys.filter(
    (k) => coveredByForbidden(listed, k) && k !== 'SHARD_SECRET' && k !== 'SHARD_MAX_SITES'
  )
  assert.deepEqual(hits, [])
})

test('no value line carries a comment (compose would keep it as the value)', () => {
  const bad = text()
    .split('\n')
    .filter((l) => /^[A-Z][A-Za-z0-9_]*=.*\s#/.test(l))
  assert.deepEqual(bad, [])
})
