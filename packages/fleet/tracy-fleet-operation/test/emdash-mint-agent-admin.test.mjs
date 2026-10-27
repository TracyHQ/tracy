import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/emdash/mint-agent-admin.cjs', import.meta.url))

test('EmDash agent admin mint works when the image has node:sqlite but no better-sqlite3', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-emdash-mint-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dbPath = path.join(root, 'data.db')
  const db = new DatabaseSync(dbPath)
  t.after(() => db.close())
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, avatar_url TEXT,
      role INTEGER NOT NULL, email_verified INTEGER NOT NULL, disabled INTEGER NOT NULL,
      data TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE _emdash_api_tokens (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, prefix TEXT NOT NULL,
      user_id TEXT NOT NULL, scopes TEXT NOT NULL, expires_at TEXT, last_used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
  `)

  const mint = () =>
    spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EMDASH_DB: dbPath,
        TRACY_OWNER_EMAIL: 'owner@example.test',
        NODE_NO_WARNINGS: '1'
      }
    })

  const first = mint()
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /^TRACY_EMDASH_PAT=ec_pat_[A-Za-z0-9_-]{43}\n$/)
  assert.deepEqual(
    db
      .prepare('SELECT email, role FROM users ORDER BY email')
      .all()
      .map(({ email, role }) => ({ email, role })),
    [
      { email: 'owner@example.test', role: 50 },
      { email: 'tracy-agent@tracy.ai', role: 50 }
    ]
  )
  assert.equal(
    db.prepare("SELECT value FROM options WHERE name = 'emdash:setup_complete'").get().value,
    'true'
  )
  assert.equal(db.prepare('SELECT count(*) AS n FROM _emdash_api_tokens').get().n, 1)

  const second = mint()
  assert.equal(second.status, 0, second.stderr)
  assert.notEqual(second.stdout, first.stdout, 'a retry must rotate the agent token')
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 2)
  assert.equal(db.prepare('SELECT count(*) AS n FROM _emdash_api_tokens').get().n, 1)
})
