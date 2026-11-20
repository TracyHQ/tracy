#!/usr/bin/env node
// Copied verbatim from packages/fleet/tracy-fleet-operation/scripts/provision/emdash/mint-agent-admin.cjs
// (TCH, 2026-09-13) so a local site can be set up with no browser and no passkey; the only change
// is the default database path (this template keeps SQLite under ./data). Same insert shapes as
// the fleet copy; keep the two in sync when EmDash changes its auth tables.
//
// Seed the new EmDash site's admins with no browser and no passkey, and mint the resident
// agent's Personal Access Token. Runs INSIDE the emdash web container, working dir /app so
// `require('better-sqlite3')` resolves, against the site's own SQLite. Prints exactly one line
// for the caller to capture:
//
//   TRACY_EMDASH_PAT=ec_pat_…
//
// Two admins are seeded (both role=50, no credential — EmDash needs none to exist):
//   • "Tracy" (TRACY_AGENT_EMAIL) — the resident agent; its PAT is what drives the site over
//     MCP/REST when the person edits by chat. No human ever logs in as this one.
//   • the person who created the site (TRACY_OWNER_EMAIL, their Tracy account email) — so the
//     site knows its owner from the first second: their name on bylines, their account already
//     an admin when they open the admin UI. They still register a passkey on first admin visit
//     (WebAuthn needs a real browser), but against an account that already exists and already
//     owns the site, not a stranger racing the setup wizard.
//
// Idempotent: users are reused by email; the agent token is re-minted each run (revoke-then-
// insert) because it is stored only as a hash — a site never accumulates live tokens it cannot
// see. Insert shapes mirror packages/auth/src/adapters/kysely.ts (users) and migration 016.
const { createHash, randomBytes, randomUUID } = require('node:crypto')
const Database = require('better-sqlite3')

const DB_PATH = process.env.EMDASH_DB || './data/data.db'
const AGENT_EMAIL = (process.env.TRACY_AGENT_EMAIL || 'tracy-agent@tracy.ai').toLowerCase()
const OWNER_EMAIL = (process.env.TRACY_OWNER_EMAIL || '').toLowerCase()
const OWNER_NAME = process.env.TRACY_OWNER_NAME || null
const ROLE_ADMIN = 50
const AGENT_SCOPES = JSON.stringify(['admin', 'mcp:tools'])
const TOKEN_NAME = 'tracy-agent'

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')
const now = new Date().toISOString()

/** Reuse an admin by email, or create one with no credential. Returns the user id. */
function ensureAdmin(email, name) {
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (found) return found.id
  const id = randomUUID()
  db.prepare(
    `INSERT INTO users (id, email, name, avatar_url, role, email_verified, disabled, data, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 1, 0, NULL, ?, ?)`
  ).run(id, email, name, ROLE_ADMIN, now, now)
  return id
}

const agentId = ensureAdmin(AGENT_EMAIL, 'Tracy')
// The owner is best-effort: a missing email must not fail the mint (the agent PAT is the payload).
if (OWNER_EMAIL && OWNER_EMAIL !== AGENT_EMAIL) ensureAdmin(OWNER_EMAIL, OWNER_NAME)

// ── the agent's token ─────────────────────────────────────────────────────────────────────
// raw = "ec_pat_" + base64url(32 random bytes); hash = base64url(sha256(utf8(raw))) no padding,
// exactly generatePrefixedToken / hashPrefixedToken (packages/auth/src/tokens.ts).
const raw = `ec_pat_${randomBytes(32).toString('base64url')}`
const hash = createHash('sha256').update(raw, 'utf8').digest('base64url')
const prefix = raw.slice(0, 11)

db.prepare('DELETE FROM _emdash_api_tokens WHERE user_id = ? AND name = ?').run(agentId, TOKEN_NAME)
db.prepare(
  `INSERT INTO _emdash_api_tokens (id, name, token_hash, prefix, user_id, scopes, expires_at, last_used_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
).run(randomUUID(), TOKEN_NAME, hash, prefix, agentId, AGENT_SCOPES, now)

// ── close the setup wizard ──────────────────────────────────────────────────────────────────
// EmDash's `/api/setup/status` reports `needsSetup: false` only when BOTH the `emdash:setup_complete`
// option is JSON `true` AND a user exists (packages/core/src/astro/routes/api/setup/status.ts).
// Seeding the admins above satisfies the second; without this flag the first stays false, so the
// site keeps serving the first-come setup wizard — a stranger could race the owner to claim it, and
// the owner meets a setup form instead of a login. Value is `JSON.stringify(true)` === "true", the
// exact shape `options.set` writes (packages/core/src/database/repositories/options.ts).
db.prepare(
  `INSERT INTO options (name, value) VALUES ('emdash:setup_complete', 'true')
   ON CONFLICT(name) DO UPDATE SET value = 'true'`
).run()

db.close()
process.stdout.write(`TRACY_EMDASH_PAT=${raw}\n`)
