#!/usr/bin/env node
/**
 * The READ-ONLY EmDash token-rollout inventory (#155, ahead of PR #162):
 * `scripts/provision/emdash/inventory.mjs`. What is pinned here is the contract that makes this safe
 * to run on the live dev fleet before any apply:
 *
 *   - NO WRITE / NO TOKEN READ: every docker argv is `ps`/`inspect`/read-only `exec`; the REAL DB
 *     reader (its exact production node argv + stdin) opens `readOnly: true` and leaves the file's
 *     mtime untouched; the token file's bytes are never opened (custody is `lstat`-only).
 *   - EXACT ATTRIBUTION: a container is tied to its site by Compose labels + the `/app/data` bind
 *     source BEFORE any exec, a duplicated web service is `ambiguous-container`, and a mismatch
 *     blocks the read — the wrong site's DB is never attributed.
 *   - EXACT custody: a regular root:0600 host file AND a read-only bind at the fixed container path
 *     whose source is that same file — anything else is reported by name.
 *   - POSITIVE classification: EmDash is identified by image/`data.db`, never by the label text or
 *     port 4321 alone; PHP-with-EmDash-signals is `ambiguous`, no signal is `unknown`.
 *   - BOUNDED / SANITIZED: a timeout, a non-zero transport, or a docker/db error is a fixed enum and
 *     counts are bounded non-negative integers; the selector is `sha256(label)`, never the label.
 *   - GATE: custody and DB readability are reported separately; no single "ready to deploy" verdict.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-inventory.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CONTAINER_DATA_PATH,
  CONTAINER_TOKEN_PATH,
  DB_INVENTORY_SCRIPT,
  FULL_ID,
  HOST_EXEC_TIMEOUT_MS,
  HOST_PROJECT,
  HOST_SERVICE,
  RUN_TIMEOUT_MS,
  aggregate,
  classify,
  dbArgv,
  evaluateComposeIdentity,
  evaluateDataSource,
  evaluateHostFile,
  evaluateHostLabels,
  evaluateHostRootBind,
  evaluateMount,
  execHostArgv,
  exposes4321,
  groupByLabel,
  hostDataDir,
  hostTokenPath,
  imageClass,
  inspectArgv,
  inspectHostArgv,
  legacyProbeArgv,
  normalizeRoot,
  parseDbResult,
  parseHostInspect,
  parseHostPs,
  parseInnerReport,
  parseInspect,
  parseLegacy,
  parsePs,
  privateRootFromEnv,
  psArgv,
  psHostArgv,
  runHostInventory,
  runInventory,
  sanitizeDbReason,
  sanitizeDbResult,
  sanitizeHostReason,
  selectorFor,
  siteDir
} from '../scripts/provision/emdash/inventory.mjs'
import { renderInspectFormat } from './docker-inspect-format.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/provision/emdash/inventory.mjs', import.meta.url))

// ── selector: opaque, never the label ─────────────────────────────────────────────────────────

test('selectorFor is sha256(label), full or truncated, and never the label itself', () => {
  const full = selectorFor('example-com-0871462c')
  assert.match(full, /^[0-9a-f]{64}$/)
  assert.doesNotMatch(full, /example|com/)
  assert.equal(selectorFor('example-com-0871462c', { truncate: true }), full.slice(0, 32))
})

// ── enumeration: by compose service label, unique-per-project ─────────────────────────────────

test('psArgv filters by the compose service label, not by name', () => {
  const argv = psArgv()
  assert.ok(argv.includes('label=com.docker.compose.service=web'))
  assert.equal(argv.at(-1), '{{.ID}}\t{{.Label "com.docker.compose.project"}}\t{{.Image}}\t{{.Names}}')
})

test('parsePs keeps valid-project rows and counts bad-project rows as skipped, never merged', () => {
  const { rows, skipped } = parsePs(
    [
      'id1\tdemo\ttracy/emdash:1\tdemo-web-1',
      'id2\t../evil\tx\trenamed', // bad project — skipped, not walked into a path
      'id0\t\ttracy/x\tn', // empty project — skipped
      '', // a blank line is not a row at all and is not counted as skipped
      'id3\tshop\tjoomla:5\tshop-web-1'
    ].join('\n')
  )
  assert.deepEqual(
    rows.map((r) => r.label),
    ['demo', 'shop']
  )
  assert.equal(skipped, 2)
})

test('groupByLabel reports a duplicated web service as ambiguous rather than picking one', () => {
  const { unique, duplicate } = groupByLabel([
    { id: 'a1', label: 'demo', image: 'tracy/emdash:1', name: 'demo-web-1' },
    { id: 'a2', label: 'demo', image: 'tracy/emdash:1', name: 'demo-web-1-renamed' },
    { id: 'b1', label: 'solo', image: 'tracy/emdash:1', name: 'solo-web-1' }
  ])
  assert.equal(unique.has('solo'), true)
  assert.equal(unique.has('demo'), false)
  assert.deepEqual([...duplicate], ['demo'])
})

// ── argv builders: read-only, no shell interpolation of untrusted values ──────────────────────

test('inspectArgv asks for minimal fields as one-per-line JSON', () => {
  const argv = inspectArgv('deadbeef')
  assert.equal(argv[0], 'inspect')
  assert.equal(argv.at(-1), 'deadbeef')
  assert.match(argv[2], /\.Config\.Labels/)
  assert.match(argv[2], /\.Mounts/)
  assert.equal(argv[2].split('\n').length, 6)
})

test('the DB read runs as www-data, on stdin, never as root', () => {
  assert.deepEqual(dbArgv('deadbeef'), [
    'exec',
    '-i',
    '-u',
    'www-data',
    'deadbeef',
    'node',
    '--input-type=module',
    '-',
    '/app/data/data.db'
  ])
})

test('the legacy probe is a presence-only check as www-data, never a read of contents', () => {
  const argv = legacyProbeArgv('deadbeef')
  assert.deepEqual(argv.slice(0, 5), ['exec', '-u', 'www-data', 'deadbeef', 'sh'])
  assert.match(argv.at(-1), /present-symlink/)
  assert.doesNotMatch(argv.at(-1), /cat|read|head|tail/)
})

test('parseLegacy maps only the three fixed tokens, else unknown', () => {
  assert.equal(parseLegacy('present\n'), 'present')
  assert.equal(parseLegacy('present-symlink'), 'present-symlink')
  assert.equal(parseLegacy('absent'), 'absent')
  assert.equal(parseLegacy('something/else'), 'unknown')
})

// ── classification: positive, and refuses to guess ────────────────────────────────────────────

test('imageClass reads the fleet tag conventions', () => {
  assert.equal(imageClass('tracy/emdash:0.34.0'), 'emdash')
  assert.equal(imageClass('tracy/web-emdash:1'), 'emdash')
  assert.equal(imageClass('tracy/tracy-business-emdash:0.10.0'), 'emdash')
  assert.equal(imageClass('tracy/web-joomla:5'), 'php')
  assert.equal(imageClass('wordpress:6'), 'php')
  assert.equal(imageClass('mariadb:11'), 'unknown')
})

test('classify is positive; label text and port 4321 alone are not identity', () => {
  // A label full of "emdash" but a Joomla image + no data.db is NOT emdash.
  assert.equal(classify({ image: 'tracy/web-joomla:5' }), 'not-emdash')
  assert.equal(classify({ image: 'tracy/emdash:1' }), 'emdash')
  assert.equal(classify({ hasDataDb: true }), 'emdash')
  // conflicting signals: reported, not resolved.
  assert.equal(classify({ image: 'tracy/web-joomla:5', hasDataDb: true }), 'ambiguous')
  // nothing: honest unknown.
  assert.equal(classify({ image: 'mariadb:11' }), 'unknown')
})

test('exposes4321 reads ExposedPorts keys only (informational)', () => {
  assert.equal(exposes4321({ '4321/tcp': {} }), true)
  assert.equal(exposes4321({ '80/tcp': {} }), false)
  assert.equal(exposes4321(null), false)
})

// ── compose identity + data source: exact attribution before any exec ─────────────────────────

const ROOT = '/srv/tracy'
function composeLabels(label, over = {}) {
  return {
    'com.docker.compose.project': label,
    'com.docker.compose.service': 'web',
    'com.docker.compose.project.working_dir': siteDir(ROOT, label),
    'com.docker.compose.project.config_files': `${siteDir(ROOT, label)}/docker-compose.yml`,
    ...over
  }
}

test('evaluateComposeIdentity ties a container to its own site, or names the mismatch', () => {
  assert.equal(evaluateComposeIdentity(composeLabels('demo'), 'demo', ROOT), 'ok')
  assert.equal(
    evaluateComposeIdentity(composeLabels('demo', { 'com.docker.compose.project': 'other' }), 'demo', ROOT),
    'project-mismatch'
  )
  assert.equal(
    evaluateComposeIdentity(composeLabels('demo', { 'com.docker.compose.service': 'db' }), 'demo', ROOT),
    'service-mismatch'
  )
  assert.equal(
    evaluateComposeIdentity(
      composeLabels('demo', { 'com.docker.compose.project.working_dir': '/tmp/x' }),
      'demo',
      ROOT
    ),
    'workdir-mismatch'
  )
  assert.equal(
    evaluateComposeIdentity(
      composeLabels('demo', { 'com.docker.compose.project.config_files': '/tmp/evil/docker-compose.yml' }),
      'demo',
      ROOT
    ),
    'configfiles-mismatch'
  )
})

test('evaluateComposeIdentity requires EXACTLY the canonical compose file — no dotdot, no extras', () => {
  const cfg = (v) =>
    evaluateComposeIdentity(
      composeLabels('demo', { 'com.docker.compose.project.config_files': v }),
      'demo',
      ROOT
    )
  // a `..` that textually starts under the site dir but escapes it
  assert.equal(cfg(`${siteDir(ROOT, 'demo')}/../../other/docker-compose.yml`), 'configfiles-mismatch')
  // an extra (foreign or override) file merged in alongside the canonical one
  assert.equal(
    cfg(`${siteDir(ROOT, 'demo')}/docker-compose.yml,${siteDir(ROOT, 'demo')}/override.yml`),
    'configfiles-mismatch'
  )
  // the wrong filename under the right dir
  assert.equal(cfg(`${siteDir(ROOT, 'demo')}/compose.yml`), 'configfiles-mismatch')
  // exactly the renderer's own path is accepted
  assert.equal(cfg(`${siteDir(ROOT, 'demo')}/docker-compose.yml`), 'ok')
})

test('evaluateDataSource requires /app/data to bind THIS site data dir', () => {
  const src = hostDataDir(ROOT, 'demo')
  assert.equal(
    evaluateDataSource([{ Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: src }], src),
    'ok'
  )
  assert.equal(evaluateDataSource([], src), 'missing')
  assert.equal(
    evaluateDataSource([{ Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: '/tmp/other/data' }], src),
    'source-mismatch'
  )
  assert.equal(
    evaluateDataSource([{ Type: 'volume', Destination: CONTAINER_DATA_PATH, Source: src }], src),
    'not-bind'
  )
})

// ── custody: lstat + mount only, exact ─────────────────────────────────────────────────────────

test('evaluateHostFile requires a regular root:0600 file, and separates a stat error from missing', () => {
  assert.equal(evaluateHostFile({ exists: false }), 'missing')
  assert.equal(evaluateHostFile({ error: true }), 'stat-error') // e.g. EACCES, not "missing"
  assert.equal(evaluateHostFile({ exists: true, isSymbolicLink: true }), 'symlink')
  assert.equal(evaluateHostFile({ exists: true, isFile: false }), 'not-regular')
  assert.equal(evaluateHostFile({ exists: true, isFile: true, uid: 33, mode: 0o600 }), 'bad-owner')
  assert.equal(evaluateHostFile({ exists: true, isFile: true, uid: 0, mode: 0o644 }), 'bad-mode')
  assert.equal(evaluateHostFile({ exists: true, isFile: true, uid: 0, mode: 0o600 }), 'ok')
})

test('evaluateMount requires a read-only bind at the fixed path from the exact host source', () => {
  const src = hostTokenPath(ROOT, 'demo')
  const ok = [{ Type: 'bind', Destination: CONTAINER_TOKEN_PATH, Source: src, RW: false }]
  assert.equal(evaluateMount(ok, src), 'ok')
  assert.equal(evaluateMount([], src), 'missing')
  assert.equal(
    evaluateMount([{ Type: 'bind', Destination: CONTAINER_TOKEN_PATH, Source: src, RW: true }], src),
    'not-readonly'
  )
  assert.equal(
    evaluateMount([{ Type: 'bind', Destination: CONTAINER_TOKEN_PATH, Source: '/tmp/x', RW: false }], src),
    'source-mismatch'
  )
})

test('parseInspect tolerates a malformed line without throwing', () => {
  const ins = parseInspect(
    ['"tracy/emdash:1"', 'true', 'null', '{}', 'not json', '{"4321/tcp":{}}'].join('\n')
  )
  assert.equal(ins.image, 'tracy/emdash:1')
  assert.equal(ins.running, true)
  assert.deepEqual(ins.mounts, []) // the malformed line collapses to []
  assert.equal(exposes4321(ins.exposed), true)
})

// ── sanitization: no arbitrary field reaches the shared log ───────────────────────────────────

test('parseDbResult and sanitizeDbReason keep only fixed reasons', () => {
  assert.deepEqual(parseDbResult('TRACY_EMDASH_DB_ERR open-failed'), { ok: false, reason: 'open-failed' })
  assert.deepEqual(parseDbResult(''), { ok: false, reason: 'no-output' })
  assert.equal(sanitizeDbReason('open-failed'), 'open-failed')
  assert.equal(sanitizeDbReason('/srv/tracy/demo leaked a path'), 'read-failed')
})

test('sanitizeDbResult validates the agent enum and bounds the counts', () => {
  // a malicious/garbled agent field and an out-of-range / non-integer count are neutralised.
  const clean = sanitizeDbResult({
    ok: true,
    schema: 'ok',
    agent: 'DROP TABLE users',
    canonicalTokens: -5,
    recoveryTokens: 1.5,
    canonicalExpired: 3,
    canonicalNoExpiry: 9_999_999_999
  })
  assert.equal(clean.status, 'readable')
  assert.equal(clean.agent, 'unknown')
  assert.equal(clean.canonicalTokens, null)
  assert.equal(clean.recoveryTokens, null)
  assert.equal(clean.canonicalExpired, 3)
  assert.equal(clean.canonicalNoExpiry, null)
  assert.deepEqual(sanitizeDbResult({ ok: true, schema: 'incomplete' }), { status: 'schema-incomplete' })
  assert.deepEqual(sanitizeDbResult({ ok: false, reason: 'boom' }), {
    status: 'error',
    reason: 'read-failed'
  })
})

// ── the REAL in-container DB reader: EXACT production node argv + stdin, real SQLite file ──────

/**
 * Run DB_INVENTORY_SCRIPT with the EXACT node arguments the production `dbArgv` passes after
 * `docker exec … node`, only swapping the in-container db path for the temp file. This is what the
 * container runs, so a `require`-vs-module regression (the interim review's finding #1) would fail
 * HERE, not pass a mocked JSON string.
 */
