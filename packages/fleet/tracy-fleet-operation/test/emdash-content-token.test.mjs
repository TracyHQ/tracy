#!/usr/bin/env node
/**
 * The Content API relay token helpers in `provision/platform/emdash.sh`: a read-only PAT generated
 * on the host, kept root 0600 at $SITE_DIR/tracy-content.token, whose SHA-256 (hex) is the only
 * part the container sees (`TRACY_CONTENT_API_RELAY_TOKEN_SHA256` in .env). Drives the REAL function
 * source, lifted out of the script the same way `emdash-agent-token.test.mjs` does, with chown/stat
 * shadowed to simulate root (a non-root run fails closed there, proven by that suite).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-content-token.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/platform/emdash.sh', import.meta.url))
const MOCK_ROOT = `chown() { return 0; }\nstat() { case "$*" in *'%u'*) echo 0; return 0;; esac; command stat "$@"; }\n`

function helperSource() {
  const src = readFileSync(SCRIPT, 'utf8')
  const start = src.indexOf('_emdash_agent_token_file()')
  const end = src.indexOf('platform_compose() {')
  assert.ok(start !== -1 && end > start, 'could not locate the token helpers in emdash.sh')
  const helpers = src.slice(start, end)
  assert.match(
    helpers,
    /_emdash_prepare_content_token\(\)/,
    'content token helper moved out of the lifted range'
  )
  return helpers
}

function run(siteDir, body) {
  const script = `set -euo pipefail\nSITE_DIR=${JSON.stringify(siteDir)}\n${helperSource()}\n${MOCK_ROOT}${body}\n`
  try {
    return { status: 0, stdout: execFileSync('bash', ['-c', script], { encoding: 'utf8' }) }
  } catch (e) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
  }
}

function site(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-content-token-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(
    path.join(dir, '.env'),
    'EMDASH_ENCRYPTION_KEY=k\nTRACY_CONTENT_API_RELAY_TOKEN_SHA256=stale\nHOST_PORT=1\n',
    {
      mode: 0o600
    }
  )
  return dir
}

test('generates a 0600 read token once, keeps it, and leaves .env untouched', (t) => {
  const dir = site(t)
  const envBefore = readFileSync(path.join(dir, '.env'), 'utf8')
  assert.equal(run(dir, '_emdash_prepare_content_token').status, 0)
  const file = path.join(dir, 'tracy-content.token')
  const token = readFileSync(file, 'utf8').trim()
  assert.match(token, /^ec_pat_[A-Za-z0-9_-]{43}$/)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(
    readFileSync(path.join(dir, '.env'), 'utf8'),
    envBefore,
    'the compose env is an exact custody form'
  )

  // A re-provision keeps the token (the site database holds its hash) in the same inode.
  const inode = statSync(file).ino
  assert.equal(run(dir, '_emdash_prepare_content_token').status, 0)
  assert.equal(readFileSync(file, 'utf8').trim(), token)
  assert.equal(statSync(file).ino, inode)
})
test('a malformed token file is replaced, and a directory in its place is refused', (t) => {
  const dir = site(t)
  writeFileSync(path.join(dir, 'tracy-content.token'), 'not-a-pat\n', { mode: 0o600 })
  assert.equal(run(dir, '_emdash_prepare_content_token').status, 0)
  assert.match(readFileSync(path.join(dir, 'tracy-content.token'), 'utf8'), /^ec_pat_/)

  const other = site(t)
  execFileSync('mkdir', [path.join(other, 'tracy-content.token')])
  assert.notEqual(run(other, '_emdash_prepare_content_token').status, 0)
})

test('digest helper gives the hex the reader checks and the base64url EmDash stores', (t) => {
  const dir = site(t)
  const token = 'ec_pat_' + 'x'.repeat(43)
  const out = run(
    dir,
    `printf '%s' ${token} | _emdash_digest hex; printf '%s' ${token} | _emdash_digest base64url`
  )
  assert.equal(out.status, 0)
  const sha = createHash('sha256').update(token)
  const [hex, b64] = out.stdout.trim().split('\n')
  assert.equal(hex, createHash('sha256').update(token).digest('hex'))
  assert.equal(b64, sha.digest('base64url'))
})
