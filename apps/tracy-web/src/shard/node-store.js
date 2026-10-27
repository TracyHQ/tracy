// apps/tracy-web/src/shard/node-store.js
/**
 * What a shard keeps about the people the master hands it (shard beta, contract §4,
 * `123-shard-node.sql`): mirror accounts, one-time handoff tickets, and the numbers the heartbeat
 * reports. A ticket is stored only as its sha256; the nonce is the master's — this shard stores the
 * hash the master sent and sees the nonce itself only in the `tracy_handoff` cookie. Neither is
 * ever logged.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TICKET_TTL_MS = 60_000
const hash = (value) => createHash('sha256').update(value).digest('hex')
/** 32 random bytes, base64url: 43 characters, `TICKET` of lib/shard-shapes.js. */
const newTicket = () => randomBytes(32).toString('base64url')
const sameHex = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function mirrorOf(db, email) {
  const { rows } = await db.query('select * from shard_mirror where email = $1', [email])
  return rows[0] ?? null
}

/** The mirror of `email`, made once; the master's key on it may be written once and never changes. */
export async function adoptMirror(db, { email, accountId, idempotencyKey }) {
  let row
  try {
    row = (
      await db.query(
        `insert into shard_mirror (email, account_id, source, idempotency_key) values ($1, $2, 'master', $3)
         on conflict (email) do update
           set idempotency_key = coalesce(shard_mirror.idempotency_key, excluded.idempotency_key)
         returning *`,
        [email, accountId, idempotencyKey]
      )
    ).rows[0]
  } catch (error) {
    // The key already names another address's mirror.
    if (error?.code === '23505') return { conflict: true }
    throw error
  }
  return row.idempotency_key === idempotencyKey ? { mirror: row } : { conflict: true }
}

/** Whether `email` may create sites here: handed over by the master, or holding a live seat. */
export async function isMirror(db, email) {
  const { rows } = await db.query(
    `select exists (select 1 from shard_mirror where email = $1)
         or exists (select 1 from seat s join account a on a.id = s.account_id
                     where a.email = $1 and s.revoked_at is null) as ok`,
    [email]
  )
  return rows[0].ok === true
}

/**
 * A one-time ticket for `email` (contract §4 step 3): `nonceHash` is the master's sha256 of the
 * nonce it put in `tracy_handoff`; this shard makes no nonce of its own.
 */
export async function issueTicket(db, { email, nonceHash, next, now = Date.now(), ttlMs = TICKET_TTL_MS }) {
  const ticket = newTicket()
  const expiresAt = new Date(now + ttlMs)
  await db.query('delete from shard_handoff where expires_at < $1', [new Date(now - 24 * 3600 * 1000)])
  await db.query(
    'insert into shard_handoff (token_hash, email, nonce_hash, next, expires_at) values ($1, $2, $3, $4, $5)',
    [hash(ticket), email, nonceHash, next ?? null, expiresAt]
  )
  return { ticket, expiresAt }
}

/**
 * Spend the ticket in one statement (contract §4 step 5), THEN check the nonce: only the request
 * that names an unused, unexpired ticket gets its row, and the row opens only when sha256 of the
 * `tracy_handoff` cookie equals the hash the master sent. A wrong nonce leaves the ticket spent —
 * the person starts again from the master's /login, the attacker has nothing.
 */
export async function redeemTicket(db, { ticket, nonce, now = Date.now() }) {
  if (typeof ticket !== 'string' || ticket === '') return null
  const { rows } = await db.query(
    `update shard_handoff set used = true
      where token_hash = $1 and used = false and expires_at > $2
      returning email, nonce_hash, next`,
    [hash(ticket), new Date(now)]
  )
  const row = rows[0]
  if (!row || typeof nonce !== 'string' || nonce === '' || !sameHex(hash(nonce), row.nonce_hash)) return null
  return { email: row.email, next: row.next }
}

/**
 * The `next` stored with a ticket, spent or not (a failed handoff sends the person back to the
 * master asking for it again), or null when no such ticket exists. Read-only: it spends nothing.
 */
export async function ticketNext(db, ticket) {
  if (typeof ticket !== 'string' || ticket === '') return null
  const { rows } = await db.query('select next from shard_handoff where token_hash = $1', [hash(ticket)])
  return rows[0]?.next ?? null
}

/**
 * The newest migration applied, in the order `migrate` runs them (`db/index.js`: the file names,
 * JavaScript `sort()`), never SQL `max()` — the database collation may order `-`, `_` and digits
 * differently, and the master compares this name with its own (contract §6, spec §13 S24).
 * @param {string[]} names
 */
export function migrationHeadOf(names) {
  return [...names].sort().at(-1) ?? null
}

/**
 * What the heartbeat reports (contract §6). `accepting`: the catalogue was read at least once
 * (`releases_read_at`, spec §6 "Catalogue") and the local cap, if any, is not reached.
 */
export async function shardStatus(db, { maxSites = null } = {}) {
  const { rows } = await db.query(
    `select (select count(*)::int from site where not demo) as sites,
            (select max(fetched_at) from quickstart_releases) as releases_read_at`
  )
  const applied = await db.query('select name from schema_migration')
  const row = rows[0]
  const releasesReadAt = row.releases_read_at ? new Date(row.releases_read_at).toISOString() : null
  return {
    sites: row.sites,
    releases_read_at: releasesReadAt,
    migration_head: migrationHeadOf(applied.rows.map((r) => r.name)),
    accepting: releasesReadAt !== null && (maxSites === null || row.sites < maxSites)
  }
}

/**
 * Accounts made here that the master was never told about — an invitation's `ensureAccount`
 * (`seats/route.js:784`, `workspaces/route.js:363,775`): recorded as invited mirrors, once. A minute
 * old at least, so the account an adopt is making right now is never taken for one.
 */
export async function sweepUnreportedAccounts(db, { olderThanMs = 60_000, now = Date.now() } = {}) {
  const { rows } = await db.query(
    `insert into shard_mirror (email, account_id, source)
     select a.email, a.id, 'invitation' from account a
      where a.created_at < $1 and not exists (select 1 from shard_mirror m where m.email = a.email)
     on conflict (email) do nothing
     returning email, account_id`,
    [new Date(now - olderThanMs)]
  )
  return rows.map((r) => ({ email: r.email, accountId: r.account_id }))
}