function runDbScript(dbPath) {
  const argv = dbArgv('x')
  const nodeArgs = argv.slice(argv.indexOf('node') + 1) // ['--input-type=module','-','/app/data/data.db']
  const finalArgs = [...nodeArgs.slice(0, -1), dbPath]
  const res = spawnSync(process.execPath, finalArgs, { input: DB_INVENTORY_SCRIPT, encoding: 'utf8' })
  return { out: String(res.stdout ?? ''), err: String(res.stderr ?? ''), status: res.status }
}

function seedDb(t, seed) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-inv-db-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dbPath = path.join(dir, 'data.db')
  const db = new DatabaseSync(dbPath)
  seed(db)
  db.close()
  return dbPath
}

function fullSchema(db) {
  db.exec('CREATE TABLE users (id TEXT, email TEXT, role INTEGER, disabled INTEGER)')
  db.exec(
    'CREATE TABLE _emdash_api_tokens (id TEXT, name TEXT, token_hash TEXT, prefix TEXT, user_id TEXT, scopes TEXT, expires_at TEXT, last_used_at TEXT, created_at TEXT)'
  )
}

test('DB reader (exact production argv) does NOT return no-sqlite, and does NOT write the file', (t) => {
  const dbPath = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('u1','tracy-agent@tracy.ai',50,0)")
    db.exec(
      "INSERT INTO _emdash_api_tokens (id,name,user_id,expires_at) VALUES ('t1','tracy-agent','u1',NULL)"
    )
    db.exec(
      "INSERT INTO _emdash_api_tokens (id,name,user_id,expires_at) VALUES ('t2','tracy-agent.recovery.abc','u1',NULL)"
    )
  })
  const before = statSync(dbPath).mtimeMs
  const { out } = runDbScript(dbPath)
  assert.doesNotMatch(out, /no-sqlite/, 'the module-mode reader fell back to require and reported no-sqlite')
  const parsed = parseDbResult(out)
  assert.deepEqual(parsed, {
    ok: true,
    schema: 'ok',
    agent: 'active-unique',
    canonicalTokens: 1,
    recoveryTokens: 1,
    canonicalExpired: 0,
    canonicalNoExpiry: 1
  })
  assert.equal(statSync(dbPath).mtimeMs, before, 'the DB reader modified the database')
})

