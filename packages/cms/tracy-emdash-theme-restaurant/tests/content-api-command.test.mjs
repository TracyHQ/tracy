import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  NATIVE_PATH,
  RELAY_DIGEST_FILE,
  relayDigest,
  PRINCIPAL_HEADER,
  SCOPE_HEADER,
  commandOf,
  internalRequest,
  relayTrusted,
  requestAuthority
} from '../tools/content-api/command.mjs'

const relay = 'ec_pat_relayrelayrelayrelayrelay'
const env = { TRACY_CONTENT_API_RELAY_TOKEN_SHA256: createHash('sha256').update(relay).digest('hex') }
const principal = 'seat:' + 'a'.repeat(64)
const canonical = {
  action: 'content.read',
  params: { type: 'page', limit: 2 },
  contentPrincipal: principal,
  contentScope: 'published'
}
const status = (fn) => {
  try {
    fn()
  } catch (e) {
    return [e.status, e.code]
  }
  return null
}

test('canonical POST becomes an internal GET on the native reader with authority headers', () => {
  const caller = new Headers({
    authorization: 'Bearer ' + relay,
    'content-type': 'application/json',
    [PRINCIPAL_HEADER]: 'seat:' + 'b'.repeat(64),
    [SCOPE_HEADER]: 'editorial'
  })
  const r = internalRequest(new URL('https://site.example/content.json?type=post'), 'POST', caller, canonical)
  assert.equal(r.method, 'GET')
  const url = new URL(r.url)
  assert.equal(url.pathname, NATIVE_PATH)
  assert.deepEqual(Object.fromEntries(url.searchParams), { type: 'page', limit: '2' })
  assert.equal(r.headers.get(PRINCIPAL_HEADER), principal)
  assert.equal(r.headers.get(SCOPE_HEADER), 'published')
  assert.equal(r.headers.get('authorization'), 'Bearer ' + relay)
  assert.equal(r.headers.get('content-type'), null)
})

test('a GET keeps its query and never forwards caller authority headers', () => {
  const caller = new Headers({
    authorization: 'Bearer x',
    [PRINCIPAL_HEADER]: principal,
    [SCOPE_HEADER]: 'published'
  })
  const r = internalRequest(new URL('https://site.example/content.json?limit=1'), 'GET', caller)
  assert.equal(new URL(r.url).search, '?limit=1')
  assert.equal(r.headers.get(PRINCIPAL_HEADER), null)
  assert.equal(r.headers.get(SCOPE_HEADER), null)
  assert.deepEqual(
    status(() => internalRequest(new URL('https://s/content.json'), 'PUT', caller)),
    [405, 'CONTENT_BAD_QUERY']
  )
})

test('canonical body shape is strict', () => {
  for (const body of [
    null,
    [],
    { ...canonical, action: 'content.write' },
    { ...canonical, token: relay },
    { ...canonical, params: [] },
    { ...canonical, params: { id: { nested: 1 } } },
    { ...canonical, contentPrincipal: 'seat:xyz' },
    { ...canonical, contentScope: 'draft' },
    { action: 'content.read', params: {} }
  ])
    assert.deepEqual(
      status(() => commandOf(body)),
      [400, 'CONTENT_BAD_QUERY']
    )
  assert.deepEqual(commandOf(canonical).params, { type: 'page', limit: '2' })
})

