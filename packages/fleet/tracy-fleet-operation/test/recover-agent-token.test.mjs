import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { abort, finalize, stage } from '../scripts/provision/emdash/recover-agent-token.mjs'

// Resolved against THIS FILE, not the process cwd — the same anchor the import above uses. A
// `path.resolve('packages/…')` anchors on wherever the runner was started: `check-tests` runs each
// package's suite with cwd = the package directory, so it resolved to
// `<pkg>/packages/fleet/tracy-fleet-operation/scripts/…` and every CLI case spawned a script that
// is not there.
const SCRIPT = fileURLToPath(new URL('../scripts/provision/emdash/recover-agent-token.mjs', import.meta.url))
const AGENT = 'tracy-agent@tracy.ai'
const FIXTURES = new Set()

after(() => {
  for (const dir of FIXTURES) rmSync(dir, { recursive: true, force: true })
})

function fixture({ user = {}, canonical = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-recovery-'))
  FIXTURES.add(dir)
  const dbPath = path.join(dir, 'data.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, role INTEGER, disabled INTEGER, name TEXT);
    CREATE TABLE _emdash_api_tokens (
      id TEXT PRIMARY KEY, name TEXT, token_hash TEXT, prefix TEXT, user_id TEXT, scopes TEXT,
      expires_at TEXT, last_used_at TEXT, created_at TEXT
    );
    CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE content_sentinel (value TEXT);
  `)
  db.prepare('INSERT INTO users (id, email, role, disabled, name) VALUES (?, ?, ?, ?, ?)').run(
    user.id ?? 'agent-1',
    user.email ?? AGENT,
    user.role ?? 50,
    user.disabled ?? 0,
    'Tracy'
  )
  db.prepare('INSERT INTO options (name, value) VALUES (?, ?)').run('emdash:setup_complete', 'true')
  db.prepare('INSERT INTO content_sentinel (value) VALUES (?)').run('untouched')
  if (canonical)
    insertToken(db, { id: 'old-token', name: 'tracy-agent', userId: user.id ?? 'agent-1', raw: 'old-secret' })
  insertToken(db, { id: 'other-token', name: 'other', userId: 'other-user', raw: 'other-secret' })
  db.close()
  return { dir, dbPath }
}

function insertToken(db, { id, name, userId, raw }) {
  db.prepare(
    `INSERT INTO _emdash_api_tokens
     (id, name, token_hash, prefix, user_id, scopes, expires_at, last_used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    createHash('sha256').update(raw).digest('base64url'),
    raw.slice(0, 11),
    userId,
    '["admin"]',
    null,
    null,
    '2026-01-01T00:00:00.000Z'
  )
}

function rows(dbPath) {
  const db = new DatabaseSync(dbPath)
  const result = {
    tokens: db.prepare('SELECT id, name, user_id, token_hash FROM _emdash_api_tokens ORDER BY id').all(),
    users: db.prepare('SELECT id, email, role, disabled, name FROM users ORDER BY id').all(),
    options: db.prepare('SELECT name, value FROM options ORDER BY name').all(),
    sentinel: db.prepare('SELECT value FROM content_sentinel').all()
  }
  db.close()
  return result
}

function cli(args) {
  return spawnSync(process.execPath, ['--input-type=module', '-', ...args], {
    cwd: path.resolve('.'),
    input: readFileSync(SCRIPT),
    encoding: 'utf8',
    timeout: 5000
  })
}

function unexpectedStderr(stderr) {
  return String(stderr)
    .split('\n')
    .filter(
      (line) =>
        line &&
        !/^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time$/.test(
          line
        ) &&
        !/^\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/.test(line)
    )
    .join('\n')
}

test('stage retains all prior rows and emits the only secret on successful stdout', () => {
  const { dbPath } = fixture()
  const before = rows(dbPath)
  const result = stage(dbPath)
  assert.match(result.token, /^ec_pat_[A-Za-z0-9_-]{16,}$/)
  const after = rows(dbPath)
  assert.equal(after.tokens.length, before.tokens.length + 1)
  assert.deepEqual(
    after.tokens.filter((row) => row.id !== result.tokenId),
    before.tokens
  )
  assert.deepEqual(after.sentinel, before.sentinel)
  assert.deepEqual(after.users, before.users)
  assert.deepEqual(after.options, before.options)

  const run = cli(['stage', dbPath])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^STAGED [0-9a-f-]+ ec_pat_[A-Za-z0-9_-]+\n$/)
  assert.equal(unexpectedStderr(run.stderr), '')
})

test('stage refuses missing, disabled, and non-admin agents without mutation', () => {
  for (const user of [{ email: 'other@example.test' }, { disabled: 1 }, { role: 10 }]) {
    const { dbPath } = fixture({ user })
    const before = rows(dbPath)
    assert.throws(() => stage(dbPath), /fixed agent account/)
    assert.deepEqual(rows(dbPath), before)
  }

  const ambiguous = fixture()
  let db = new DatabaseSync(ambiguous.dbPath)
  db.prepare('INSERT INTO users (id, email, role, disabled, name) VALUES (?, ?, ?, ?, ?)').run(
    'agent-2',
    'TRACY-AGENT@TRACY.AI',
    50,
    0,
    'Duplicate'
  )
  db.close()
  assert.throws(() => stage(ambiguous.dbPath), /ambiguous/)

  const nullStatus = fixture()
  db = new DatabaseSync(nullStatus.dbPath)
  db.prepare('UPDATE users SET disabled = NULL WHERE id = ?').run('agent-1')
  db.close()
  assert.throws(() => stage(nullStatus.dbPath), /disabled/)
})

test('stage refuses missing, symlink, and malformed-schema databases without mutation', () => {
  const missing = path.join(mkdtempSync(path.join(tmpdir(), 'emdash-recovery-')), 'missing.db')
  FIXTURES.add(path.dirname(missing))
  assert.throws(() => stage(missing), /does not exist/)
  assert.equal(existsSync(missing), false)
  const missingDir = path.join(path.dirname(missing), 'no-directory', 'data.db')
  assert.throws(() => stage(missingDir), /does not exist/)
  assert.equal(existsSync(path.dirname(missingDir)), false)

  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-recovery-'))
  FIXTURES.add(dir)
  const real = path.join(dir, 'real.db')
  writeFileSync(real, 'not sqlite')
  const link = path.join(dir, 'data.db')
  symlinkSync(real, link)
  assert.throws(() => stage(link), /regular file/)

  const malformed = path.join(dir, 'malformed.db')
  const db = new DatabaseSync(malformed)
  db.exec('CREATE TABLE users (id TEXT, email TEXT, role INTEGER, disabled INTEGER)')
  db.close()
  assert.throws(() => stage(malformed), /required table is missing/)
})

test('SQLite trigger failures roll back all token changes', () => {
  const { dbPath } = fixture()
  const before = rows(dbPath)
  let db = new DatabaseSync(dbPath)
  db.exec(
    "CREATE TRIGGER refuse_recovery_insert BEFORE INSERT ON _emdash_api_tokens WHEN NEW.name LIKE 'tracy-agent.recovery.%' BEGIN SELECT RAISE(ABORT, 'recovery insert sentinel'); END"
  )
  db.close()
  assert.throws(() => stage(dbPath), /recovery insert sentinel/)
  assert.deepEqual(rows(dbPath), before)

  db = new DatabaseSync(dbPath)
  db.exec('DROP TRIGGER refuse_recovery_insert')
  db.close()
  const staged = stage(dbPath)
  const stagedRows = rows(dbPath)
  db = new DatabaseSync(dbPath)
  db.exec(
    "CREATE TRIGGER refuse_recovery_finalize BEFORE UPDATE OF name ON _emdash_api_tokens WHEN NEW.id = OLD.id AND NEW.name = 'tracy-agent' BEGIN SELECT RAISE(ABORT, 'recovery finalize sentinel'); END"
  )
  db.close()
  assert.throws(() => finalize(dbPath, staged.id), /recovery finalize sentinel/)
  assert.deepEqual(rows(dbPath), stagedRows)
})

test('abort targets only its exact stage and cannot delete canonical or another user row', () => {
  const { dbPath } = fixture()
  const one = stage(dbPath)
  const two = stage(dbPath)
  assert.throws(() => abort(dbPath, '00000000-0000-4000-8000-000000000000'), /missing or ambiguous/)
  abort(dbPath, two.id)
  const after = rows(dbPath)
  assert.ok(after.tokens.some((row) => row.id === 'old-token' && row.name === 'tracy-agent'))
  assert.ok(after.tokens.some((row) => row.id === one.tokenId))
  assert.ok(after.tokens.some((row) => row.id === 'other-token'))
  assert.ok(!after.tokens.some((row) => row.id === two.tokenId))
})

test('concurrent stages: first finalize wins; second refuses without changing it', () => {
  const { dbPath } = fixture()
  const one = stage(dbPath)
  const two = stage(dbPath)
  finalize(dbPath, one.id)
  const afterOne = rows(dbPath)
  assert.ok(afterOne.tokens.some((row) => row.id === one.tokenId && row.name === 'tracy-agent'))
  assert.throws(() => finalize(dbPath, two.id), /canonical agent token state changed/)
  assert.deepEqual(rows(dbPath), afterOne)
  abort(dbPath, two.id)
})

test('canonical usage metadata may change while staging without invalidating the snapshot', () => {
  const { dbPath } = fixture()
  const staged = stage(dbPath)
  const db = new DatabaseSync(dbPath)
  db.prepare('UPDATE _emdash_api_tokens SET last_used_at = ? WHERE id = ?').run(
    '2026-09-18T12:00:00.000Z',
    'old-token'
  )
  db.close()
  finalize(dbPath, staged.id)
})

test('finalize and abort recheck the expected active admin owner', () => {
  const { dbPath } = fixture()
  const staged = stage(dbPath)
  const db = new DatabaseSync(dbPath)
  db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run('agent-1')
  db.close()
  assert.throws(() => finalize(dbPath, staged.id), /disabled/)
  assert.throws(() => abort(dbPath, staged.id), /disabled/)

  const demoted = fixture()
  const demotedStage = stage(demoted.dbPath)
  const demotedDb = new DatabaseSync(demoted.dbPath)
  demotedDb.prepare('UPDATE users SET role = ?, disabled = 0 WHERE id = ?').run(10, 'agent-1')
  demotedDb.close()
  const beforeDemoted = rows(demoted.dbPath)
  assert.throws(() => finalize(demoted.dbPath, demotedStage.id), /administrator/)
  assert.throws(() => abort(demoted.dbPath, demotedStage.id), /administrator/)
  assert.deepEqual(rows(demoted.dbPath), beforeDemoted)
})

test('finalize swaps only the intended agent canonical row and rejects unknown or mismatched stages', () => {
  const { dbPath } = fixture()
  const db = new DatabaseSync(dbPath)
  insertToken(db, { id: 'old-token-2', name: 'tracy-agent', userId: 'agent-1', raw: 'old-secret-2' })
  db.close()
  const staged = stage(dbPath)
  const before = rows(dbPath)
  assert.throws(() => finalize(dbPath, '00000000-0000-4000-8000-000000000001'), /missing or ambiguous/)
  finalize(dbPath, staged.id)
  const after = rows(dbPath)
  assert.ok(after.tokens.some((row) => row.id === staged.tokenId && row.name === 'tracy-agent'))
  assert.ok(after.tokens.some((row) => row.id === 'other-token' && row.name === 'other'))
  assert.equal(after.tokens.filter((row) => row.name === 'tracy-agent').length, 1)
  assert.deepEqual(after.users, before.users)
  assert.deepEqual(after.options, before.options)
  assert.deepEqual(after.sentinel, before.sentinel)
  assert.throws(() => abort(dbPath, staged.id), /missing or ambiguous/)
})

test('finalize rejects a staged marker owned by another agent account', () => {
  const { dbPath } = fixture()
  const db = new DatabaseSync(dbPath)
  db.prepare('INSERT INTO users (id, email, role, disabled, name) VALUES (?, ?, ?, ?, ?)').run(
    'agent-2',
    'other-agent@example.test',
    50,
    0,
    'Other'
  )
  db.close()
  const staged = stage(dbPath, { agentEmail: 'other-agent@example.test' })
  const before = rows(dbPath)
  assert.throws(() => finalize(dbPath, staged.id), /different agent account/)
  assert.deepEqual(rows(dbPath), before)
  abort(dbPath, staged.id, { agentEmail: 'other-agent@example.test' })
})

test('CLI errors never expose a PAT and stage works from stdin without source-path dependency', () => {
  const { dbPath } = fixture({ user: { role: 10 } })
  const run = cli(['stage', dbPath])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /^RECOVERY_ERROR /)
  assert.doesNotMatch(run.stderr, /ec_pat_|old-secret/)
  assert.equal(run.stdout, '')
})

test('CLI stage accepts the explicit agent-email override after the database path', () => {
  const { dbPath } = fixture({ user: { email: 'existing-agent@example.test' } })
  const run = cli(['stage', dbPath, '--agent-email', 'existing-agent@example.test'])
  assert.equal(run.status, 0, unexpectedStderr(run.stderr))
  assert.match(run.stdout, /^STAGED [0-9a-f-]+ ec_pat_[A-Za-z0-9_-]+\n$/)
})

test('CLI converts database errors to generic safe output', () => {
  const { dbPath } = fixture()
  const db = new DatabaseSync(dbPath)
  db.exec(
    "CREATE TRIGGER leak_error BEFORE INSERT ON _emdash_api_tokens WHEN NEW.name LIKE 'tracy-agent.recovery.%' BEGIN SELECT RAISE(ABORT, 'private-db-sentinel'); END"
  )
  db.close()
  const run = cli(['stage', dbPath])
  assert.notEqual(run.status, 0)
  assert.match(unexpectedStderr(run.stderr), /^RECOVERY_ERROR database operation failed$/)
  assert.doesNotMatch(unexpectedStderr(run.stderr), /private-db-sentinel|ec_pat_/)
})