test('DB reader counts an expired canonical token as expired', (t) => {
  const dbPath = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('u1','tracy-agent@tracy.ai',50,0)")
    db.exec(
      "INSERT INTO _emdash_api_tokens (id,name,user_id,expires_at) VALUES ('t1','tracy-agent','u1','2000-01-01T00:00:00.000Z')"
    )
  })
  const parsed = parseDbResult(runDbScript(dbPath).out)
  assert.equal(parsed.canonicalExpired, 1)
  assert.equal(parsed.canonicalNoExpiry, 0)
})

test('DB reader surfaces a duplicate / disabled / non-admin fixed agent, never conceals it', (t) => {
  // two rows for the fixed email — one a disabled admin — must read as ambiguous, not active-unique.
  const dup = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('u1','tracy-agent@tracy.ai',50,0)")
    db.exec("INSERT INTO users VALUES ('u2','tracy-agent@tracy.ai',50,1)")
  })
  assert.equal(parseDbResult(runDbScript(dup).out).agent, 'ambiguous')

  const disabled = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('u1','tracy-agent@tracy.ai',50,1)")
    db.exec(
      "INSERT INTO _emdash_api_tokens (id,name,user_id,expires_at) VALUES ('t1','tracy-agent','u1',NULL)"
    )
  })
  const dr = parseDbResult(runDbScript(disabled).out)
  assert.equal(dr.agent, 'disabled')
  assert.equal(dr.canonicalTokens, 0)

  const nonAdmin = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('u1','tracy-agent@tracy.ai',10,0)")
  })
  assert.equal(parseDbResult(runDbScript(nonAdmin).out).agent, 'not-admin')
})

test('DB reader never emits a raw id, email, or hash', (t) => {
  const dbPath = seedDb(t, (db) => {
    fullSchema(db)
    db.exec("INSERT INTO users VALUES ('secret-uid','tracy-agent@tracy.ai',50,0)")
    db.exec(
      "INSERT INTO _emdash_api_tokens (id,name,token_hash,user_id,expires_at) VALUES ('tid','tracy-agent','SECRETHASH','secret-uid',NULL)"
    )
  })
  const { out } = runDbScript(dbPath)
  assert.doesNotMatch(out, /secret-uid|SECRETHASH|tracy-agent@tracy\.ai/)
})

test('DB reader reports schema-incomplete for a database without the tables', (t) => {
  const dbPath = seedDb(t, (db) => db.exec('CREATE TABLE other (x INTEGER)'))
  assert.deepEqual(parseDbResult(runDbScript(dbPath).out), { ok: true, schema: 'incomplete' })
})

test('DB reader fails closed on a path that is not a database (a fixed reason, not read-failed)', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-inv-nodb-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const notDb = path.join(dir, 'nope.db')
  writeFileSync(notDb, 'this is not sqlite')
  const parsed = parseDbResult(runDbScript(notDb).out)
  assert.equal(parsed.ok, false)
  // SQLite opens lazily, so a non-database file surfaces on the first PRAGMA as `query-failed`, not
  // at open. Either fixed reason is honest and neither infers readiness — the contract is that it is
  // a KNOWN reason (never the catch-all `read-failed`) and the reader reports failure, not `ready`.
  assert.ok(['open-failed', 'query-failed'].includes(parsed.reason), parsed.reason)
  assert.notEqual(sanitizeDbReason(parsed.reason), 'read-failed')
})

// ── orchestration through injected run + fs ────────────────────────────────────────────────────

function fakeRun(handlers) {
  const calls = []
  const run = async ({ argv, stdin }) => {
    calls.push({ argv: [...argv], stdin })
    for (const h of handlers) {
      const r = h(argv, stdin)
      if (r) return { code: 0, stdout: '', stderr: '', timedOut: false, ...r }
    }
    return { code: 0, stdout: '', stderr: '', timedOut: false }
  }
  run.calls = calls
  return run
}