test('authority headers count only for the relay PAT; editorial needs the probe switch', () => {
  const h = (auth, extra = {}) => new Headers({ authorization: auth, ...extra })
  assert.deepEqual(requestAuthority(h('Bearer anything'), env), {
    contentPrincipal: null,
    contentScope: 'published'
  })
  const claimed = { [PRINCIPAL_HEADER]: principal, [SCOPE_HEADER]: 'published' }
  assert.deepEqual(requestAuthority(h('Bearer ' + relay, claimed), env), {
    contentPrincipal: principal,
    contentScope: 'published'
  })
  assert.deepEqual(
    status(() => requestAuthority(h('Bearer ec_pat_other', claimed), env)),
    [403, 'CONTENT_FORBIDDEN']
  )
  assert.deepEqual(
    status(() => requestAuthority(h('Bearer ' + relay, claimed), {})),
    [403, 'CONTENT_FORBIDDEN']
  )
  assert.deepEqual(
    status(() => requestAuthority(h('Bearer ' + relay, { [SCOPE_HEADER]: 'published' }), env)),
    [400, 'CONTENT_BAD_QUERY']
  )
  const editorial = { ...claimed, [SCOPE_HEADER]: 'editorial' }
  assert.deepEqual(
    status(() => requestAuthority(h('Bearer ' + relay, editorial), env)),
    [403, 'CONTENT_FORBIDDEN']
  )
  assert.equal(
    requestAuthority(h('Bearer ' + relay, editorial), {
      ...env,
      TRACY_CONTENT_API_NATIVE_EDITORIAL_PROBE: '1'
    }).contentScope,
    'editorial'
  )
  assert.equal(relayTrusted('', env.TRACY_CONTENT_API_RELAY_TOKEN_SHA256), false)
  assert.equal(relayTrusted('Bearer ' + relay, 'not-a-hash'), false)
})

test('relay digest: environment first, else only a root-owned file nobody else can write', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'relay-digest-'))
  try {
    const me = { dir, ownerUid: process.getuid() }
    const file = path.join(dir, RELAY_DIGEST_FILE)
    assert.equal(relayDigest({}, me), null)
    writeFileSync(file, env.TRACY_CONTENT_API_RELAY_TOKEN_SHA256 + '\n', { mode: 0o644 })
    chmodSync(file, 0o644)
    assert.equal(relayDigest({}, me), env.TRACY_CONTENT_API_RELAY_TOKEN_SHA256)
    assert.equal(relayDigest({}, { dir, ownerUid: process.getuid() + 1 }), null, 'another owner')
    chmodSync(file, 0o664)
    assert.equal(relayDigest({}, me), null, 'group-writable')
    assert.equal(relayDigest({ TRACY_CONTENT_API_RELAY_TOKEN_SHA256: 'e'.repeat(64) }, me), 'e'.repeat(64))
    const claimed = new Headers({
      authorization: 'Bearer ' + relay,
      [PRINCIPAL_HEADER]: principal,
      [SCOPE_HEADER]: 'published'
    })
    chmodSync(file, 0o644)
    assert.equal(requestAuthority(claimed, {}, () => relayDigest({}, me)).contentPrincipal, principal)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('identity CLI: init stamps repeater rows; the guard-installing migrate command is gone', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const cli = fileURLToPath(new URL('../tools/content-api/identity-sqlite.mjs', import.meta.url))
  const dir = mkdtempSync(path.join(tmpdir(), 'content-identity-'))
  const file = path.join(dir, 'data.db')
  try {
    const db = new DatabaseSync(file)
    db.exec(
      `CREATE TABLE _emdash_collections(id TEXT,slug TEXT,supports TEXT);CREATE TABLE _emdash_fields(id TEXT,collection_id TEXT,slug TEXT,type TEXT);CREATE TABLE revisions(id TEXT,collection TEXT,entry_id TEXT,data TEXT);CREATE TABLE ec_site(id TEXT PRIMARY KEY,social TEXT);INSERT INTO _emdash_collections VALUES('c','site','[]');INSERT INTO _emdash_fields VALUES('f','c','social','repeater');INSERT INTO ec_site VALUES('s','[{"name":"x"}]');`
    )
    db.close()
    const run = (...args) =>
      spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    assert.notEqual(run('migrate', file).status, 0)
    const ok = run('init', file)
    assert.equal(ok.status, 0, ok.stderr)
    assert.deepEqual(JSON.parse(ok.stdout).fields, ['site.social'])
    const check = new DatabaseSync(file)
    assert.match(
      JSON.parse(check.prepare('SELECT social FROM ec_site').get().social)[0]._rowId,
      /^[0-9a-f-]{36}$/
    )
    check.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
