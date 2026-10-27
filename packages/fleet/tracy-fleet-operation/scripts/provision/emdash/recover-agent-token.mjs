#!/usr/bin/env node
/**
 * Transactional recovery for an existing EmDash agent PAT.
 *
 * This helper only changes `_emdash_api_tokens`. It does not create users, set setup state, run
 * setup/seed, or touch content/schema. The host must run the source through `node -` as www-data,
 * capture the stage PAT into a root-only file, authenticate the new protected mounted reader, and
 * only then call finalize. This helper does not mount files, recreate containers, or prove readiness.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_AGENT_EMAIL = 'tracy-agent@tracy.ai'
const CANONICAL_NAME = 'tracy-agent'
const STAGE_PREFIX = 'tracy-agent.recovery.'
const PAT_RE = /^ec_pat_[A-Za-z0-9_-]{16,}$/
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUIRED = {
  users: ['id', 'email', 'role', 'disabled'],
  _emdash_api_tokens: [
    'id',
    'name',
    'token_hash',
    'prefix',
    'user_id',
    'scopes',
    'expires_at',
    'last_used_at',
    'created_at'
  ]
}

class RecoveryError extends Error {}

function fail(message) {
  throw new RecoveryError(message)
}

function assertDbPath(dbPath) {
  if (typeof dbPath !== 'string' || dbPath.length === 0) fail('database path is required')
  let stat
  try {
    stat = lstatSync(dbPath)
  } catch {
    fail('database path does not exist')
  }
  if (!stat.isFile()) fail('database path is not a regular file')
}

function openDatabase(dbPath) {
  assertDbPath(dbPath)
  try {
    return new DatabaseSync(dbPath)
  } catch {
    fail('could not open the SQLite database')
  }
}

function tableColumns(db, table) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name)
  )
}

function validateSchema(db) {
  for (const [table, columns] of Object.entries(REQUIRED)) {
    const present = tableColumns(db, table)
    if (present.size === 0) fail(`required table is missing: ${table}`)
    const missing = columns.filter((column) => !present.has(column))
    if (missing.length > 0) fail(`required columns are missing from ${table}: ${missing.join(',')}`)
  }
}

function digestCanonicalRows(rows) {
  const stable = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      token_hash: row.token_hash,
      prefix: row.prefix,
      user_id: row.user_id,
      scopes: row.scopes,
      expires_at: row.expires_at,
      created_at: row.created_at
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return createHash('sha256').update(JSON.stringify(stable), 'utf8').digest('hex')
}

function canonicalRows(db, agentId) {
  return db
    .prepare(
      `SELECT id, name, token_hash, prefix, user_id, scopes, expires_at, last_used_at, created_at
       FROM _emdash_api_tokens WHERE user_id = ? AND name = ? ORDER BY id`
    )
    .all(agentId, CANONICAL_NAME)
}

function stageName(stageId, fingerprint) {
  return `${STAGE_PREFIX}${stageId}.${fingerprint}`
}

function assertStageId(stageId) {
  if (!ID_RE.test(stageId)) fail('invalid recovery stage id')
}

function agent(db, email) {
  const rows = db
    .prepare('SELECT id, email, role, disabled FROM users WHERE lower(email) = lower(?)')
    .all(email)
  if (rows.length === 0) fail('the fixed agent account is missing')
  if (rows.length !== 1) fail('the fixed agent account is ambiguous')
  const row = rows[0]
  if (row.disabled !== 0) fail('the fixed agent account is disabled')
  if (row.role !== 50) fail('the fixed agent account is not an administrator')
  return row
}

function makeToken() {
  const token = `ec_pat_${randomBytes(32).toString('base64url')}`
  if (!PAT_RE.test(token)) fail('generated recovery token has invalid shape')
  return token
}

function tokenValues(raw, agentId, name, now) {
  const hash = createHash('sha256').update(raw, 'utf8').digest('base64url')
  return [name, hash, raw.slice(0, 11), agentId, JSON.stringify(['admin', 'mcp:tools']), null, null, now]
}

function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const value = callback()
    db.exec('COMMIT')
    return value
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Preserve the original failure; the caller must refuse readiness regardless.
    }
    throw error
  }
}

export function stage(dbPath, { agentEmail = DEFAULT_AGENT_EMAIL } = {}) {
  const db = openDatabase(dbPath)
  try {
    validateSchema(db)
    const id = randomUUID()
    const raw = makeToken()
    const result = transaction(db, () => {
      const owner = agent(db, agentEmail)
      const before = canonicalRows(db, owner.id)
      const fingerprint = digestCanonicalRows(before)
      const name = stageName(id, fingerprint)
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO _emdash_api_tokens
         (id, name, token_hash, prefix, user_id, scopes, expires_at, last_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, ...tokenValues(raw, owner.id, name, now))
      return { id, agentId: owner.id, fingerprint }
    })
    return { ...result, tokenId: result.id, token: raw }
  } finally {
    db.close()
  }
}

function findStage(db, stageId, agentEmail) {
  assertStageId(stageId)
  const rows = db
    .prepare(
      `SELECT id, name, user_id, token_hash FROM _emdash_api_tokens
       WHERE id = ? AND name LIKE ? ESCAPE '\\'`
    )
    .all(stageId, `${STAGE_PREFIX}${stageId}.%`)
  if (rows.length !== 1) fail('recovery stage is missing or ambiguous')
  const row = rows[0]
  const match = new RegExp(`^${STAGE_PREFIX.replaceAll('.', '\\.')}${stageId}\\.([0-9a-f]{64})$`).exec(
    row.name
  )
  if (!match) fail('recovery stage marker is invalid')
  const owner = agent(db, agentEmail)
  if (owner.id !== row.user_id) fail('recovery stage belongs to a different agent account')
  return { ...row, fingerprint: match[1] }
}

function assertCanonicalSnapshot(db, stageRow) {
  const current = canonicalRows(db, stageRow.user_id)
  if (digestCanonicalRows(current) !== stageRow.fingerprint)
    fail('canonical agent token state changed since recovery was staged')
}

export function finalize(dbPath, stageId, { agentEmail = DEFAULT_AGENT_EMAIL } = {}) {
  const db = openDatabase(dbPath)
  try {
    validateSchema(db)
    const result = transaction(db, () => {
      const staged = findStage(db, stageId, agentEmail)
      assertCanonicalSnapshot(db, staged)
      const canonical = db
        .prepare('SELECT id FROM _emdash_api_tokens WHERE user_id = ? AND name = ?')
        .all(staged.user_id, CANONICAL_NAME)
      db.prepare('DELETE FROM _emdash_api_tokens WHERE user_id = ? AND name = ?').run(
        staged.user_id,
        CANONICAL_NAME
      )
      const changed = db
        .prepare('UPDATE _emdash_api_tokens SET name = ? WHERE id = ? AND user_id = ? AND name = ?')
        .run(CANONICAL_NAME, staged.id, staged.user_id, staged.name)
      if (changed.changes !== 1) fail('recovery stage changed before finalize')
      return { canonicalRemoved: canonical.length, stageId }
    })
    return result
  } finally {
    db.close()
  }
}

export function abort(dbPath, stageId, { agentEmail = DEFAULT_AGENT_EMAIL } = {}) {
  const db = openDatabase(dbPath)
  try {
    validateSchema(db)
    return transaction(db, () => {
      const staged = findStage(db, stageId, agentEmail)
      const changed = db
        .prepare('DELETE FROM _emdash_api_tokens WHERE id = ? AND user_id = ? AND name = ?')
        .run(staged.id, staged.user_id, staged.name)
      if (changed.changes !== 1) fail('recovery stage changed before abort')
      return { stageId }
    })
  } finally {
    db.close()
  }
}

function args(argv) {
  const [operation, dbPath, maybeStageId, ...tail] = argv
  const stageId = operation === 'stage' ? undefined : maybeStageId
  const rest = operation === 'stage' ? [maybeStageId, ...tail].filter(Boolean) : tail
  let agentEmail = DEFAULT_AGENT_EMAIL
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--agent-email' && rest[i + 1]) agentEmail = rest[++i]
    else fail('usage: stage <db> [--agent-email EMAIL] | finalize <db> <stage-id> | abort <db> <stage-id>')
  }
  if (!['stage', 'finalize', 'abort'].includes(operation) || !dbPath)
    fail('usage: stage <db> [--agent-email EMAIL] | finalize <db> <stage-id> | abort <db> <stage-id>')
  if (operation !== 'stage' && !stageId) fail('stage id is required')
  return { operation, dbPath, stageId, agentEmail }
}

if (process.argv[1] === '-' || process.argv[1]?.endsWith('recover-agent-token.mjs')) {
  try {
    const input = args(process.argv.slice(2))
    if (input.operation === 'stage') {
      const result = stage(input.dbPath, { agentEmail: input.agentEmail })
      process.stdout.write(`STAGED ${result.id} ${result.token}\n`)
    } else if (input.operation === 'finalize') {
      finalize(input.dbPath, input.stageId, { agentEmail: input.agentEmail })
      process.stdout.write(`FINALIZED ${input.stageId}\n`)
    } else {
      abort(input.dbPath, input.stageId, { agentEmail: input.agentEmail })
      process.stdout.write(`ABORTED ${input.stageId}\n`)
    }
  } catch (error) {
    const message = error instanceof RecoveryError ? error.message : 'database operation failed'
    process.stderr.write(`RECOVERY_ERROR ${message}\n`)
    process.exitCode = 1
  }
}