/** A one-line ps row and a matching inspect for a healthy EmDash site with correct everything. */
function emdashInspect(label, over = {}) {
  const tokenSrc = hostTokenPath(ROOT, label)
  const dataSrc = hostDataDir(ROOT, label)
  const defaults = {
    image: '"tracy/emdash:1"',
    running: 'true',
    health: '{"Status":"healthy"}',
    labels: JSON.stringify(composeLabels(label)),
    mounts: JSON.stringify([
      { Type: 'bind', Destination: CONTAINER_TOKEN_PATH, Source: tokenSrc, RW: false },
      { Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: dataSrc }
    ]),
    exposed: '{"4321/tcp":{}}'
  }
  const f = { ...defaults, ...over }
  return [f.image, f.running, f.health, f.labels, f.mounts, f.exposed].join('\n')
}

function fsWith(map) {
  return {
    lstat(p) {
      for (const [label, spec] of Object.entries(map)) {
        if (label === '_root' || label === '_dirs') continue
        if (p === siteDir(ROOT, label))
          return { exists: true, isSymbolicLink: Boolean(spec.dirSymlink), isDirectory: true }
        if (p === hostTokenPath(ROOT, label)) {
          if (spec.tokenError) return { error: true }
          if (!spec.token) return { exists: false }
          return {
            exists: true,
            isSymbolicLink: Boolean(spec.token.symlink),
            isFile: spec.token.file !== false,
            uid: spec.token.uid ?? 0,
            mode: spec.token.mode ?? 0o600
          }
        }
        if (p === `${ROOT}/${label}/data/data.db`) return { exists: Boolean(spec.dataDb), isFile: true }
      }
      if (p === ROOT) return map._root ?? { exists: true, isSymbolicLink: false, isDirectory: true }
      return { exists: false }
    },
    readdir(p) {
      if (p !== ROOT) return null
      return map._dirs ?? []
    }
  }
}

test('a running EmDash site with correct everything reports ok — custody and db kept separate', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tdemo\ttracy/emdash:1\tdemo-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? { stdout: emdashInspect('demo') } : null),
    (argv) => (argv.includes('sh') ? { stdout: 'absent\n' } : null),
    (argv, stdin) =>
      stdin === DB_INVENTORY_SCRIPT
        ? {
            stdout:
              'TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique","canonicalTokens":1,"recoveryTokens":0,"canonicalExpired":0,"canonicalNoExpiry":1}\n'
          }
        : null
  ])
  const fs = fsWith({ demo: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['demo'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })

  assert.equal(report.readOnly, true)
  assert.equal(report.rootEnumerated, true)
  const s = report.sites[0]
  assert.equal(s.classification, 'emdash')
  assert.equal(s.compose, 'ok')
  assert.equal(s.dataSource, 'ok')
  assert.equal(s.custody.hostFile, 'ok')
  assert.equal(s.custody.mount, 'ok')
  assert.equal(s.legacy, 'absent')
  assert.equal(s.db.status, 'readable')
  assert.equal(s.db.agent, 'active-unique')
  assert.equal(report.aggregate.emdashCustodyReady, 1)
  assert.equal(report.aggregate.emdashDbIdentityReadable, 1)
  assert.match(report.note, /neither proves/)
  assert.equal(s.selector, selectorFor('demo'))
  assert.doesNotMatch(JSON.stringify(report), /\bdemo\b/)
})

test('an EmDash web container with NO healthcheck is inspected, not inspect-failed', async () => {
  // The fake renders the format the inventory sent like the Docker CLI 27.5.1 inside tracy-host:
  // on a container whose image declares no healthcheck, any field access to `.State.Health` (the
  // #306 `if` guard included) fails the whole inspect (measured on dev, 24/09/2026).
  assert.equal(
    renderInspectFormat('{{if .State.Health}}{{json .State.Health}}{{else}}null{{end}}', {
      State: { Running: true }
    }).code,
    1
  )
  assert.doesNotMatch(inspectArgv('x')[2], /\.State\.Health/)
  const label = 'demo'
  const inspect = {
    Config: {
      Image: 'tracy/emdash:1',
      Labels: composeLabels(label),
      ExposedPorts: { '4321/tcp': {} }
    },
    State: { Running: true },
    Mounts: [
      { Type: 'bind', Destination: CONTAINER_TOKEN_PATH, Source: hostTokenPath(ROOT, label), RW: false },
      { Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: hostDataDir(ROOT, label) }
    ]
  }
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tdemo\ttracy/emdash:1\tdemo-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? renderInspectFormat(argv[2], inspect) : null),
    (argv) => (argv.includes('sh') ? { stdout: 'absent\n' } : null),
    (argv, stdin) =>
      stdin === DB_INVENTORY_SCRIPT
        ? {
            stdout:
              'TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique","canonicalTokens":1,"recoveryTokens":0,"canonicalExpired":0,"canonicalNoExpiry":1}\n'
          }
        : null
  ])
  const fs = fsWith({ demo: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['demo'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.status, 'ok', JSON.stringify(s))
  assert.equal(s.classification, 'emdash')
  assert.deepEqual(s.web, { running: true, health: 'none', exposes4321: true })
  assert.equal(s.custody.mount, 'ok')
  assert.equal(s.db.status, 'readable')
  assert.equal(parseInspect(renderInspectFormat(inspectArgv('x')[2], inspect).stdout).health, null)
  // With a healthcheck, the same template carries the Health object through to the parser.
  const withHealth = { ...inspect, State: { Running: true, Health: { Status: 'unhealthy' } } }
  const rendered = renderInspectFormat(inspectArgv('x')[2], withHealth)
  assert.equal(rendered.code, 0, rendered.stderr)
  assert.deepEqual(parseInspect(rendered.stdout).health, { Status: 'unhealthy' })
})

test('a container whose compose identity does not match its site is NOT read', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tdemo\ttracy/emdash:1\tdemo-web-1\n' } : null),
    (argv) =>
      argv[0] === 'inspect'
        ? {
            stdout: emdashInspect('demo', {
              labels: JSON.stringify(
                composeLabels('demo', { 'com.docker.compose.project.working_dir': '/tmp/evil' })
              )
            })
          }
        : null
  ])
  const fs = fsWith({ demo: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['demo'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.compose, 'workdir-mismatch')
  assert.equal(s.db.status, 'blocked')
  assert.equal(
    run.calls.some((c) => c.argv.includes('www-data')),
    false,
    'no exec ran against a container that could not be tied to its site'
  )
})

test('a container whose /app/data binds another site is NOT read (no misattribution)', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tdemo\ttracy/emdash:1\tdemo-web-1\n' } : null),
    (argv) =>
      argv[0] === 'inspect'
        ? {
            stdout: emdashInspect('demo', {
              mounts: JSON.stringify([
                {
                  Type: 'bind',
                  Destination: CONTAINER_TOKEN_PATH,
                  Source: hostTokenPath(ROOT, 'demo'),
                  RW: false
                },
                { Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: '/srv/tracy/other/data' }
              ])
            })
          }
        : null
  ])
  const fs = fsWith({ demo: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['demo'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.sites[0].dataSource, 'source-mismatch')
  assert.equal(report.sites[0].db.status, 'blocked')
})

