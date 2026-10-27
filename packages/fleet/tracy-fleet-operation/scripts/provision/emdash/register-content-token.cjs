#!/usr/bin/env node
//
// Register the Content API relay PAT in a Tracy EmDash site's own SQLite. Runs INSIDE the site's
// web container (working dir /app, so `require('better-sqlite3')` resolves), as the site user.
//
// The raw token never enters the container: provision generated it on the host
// (`platform/emdash.sh`, `$SITE_DIR/tracy-content.token`, root 0600) and hands this script only
// what EmDash stores — the base64url SHA-256 (`TRACY_CONTENT_TOKEN_HASH`) and the display prefix
// (`TRACY_CONTENT_TOKEN_PREFIX`). Hash shape mirrors mint-agent-admin.cjs / EmDash
// `hashPrefixedToken`.
//
// The token belongs to the resident agent user and carries ONE scope, `content:read`: it can read
// content and nothing else, so the relay reads with least privilege. Idempotent: the named token is
// replaced each run, so a site never holds two relay tokens.
const { randomUUID } = require('node:crypto')
const Database = require('better-sqlite3')

const DB_PATH = process.env.EMDASH_DB || '/app/data/data.db'
const AGENT_EMAIL = (process.env.TRACY_AGENT_EMAIL || 'tracy-agent@tracy.ai').toLowerCase()
const HASH = process.env.TRACY_CONTENT_TOKEN_HASH || ''
const PREFIX = process.env.TRACY_CONTENT_TOKEN_PREFIX || ''
const TOKEN_NAME = 'tracy-content-read'
const SCOPES = JSON.stringify(['content:read'])

if (!/^[A-Za-z0-9_-]{43}$/.test(HASH) || !/^ec_pat_[A-Za-z0-9_-]{4}$/.test(PREFIX)) {
  process.stderr.write('content token hash or prefix has the wrong shape\n')
  process.exit(2)
}
const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')
const agent = db.prepare('SELECT id FROM users WHERE email = ?').get(AGENT_EMAIL)
if (!agent) {
  process.stderr.write('the resident agent user does not exist yet\n')
  process.exit(3)
}
db.transaction(() => {
  db.prepare('DELETE FROM _emdash_api_tokens WHERE user_id = ? AND name = ?').run(agent.id, TOKEN_NAME)
  db.prepare(
    `INSERT INTO _emdash_api_tokens (id, name, token_hash, prefix, user_id, scopes, expires_at, last_used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
  ).run(randomUUID(), TOKEN_NAME, HASH, PREFIX, agent.id, SCOPES, new Date().toISOString())
})()
db.close()
process.stdout.write('TRACY_CONTENT_TOKEN=registered\n')
