import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../lib/', import.meta.url))

// The hosts are a machine setting (scripts/lib/machine-hosts.mjs); the suite gets its own file.
const HOSTS_FILE = join(mkdtempSync(join(tmpdir(), 'e2e-hosts-')), 'hosts.env')
writeFileSync(
  HOSTS_FILE,
  'E2E_SSH_DEV=ubuntu@dev-host.invalid\nE2E_SSH_STAGING=ubuntu@staging-host.invalid\n'
)

/**
 * `ENV` is frozen when `env.mjs` loads, so each profile is read in a process of its own.
 * @param {Record<string, string>} env
 * @param {string} body - module code; `L` is the lib folder URL
 */
function inProcess(env, body) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('E2E_DEV_') && k !== 'E2E_ENV')
  )
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', body], {
    env: { ...clean, TRACY_HOSTS_FILE: HOSTS_FILE, ...env },
    encoding: 'utf8'
  })
  return JSON.parse(out)
}

const READ = `
const { ENV, addressLabel, runEmail, siteKeyOf, siteOrigin } = await import(${JSON.stringify(`${LIB}env.mjs`)})
process.stdout.write(JSON.stringify({
  name: ENV.name, origin: ENV.origin, apiOrigin: ENV.apiOrigin, ssh: ENV.ssh.target,
  prefix: ENV.sitePrefix, results: ENV.resultsRoot, email: runEmail('0107abcd', 'owner'),
  address: addressLabel('e2e0107abcdw'), key: siteKeyOf(addressLabel('e2e0107abcdw')),
  site: siteOrigin(addressLabel('e2e0107abcdw'))
}))`

test('dev stays the default and keeps per-run accounts with no prefix', () => {
  const r = inProcess({}, READ)
  assert.equal(r.name, 'dev')
  assert.equal(r.origin, 'https://cowork.tracy.site')
  assert.equal(r.prefix, '')
  assert.equal(r.email, 'e2e-0107abcd-owner@example.test')
  assert.equal(r.key, 'e2e0107abcdw.tracy.site')
  assert.match(r.results, /e2e-dev$/)
})

test('staging builds stg- addresses, reuses fixed accounts and keeps its own results folder', () => {
  const r = inProcess({ E2E_ENV: 'staging' }, READ)
  assert.equal(r.origin, 'https://cowork-staging.tracy.site')
  assert.equal(r.apiOrigin, 'https://api-staging.tracy.site')
  assert.equal(r.address, 'stg-e2e0107abcdw')
  assert.equal(r.key, 'stg-e2e0107abcdw.tracy.site')
  assert.equal(r.site, 'https://stg-e2e0107abcdw.tracy.site')
  assert.equal(r.email, 'e2e-staging-owner@example.test')
  assert.match(r.results, /e2e-staging$/)
})

test('every profile reaches the host its own machine setting names, and E2E_DEV_SSH overrides it', () => {
  assert.equal(inProcess({ E2E_ENV: 'dev' }, READ).ssh, 'ubuntu@dev-host.invalid')
  assert.equal(inProcess({ E2E_ENV: 'staging' }, READ).ssh, 'ubuntu@staging-host.invalid')
  assert.equal(
    inProcess({ E2E_ENV: 'staging', E2E_DEV_SSH: 'me@other.invalid' }, READ).ssh,
    'me@other.invalid'
  )
})

test('an unknown environment stops before anything runs', () => {
  assert.throws(() => inProcess({ E2E_ENV: 'production' }, READ), /unknown environment/)
})

test('--env on the command line becomes E2E_ENV before env.mjs loads', () => {
  const body = `
await import(${JSON.stringify(`${LIB}select-env.mjs`)})
const { ENV } = await import(${JSON.stringify(`${LIB}env.mjs`)})
process.stdout.write(JSON.stringify(ENV.name))`
  // A file, not `-e`: `run.mjs` is a script, and `process.argv` keeps the script's path at [1].
  const script = join(mkdtempSync(join(tmpdir(), 'e2e-env-')), 'run.mjs')
  writeFileSync(script, body)
  for (const flag of [['--env', 'staging'], ['--env=staging']]) {
    const out = execFileSync(process.execPath, [script, ...flag], {
      env: { ...process.env, E2E_ENV: '' },
      encoding: 'utf8'
    })
    assert.equal(JSON.parse(out), 'staging')
  }
})

test('createSite types the bare label, files the prefixed one, and catches a wrong prefix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-env-'))
  const body = `
const { Manifest } = await import(${JSON.stringify(`${LIB}manifest.mjs`)})
const { createSite } = await import(${JSON.stringify(`${LIB}sites.mjs`)})
const sent = []
const owner = (siteKey) => ({
  email: 'e2e-staging-owner@example.test',
  async post(path, body) { sent.push(body.label); return { status: 202, json: { siteKey, jobId: 'j1' }, text: '', ms: 1 } }
})
const m = Manifest.create(${JSON.stringify(join(dir, 'a'))}, 'r1abcd')
const ok = await createSite(owner('stg-e2er1abcdw.tracy.site'), m, { label: 'e2er1abcdw', platform: 'wordpress' })
const m2 = Manifest.create(${JSON.stringify(join(dir, 'b'))}, 'r2abcd')
const wrong = await createSite(owner('e2er2abcdw.tracy.site'), m2, { label: 'e2er2abcdw', platform: 'wordpress' })
  .then(() => null, (e) => e.message)
process.stdout.write(JSON.stringify({
  sent, ok: { siteKey: ok.siteKey, label: ok.label }, filed: m.read().resources.map((r) => [r.id, r.state, r.data.label]),
  wrong, filed2: m2.read().resources.map((r) => [r.id, r.state])
}))`
  const r = inProcess({ E2E_ENV: 'staging' }, body)
  assert.deepEqual(r.sent, ['e2er1abcdw', 'e2er2abcdw'])
  assert.deepEqual(r.ok, { siteKey: 'stg-e2er1abcdw.tracy.site', label: 'stg-e2er1abcdw' })
  assert.deepEqual(r.filed, [['stg-e2er1abcdw.tracy.site', 'created', 'stg-e2er1abcdw']])
  assert.match(r.wrong, /site prefix is wrong/)
  // The site the server did make is in the manifest, so the end-of-run cleanup removes it.
  assert.deepEqual(r.filed2, [
    ['stg-e2er2abcdw.tracy.site', 'intended'],
    ['e2er2abcdw.tracy.site', 'created']
  ])
})