test('a duplicated web service is reported ambiguous-container, never picked and read', async () => {
  const run = fakeRun([
    (argv) =>
      argv[0] === 'ps'
        ? { stdout: 'cid1\tdemo\ttracy/emdash:1\tdemo-web-1\ncid2\tdemo\ttracy/emdash:1\tdemo-web-1b\n' }
        : null
  ])
  const fs = fsWith({ demo: { dataDb: true }, _dirs: ['demo'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.sites[0].status, 'ambiguous-container')
  assert.equal(
    run.calls.some((c) => c.argv[0] === 'inspect'),
    false
  )
})

test('a non-EmDash (Joomla) running site is classified not-emdash and never DB-probed', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tshop\ttracy/web-joomla:5\tshop-web-1\n' } : null),
    (argv) =>
      argv[0] === 'inspect'
        ? {
            stdout: emdashInspect('shop', {
              image: '"tracy/web-joomla:5"',
              mounts: '[]',
              exposed: '{"80/tcp":{}}'
            })
          }
        : null
  ])
  const fs = fsWith({ shop: {}, _dirs: ['shop'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.sites[0].classification, 'not-emdash')
  assert.equal(report.sites[0].db.status, 'blocked')
  assert.equal(
    run.calls.some((c) => c.argv.includes('www-data')),
    false
  )
})

test('a site folder with no running container is enumerated honestly, not skipped', async () => {
  const run = fakeRun([(argv) => (argv[0] === 'ps' ? { stdout: '' } : null)])
  const fs = fsWith({ idle: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['idle'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.classification, 'emdash') // from data.db on disk
  assert.equal(s.web.running, false)
  assert.equal(s.custody.hostFile, 'ok') // custody is still lstat-checkable
  assert.equal(s.custody.mount, 'unknown') // but a stopped container cannot be spoken for
  assert.equal(s.db.status, 'unknown')
})

test('a symlinked site directory fails closed — no exec, custody unsafe-path', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\ttrap\ttracy/emdash:1\ttrap-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? { stdout: emdashInspect('trap') } : null)
  ])
  const fs = fsWith({ trap: { dirSymlink: true, token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: [] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.custody.hostFile, 'unsafe-path')
  assert.equal(s.custody.mount, 'unsafe-path')
  assert.equal(s.db.status, 'blocked')
  assert.equal(
    run.calls.some((c) => c.argv.includes('www-data')),
    false
  )
})

test('a permission error on the token stat is stat-error, not missing', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tp\ttracy/emdash:1\tp-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? { stdout: emdashInspect('p') } : null),
    (argv) => (argv.includes('sh') ? { stdout: 'absent\n' } : null),
    (_argv, stdin) =>
      stdin === DB_INVENTORY_SCRIPT
        ? { stdout: 'TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique"}\n' }
        : null
  ])
  const fs = fsWith({ p: { tokenError: true, dataDb: true }, _dirs: ['p'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.sites[0].custody.hostFile, 'stat-error')
})

test('bad custody (writable mount) and a legacy copy are reported by name', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tbad\ttracy/emdash:1\tbad-web-1\n' } : null),
    (argv) =>
      argv[0] === 'inspect'
        ? {
            stdout: emdashInspect('bad', {
              mounts: JSON.stringify([
                {
                  Type: 'bind',
                  Destination: CONTAINER_TOKEN_PATH,
                  Source: hostTokenPath(ROOT, 'bad'),
                  RW: true
                },
                { Type: 'bind', Destination: CONTAINER_DATA_PATH, Source: hostDataDir(ROOT, 'bad') }
              ])
            })
          }
        : null,
    (argv) => (argv.includes('sh') ? { stdout: 'present\n' } : null),
    (_argv, stdin) => (stdin === DB_INVENTORY_SCRIPT ? { stdout: 'TRACY_EMDASH_DB_ERR open-failed\n' } : null)
  ])
  const fs = fsWith({ bad: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['bad'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.custody.mount, 'not-readonly')
  assert.equal(s.legacy, 'present')
  assert.equal(s.db.status, 'error')
  assert.equal(s.db.reason, 'open-failed')
})

test('a non-zero DB transport is an error even if stdout looks valid', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tz\ttracy/emdash:1\tz-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? { stdout: emdashInspect('z') } : null),
    (argv) => (argv.includes('sh') ? { stdout: 'absent\n' } : null),
    (_argv, stdin) =>
      stdin === DB_INVENTORY_SCRIPT
        ? { code: 137, stdout: 'TRACY_EMDASH_DB {"schema":"ok","agent":"active-unique"}\n' }
        : null
  ])
  const fs = fsWith({ z: { token: { uid: 0, mode: 0o600 }, dataDb: true }, _dirs: ['z'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.sites[0].db.status, 'error')
  assert.equal(report.sites[0].db.reason, 'transport')
})

test('a docker inspect timeout is a fixed sanitized reason, not a raw error, and does not abort', async () => {
  const run = fakeRun([
    (argv) =>
      argv[0] === 'ps'
        ? { stdout: 'a1\ta\ttracy/emdash:1\ta-web-1\nb1\tb\ttracy/emdash:1\tb-web-1\n' }
        : null,
    (argv) =>
      argv[0] === 'inspect' && argv.at(-1) === 'a1'
        ? { code: null, stdout: '', stderr: '/srv/tracy/a secret path', timedOut: true }
        : null,
    (argv) => (argv[0] === 'inspect' && argv.at(-1) === 'b1' ? { stdout: emdashInspect('b') } : null),
    (argv) => (argv.includes('sh') ? { stdout: 'absent\n' } : null),
    (_argv, stdin) =>
      stdin === DB_INVENTORY_SCRIPT ? { stdout: 'TRACY_EMDASH_DB {"schema":"ok","agent":"missing"}\n' } : null
  ])
  const fs = fsWith({
    a: { dataDb: true },
    b: { token: { uid: 0, mode: 0o600 }, dataDb: true },
    _dirs: ['a', 'b']
  })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const a = report.sites.find((s) => s.selector === selectorFor('a'))
  assert.equal(a.status, 'error')
  assert.equal(a.reason, 'inspect-timeout')
  assert.doesNotMatch(JSON.stringify(report), /secret path/)
  assert.equal(report.sites.length, 2)
})

test('a totally failed ps is reported (containersEnumerated:false) without inventing readiness', async () => {
  const run = fakeRun([(argv) => (argv[0] === 'ps' ? { code: 1, stderr: 'boom' } : null)])
  const fs = fsWith({ x: { dataDb: true }, _dirs: ['x'] })
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  assert.equal(report.containersEnumerated, false)
  assert.equal(report.sites[0].web.running, false)
})

// A private root that is unsafe (symlink / missing / non-directory / stat-error) must fail closed
// BEFORE any per-site filesystem read or container exec. This fs throws on ANY descendant lstat and
// on readdir, and the run throws on anything but `docker ps`, so the test would fail if the roll-call
// touched a site path or ran an exec after seeing an unsafe root.
function strictUnsafeRootFs(rootStat) {
  return {
    lstat(p) {
      if (p === ROOT) return rootStat
      throw new Error(`descendant lstat must not run after an unsafe root: ${p}`)
    },
    readdir() {
      throw new Error('readdir must not run on an unsafe root')
    }
  }
}
function psOnlyRun(psStdout) {
  return fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: psStdout } : null),
    (argv) => {
      throw new Error(`no docker call but ps may run after an unsafe root: ${argv[0]}`)
    }
  ])
}

for (const [name, rootStat] of [
  ['symlink', { exists: true, isSymbolicLink: true, isDirectory: true }],
  ['missing', { exists: false }],
  ['non-directory', { exists: true, isSymbolicLink: false, isDirectory: false }],
  ['stat-error', { error: true }]
]) {
  test(`an unsafe private root (${name}) fails closed — no descendant read or exec`, async () => {
    // containers are still NAMED from ps (touches no host path), but each is root-unsafe and unread.
    const run = psOnlyRun('cid1\tdemo\ttracy/emdash:1\tdemo-web-1\n')
    const report = await runInventory({ privateRoot: ROOT, run, fs: strictUnsafeRootFs(rootStat) })
    assert.equal(report.rootEnumerated, false)
    assert.equal(report.sites.length, 1)
    assert.equal(report.sites[0].status, 'root-unsafe')
    assert.equal(report.sites[0].selector, selectorFor('demo'))
    // nothing beyond ps ran.
    assert.equal(
      run.calls.every((c) => c.argv[0] === 'ps'),
      true
    )
    assert.doesNotMatch(JSON.stringify(report), /\bdemo\b/)
  })
}

test('a per-site directory EACCES fails closed — token/db not traversed, no exec', async () => {
  const run = fakeRun([
    (argv) => (argv[0] === 'ps' ? { stdout: 'cid1\tlocked\ttracy/emdash:1\tlocked-web-1\n' } : null),
    (argv) => (argv[0] === 'inspect' ? { stdout: emdashInspect('locked') } : null),
    (argv) => {
      if (argv.includes('www-data')) throw new Error('no exec against a site whose dir cannot be stat-ed')
      return null
    }
  ])
  // the site dir itself errors (EACCES); a token/db lstat under it must never be attempted.
  const fs = {
    lstat(p) {
      if (p === ROOT) return { exists: true, isSymbolicLink: false, isDirectory: true }
      if (p === siteDir(ROOT, 'locked')) return { error: true }
      throw new Error(`must not stat under an unreadable site dir: ${p}`)
    },
    readdir(p) {
      return p === ROOT ? ['locked'] : null
    }
  }
  const report = await runInventory({ privateRoot: ROOT, run, fs })
  const s = report.sites[0]
  assert.equal(s.custody.hostFile, 'unsafe-path')
  assert.equal(s.custody.mount, 'unsafe-path')
  assert.equal(s.db.status, 'blocked')
})

test('aggregate folds statuses and never AND-s custody with db into one number', () => {
  const agg = aggregate([
    {
      status: 'ok',
      classification: 'emdash',
      compose: 'ok',
      custody: { hostFile: 'ok', mount: 'ok' },
      legacy: 'absent',
      db: { status: 'readable', agent: 'active-unique' }
    },
    {
      status: 'ok',
      classification: 'emdash',
      compose: 'ok',
      custody: { hostFile: 'ok', mount: 'ok' },
      legacy: 'absent',
      db: { status: 'error' }
    },
    { status: 'ambiguous-container' }
  ])
  assert.equal(agg.total, 3)
  assert.equal(agg.emdash, 2)
  assert.equal(agg.emdashCustodyReady, 2)
  assert.equal(agg.emdashDbIdentityReadable, 1) // NOT 2 — the two facts are counted apart
  assert.equal(agg.status['ambiguous-container'], 1)
})

// ── the management-host transport: run the reviewed source inside tracy-host ────────────────────
//
// The CI runner does not necessarily mount TRACY_PRIVATE_ROOT, so `--via-host` locates the ONE
// running tracy-host container, validates it, and pipes THIS reviewed source into it on stdin. These
// tests pin: the pure locate/validate helpers, the stdin transport argv + payload, and that every
// ambiguous / stopped / wrong / unsafe case fails closed BEFORE any exec with a sanitized reason.

const HOST_ID = 'a'.repeat(64)

/** A well-formed five-line host inspect (id · running · labels · env · mounts), with overrides. */
function hostInspect(over = {}) {
  const d = {
    id: JSON.stringify(HOST_ID),
    running: 'true',
    labels: JSON.stringify({
      'com.docker.compose.project': HOST_PROJECT,
      'com.docker.compose.service': HOST_SERVICE
    }),
    env: JSON.stringify(['PATH=/usr/bin', `TRACY_PRIVATE_ROOT=${ROOT}`]),
    mounts: JSON.stringify([{ Type: 'bind', Destination: ROOT, Source: ROOT, RW: true }])
  }
  const f = { ...d, ...over }
  return [f.id, f.running, f.labels, f.env, f.mounts].join('\n')
}

const INNER_REPORT = JSON.stringify(
  { kind: 'emdash-token-inventory', version: 1, readOnly: true, sites: [], aggregate: {} },
  null,
  2
)

const psHostOk = (argv) =>
  argv[0] === 'ps' && argv.includes(`label=com.docker.compose.project=${HOST_PROJECT}`)
    ? { stdout: `${HOST_ID}\t${HOST_PROJECT}\t${HOST_SERVICE}\n` }
    : null

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────

test('FULL_ID matches a 64-hex id only', () => {
  assert.match('a'.repeat(64), FULL_ID)
  assert.doesNotMatch('deadbeef', FULL_ID)
})

test('psHostArgv filters by BOTH compose labels and asks for full ids', () => {
  const argv = psHostArgv()
  assert.ok(argv.includes('--no-trunc'))
  assert.ok(argv.includes(`label=com.docker.compose.project=${HOST_PROJECT}`))
  assert.ok(argv.includes(`label=com.docker.compose.service=${HOST_SERVICE}`))
})

test('parseHostPs keeps only full-id tracy-host rows, dropping the rest', () => {
  const good = 'a'.repeat(64)
  const out = parseHostPs(
    [
      `${good}\t${HOST_PROJECT}\t${HOST_SERVICE}`,
      `deadbeef\t${HOST_PROJECT}\t${HOST_SERVICE}`, // truncated id — dropped
      `${'b'.repeat(64)}\tother\t${HOST_SERVICE}`, // wrong project — dropped
      `${'c'.repeat(64)}\t${HOST_PROJECT}\tweb`, // wrong service — dropped
      ''
    ].join('\n')
  )
  assert.deepEqual(out, [good])
})

test('inspectHostArgv asks for id/running/labels/env/mounts as five JSON lines', () => {
  const argv = inspectHostArgv('x')
  assert.equal(argv[0], 'inspect')
  assert.equal(argv.at(-1), 'x')
  assert.equal(argv[2].split('\n').length, 5)
})

test('parseHostInspect tolerates a malformed line without throwing', () => {
  const ins = parseHostInspect(
    [`"${'a'.repeat(64)}"`, 'true', 'not json', '["TRACY_PRIVATE_ROOT=/srv/tracy"]', '[]'].join('\n')
  )
  assert.equal(ins.id.length, 64)
  assert.equal(ins.running, true)
  assert.deepEqual(ins.labels, {}) // the malformed line collapses to {}
  assert.deepEqual(ins.env, ['TRACY_PRIVATE_ROOT=/srv/tracy'])
})

test('evaluateHostLabels requires the tracy/tracy-host compose identity', () => {
  const ok = { 'com.docker.compose.project': HOST_PROJECT, 'com.docker.compose.service': HOST_SERVICE }
  assert.equal(evaluateHostLabels(ok), 'ok')
  assert.equal(evaluateHostLabels({ ...ok, 'com.docker.compose.project': 'x' }), 'project-mismatch')
  assert.equal(evaluateHostLabels({ ...ok, 'com.docker.compose.service': 'web' }), 'service-mismatch')
})

test('privateRootFromEnv reads a single TRACY_PRIVATE_ROOT, and refuses a duplicate', () => {
  assert.equal(privateRootFromEnv(['PATH=/x', 'TRACY_PRIVATE_ROOT=/srv/tracy']), '/srv/tracy')
  assert.equal(privateRootFromEnv(['PATH=/x']), null)
  assert.equal(privateRootFromEnv(null), null)
  // a duplicated env entry is ambiguous — refused, never resolved to the first (or last).
  assert.equal(privateRootFromEnv(['TRACY_PRIVATE_ROOT=/srv/tracy', 'TRACY_PRIVATE_ROOT=/srv/evil']), null)
})

test('normalizeRoot accepts ONLY an already-canonical absolute non-root path with no control chars', () => {
  assert.equal(normalizeRoot('/srv/tracy'), '/srv/tracy')
  // 🔒 no longer normalised away — a non-canonical original is REFUSED, so what is validated is used.
  assert.equal(normalizeRoot('/srv/tracy/'), null) // trailing slash refused
  assert.equal(normalizeRoot('/srv//tracy'), null) // duplicate slash refused
  assert.equal(normalizeRoot('/srv/./tracy'), null) // `.` segment refused
  assert.equal(normalizeRoot('/'), null) // the filesystem root is refused
  assert.equal(normalizeRoot('srv/tracy'), null) // not absolute
  assert.equal(normalizeRoot('/srv/../etc'), null) // `..` refused, never resolved
  assert.equal(normalizeRoot('/srv/\0/x'), null) // NUL refused
  assert.equal(normalizeRoot('/srv/\n/x'), null) // newline (control char) refused
  assert.equal(normalizeRoot('/srv/\x7f/x'), null) // DEL (control char) refused
  assert.equal(normalizeRoot(''), null)
})

test('evaluateHostRootBind requires an identical-path (source===destination) bind of the root', () => {
  assert.equal(evaluateHostRootBind([{ Type: 'bind', Destination: ROOT, Source: ROOT }], ROOT), 'ok')
  assert.equal(evaluateHostRootBind([], ROOT), 'missing')
  assert.equal(evaluateHostRootBind([{ Type: 'volume', Destination: ROOT, Source: ROOT }], ROOT), 'not-bind')
  assert.equal(
    evaluateHostRootBind([{ Type: 'bind', Destination: ROOT, Source: '/elsewhere' }], ROOT),
    'source-mismatch'
  )
})

test('execHostArgv runs node on stdin, no shell and no user override', () => {
  assert.deepEqual(execHostArgv('cid', ['--root', ROOT, '--truncate']), [
    'exec',
    '-i',
    'cid',
    'node',
    '--input-type=module',
    '-',
    '--root',
    ROOT,
    '--truncate'
  ])
})

test('sanitizeHostReason keeps only fixed reasons, else host-error', () => {
  assert.equal(sanitizeHostReason('no-host-container'), 'no-host-container')
  assert.equal(sanitizeHostReason('/srv/tracy leaked a path'), 'host-error')
})

test('parseInnerReport accepts only an emdash-token-inventory report', () => {
  assert.equal(
    parseInnerReport('{"kind":"emdash-token-inventory","version":1}').kind,
    'emdash-token-inventory'
  )
  assert.equal(parseInnerReport('{"kind":"something-else"}'), null)
  assert.equal(parseInnerReport('not json'), null)
  assert.equal(parseInnerReport(''), null)
})

// ── the stdin transport: the EXACT reviewed source, unmodified, on stdin ────────────────────────

test('runHostInventory pipes the reviewed source into the validated tracy-host container on stdin', async () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8')
  const run = fakeRun([
    psHostOk,
    (argv) => (argv[0] === 'inspect' ? { stdout: hostInspect() } : null),
    (argv, stdin) => (argv[0] === 'exec' && stdin === source ? { stdout: INNER_REPORT } : null)
  ])
  const report = await runHostInventory({ run, source, truncate: true })
  assert.equal(report.kind, 'emdash-token-inventory')
  assert.equal(report.transport, 'via-host')
  const exec = run.calls.find((c) => c.argv[0] === 'exec')
  // the exec is the exact stdin transport into the FULL-id container, pinned to the validated root.
  assert.deepEqual(exec.argv, execHostArgv(HOST_ID, ['--root', ROOT, '--truncate']))
  assert.equal(exec.stdin, source) // the EXACT reviewed source, unmodified
})

test('the reviewed source runs its CLI when fed on stdin (node --input-type=module -)', () => {
  // Feeding the EXACT source on stdin with a bogus flag must reach the CLI entry (argv[1] === '-')
  // and fail with the fixed bad-arguments category — proving the stdin transport executes THIS
  // source, without relying on docker or a writable root.
  const source = readFileSync(SCRIPT_PATH, 'utf8')
  const res = spawnSync(process.execPath, ['--input-type=module', '-', '--not-a-flag'], {
    input: source,
    encoding: 'utf8'
  })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /INVENTORY_ERROR bad-arguments/)
  assert.match(res.stderr, /--via-host/)
})

// ── fail-closed: ambiguity, stopped / wrong container, unsafe root or mount ──────────────────────

test('runHostInventory reports no-host-container when none is running', async () => {
  const run = fakeRun([(argv) => (argv[0] === 'ps' ? { stdout: '' } : null)])
  assert.equal((await runHostInventory({ run, source: 'x' })).error, 'no-host-container')
})

test('runHostInventory refuses a duplicated tracy-host container (ambiguous), no inspect/exec', async () => {
  const run = fakeRun([
    (argv) =>
      argv[0] === 'ps'
        ? {
            stdout: `${'a'.repeat(64)}\t${HOST_PROJECT}\t${HOST_SERVICE}\n${'b'.repeat(64)}\t${HOST_PROJECT}\t${HOST_SERVICE}\n`
          }
        : null
  ])
  const report = await runHostInventory({ run, source: 'x' })
  assert.equal(report.error, 'ambiguous-host-container')
  assert.equal(
    run.calls.some((c) => c.argv[0] === 'inspect' || c.argv[0] === 'exec'),
    false
  )
})

test('runHostInventory rejects a stopped, mislabelled, or id-mismatched host — no exec', async () => {
  const noExec = (run) =>
    assert.equal(
      run.calls.some((c) => c.argv[0] === 'exec'),
      false
    )

  const stopped = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect({ running: 'false' }) } : null)
  ])
  assert.equal((await runHostInventory({ run: stopped, source: 'x' })).error, 'host-not-running')
  noExec(stopped)

  const mislabelled = fakeRun([
    psHostOk,
    (a) =>
      a[0] === 'inspect'
        ? {
            stdout: hostInspect({
              labels: JSON.stringify({
                'com.docker.compose.project': 'other',
                'com.docker.compose.service': HOST_SERVICE
              })
            })
          }
        : null
  ])
  assert.equal((await runHostInventory({ run: mislabelled, source: 'x' })).error, 'host-label-mismatch')
  noExec(mislabelled)

  // inspect reports a DIFFERENT id than the one we execed against — refuse it.
  const idMismatch = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect({ id: JSON.stringify('c'.repeat(64)) }) } : null)
  ])
  assert.equal((await runHostInventory({ run: idMismatch, source: 'x' })).error, 'host-id-mismatch')
  noExec(idMismatch)
})

test('runHostInventory rejects an unsafe TRACY_PRIVATE_ROOT or a non-identical root bind — no exec', async () => {
  const noExec = (run) =>
    assert.equal(
      run.calls.some((c) => c.argv[0] === 'exec'),
      false
    )

  // root is the filesystem root `/` — refused.
  const rootIsSlash = fakeRun([
    psHostOk,
    (a) =>
      a[0] === 'inspect'
        ? {
            stdout: hostInspect({
              env: JSON.stringify(['TRACY_PRIVATE_ROOT=/']),
              mounts: JSON.stringify([{ Type: 'bind', Destination: '/', Source: '/' }])
            })
          }
        : null
  ])
  assert.equal((await runHostInventory({ run: rootIsSlash, source: 'x' })).error, 'root-unsafe')
  noExec(rootIsSlash)

  // TRACY_PRIVATE_ROOT unset.
  const noRoot = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect({ env: JSON.stringify(['PATH=/usr/bin']) }) } : null)
  ])
  assert.equal((await runHostInventory({ run: noRoot, source: 'x' })).error, 'root-unsafe')

  // the root bind is not the identical host path (source !== destination).
  const badBind = fakeRun([
    psHostOk,
    (a) =>
      a[0] === 'inspect'
        ? {
            stdout: hostInspect({
              mounts: JSON.stringify([{ Type: 'bind', Destination: ROOT, Source: '/other' }])
            })
          }
        : null
  ])
  assert.equal((await runHostInventory({ run: badBind, source: 'x' })).error, 'root-bind-unsafe')
  noExec(badBind)

  // no bind of the root at all.
  const noBind = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect({ mounts: '[]' }) } : null)
  ])
  assert.equal((await runHostInventory({ run: noBind, source: 'x' })).error, 'root-bind-unsafe')
})

test('runHostInventory refuses to exec without the reviewed source in hand', async () => {
  const run = fakeRun([psHostOk, (a) => (a[0] === 'inspect' ? { stdout: hostInspect() } : null)])
  const report = await runHostInventory({ run, source: '' })
  assert.equal(report.error, 'source-unavailable')
  assert.equal(
    run.calls.some((c) => c.argv[0] === 'exec'),
    false
  )
})

// ── sanitized errors: no path, label, or raw docker error reaches the log ───────────────────────

test('runHostInventory sanitizes a failed exec transport and never leaks a stderr path', async () => {
  const run = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect() } : null),
    (a) => (a[0] === 'exec' ? { code: 1, stderr: '/srv/tracy/secret path here' } : null)
  ])
  const report = await runHostInventory({ run, source: 'x' })
  assert.equal(report.error, 'host-exec-failed')
  assert.doesNotMatch(JSON.stringify(report), /secret path|\/srv\/tracy/)
})

test('a non-zero exec transport is an error even if stdout looks like a valid report', async () => {
  const run = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect() } : null),
    (a) => (a[0] === 'exec' ? { code: 137, stdout: INNER_REPORT } : null)
  ])
  assert.equal((await runHostInventory({ run, source: 'x' })).error, 'host-exec-failed')
})

test('runHostInventory reports inner-unparseable when the inner stdout is not a report', async () => {
  const run = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { stdout: hostInspect() } : null),
    (a) => (a[0] === 'exec' ? { stdout: 'not a report at all' } : null)
  ])
  assert.equal((await runHostInventory({ run, source: 'x' })).error, 'inner-unparseable')
})

test('an inspect timeout is a fixed sanitized reason and does not leak stderr', async () => {
  const run = fakeRun([
    psHostOk,
    (a) => (a[0] === 'inspect' ? { code: null, stderr: '/srv/tracy leak', timedOut: true } : null)
  ])
  const report = await runHostInventory({ run, source: 'x' })
  assert.equal(report.error, 'host-inspect-timeout')
  assert.doesNotMatch(JSON.stringify(report), /leak|\/srv\/tracy/)
})

test('a duplicated TRACY_PRIVATE_ROOT env entry fails closed as root-unsafe — no exec', async () => {
  const run = fakeRun([
    psHostOk,
    (a) =>
      a[0] === 'inspect'
        ? {
            stdout: hostInspect({
              env: JSON.stringify([`TRACY_PRIVATE_ROOT=${ROOT}`, 'TRACY_PRIVATE_ROOT=/srv/evil'])
            })
          }
        : null
  ])
  const report = await runHostInventory({ run, source: 'x' })
  assert.equal(report.error, 'root-unsafe')
  assert.equal(
    run.calls.some((c) => c.argv[0] === 'exec'),
    false
  )
})

test('the outer via-host exec is given a longer bound than the per-container 15s call limit', async () => {
  // A bespoke run that records each call's timeoutMs — proving ONLY the outer exec is widened.
  const seen = []
  const run = async (input) => {
    seen.push({ argv: [...input.argv], timeoutMs: input.timeoutMs })
    if (input.argv[0] === 'ps')
      return {
        code: 0,
        stdout: `${HOST_ID}\t${HOST_PROJECT}\t${HOST_SERVICE}\n`,
        stderr: '',
        timedOut: false
      }
    if (input.argv[0] === 'inspect') return { code: 0, stdout: hostInspect(), stderr: '', timedOut: false }
    return { code: 0, stdout: INNER_REPORT, stderr: '', timedOut: false }
  }
  await runHostInventory({ run, source: 'x', truncate: true })
  const exec = seen.find((c) => c.argv[0] === 'exec')
  assert.equal(exec.timeoutMs, HOST_EXEC_TIMEOUT_MS)
  assert.ok(exec.timeoutMs > RUN_TIMEOUT_MS)
  // the per-call bound is unchanged: ps/inspect carry no override (defaultRun keeps RUN_TIMEOUT_MS).
  assert.equal(seen.find((c) => c.argv[0] === 'ps').timeoutMs, undefined)
  assert.equal(seen.find((c) => c.argv[0] === 'inspect').timeoutMs, undefined)
})

test('the --via-host CLI still prints the sanitized report but exits non-zero on a transport error', (t) => {
  // Run the real CLI against a failed Docker transport, independently of local running hosts.
  const bin = mkdtempSync(path.join(tmpdir(), 'emdash-inv-cli-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  writeFileSync(
    path.join(bin, 'docker'),
    "#!/bin/sh\nprintf '/srv/tracy transport failed\\n' >&2\nexit 1\n",
    {
      mode: 0o755
    }
  )
  const res = spawnSync(process.execPath, [SCRIPT_PATH, '--via-host', '--truncate'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: bin }
  })
  assert.equal(res.status, 1)
  const report = JSON.parse(res.stdout)
  assert.equal(report.kind, 'emdash-token-inventory')
  assert.equal(report.transport, 'via-host')
  assert.equal(report.error, 'host-ps-failed')
  // still fully sanitized — no path leaked to the summary.
  assert.doesNotMatch(res.stdout, /\/srv\/tracy/)
})
