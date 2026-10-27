/**
 * Where people live (docs/sre/2026-10-15-shard-beta-design.md §1 "directory", §2.2): rows of
 * `directory_email`, `s0` for this master. A person with no row is brand-new — the spec's
 * "shard = null" — until a shard adopts them (`adopt.js`).
 */
import { MASTER_SHARD } from '../lib/shard-shapes.js'

/** Every place this person lives, the one used last first. */
export async function placesOf(pool, email) {
  const { rows } = await pool.query(
    'select shard, used_at from directory_email where email = $1 order by used_at desc, shard',
    [email]
  )
  return rows.map((row) => ({ shard: row.shard, usedAt: row.used_at }))
}

/**
 * Where a person goes by default: this master when any row says so — nobody who works on an s0 site
 * is ever sent away (spec §2.2) — else the shard they used last, else null.
 */
export function homeOf(places) {
  if (places.length === 0) return null
  if (places.some((place) => place.shard === MASTER_SHARD)) return MASTER_SHARD
  return places[0].shard
}

/** A seat on one of this master's sites, or in one of its workspaces (staff included), in any state but revoked or declined. */
export async function holdsMasterSeat(pool, email) {
  const { rows } = await pool.query(
    `select exists (
       select 1 from account a join seat s on s.account_id = a.id
        where a.email = $1 and s.revoked_at is null and s.declined_at is null
       union all
       select 1 from account a join seat_workspace w on w.account_id = a.id
        where a.email = $1 and w.revoked_at is null and w.declined_at is null
     ) as held`,
    [email]
  )
  return rows[0].held
}

/** Write (or freshen) one place of a person. */
export async function recordHome(pool, email, shard) {
  await pool.query(
    `insert into directory_email (email, shard) values ($1, $2)
     on conflict (email, shard) do update set used_at = now()`,
    [email, shard]
  )
}

/** Whether `SHARD_ADOPT_ALLOW` (`config.shardAdoptAllow`) lets this address be moved onto a shard. */
export function adoptAllowed(allow, email) {
  if (!allow || typeof email !== 'string') return false
  if (allow.everyone) return true
  const address = email.trim().toLowerCase()
  if (allow.emails.includes(address)) return true
  return allow.domains.includes(address.slice(address.lastIndexOf('@') + 1))
}

/**
 * Where this person should be now: their home when they have one; `s0` — written down — when they
 * hold a seat on this master; `null` when they are new and the gate lets them be adopted; `s0`,
 * NOT written down, when the gate keeps them here for now.
 * @returns {Promise<string | null>}
 */
export async function destinationOf({ pool, email, allow }) {
  const home = homeOf(await placesOf(pool, email))
  if (home) return home
  if (await holdsMasterSeat(pool, email)) {
    await recordHome(pool, email, MASTER_SHARD)
    return MASTER_SHARD
  }
  return adoptAllowed(allow, email) ? null : MASTER_SHARD
}

/**
 * The shards that told this master they invited this person (`account.created {source:
 * "invitation"}`, docs/sre/hop-dong-cua-shard.md §5): the beta gate admits them like a seat invite
 * here (`lib/beta-access.js` `pendingInvites`), because the invitation lives in the shard's database.
 */
export async function shardInvitesFor(pool, email) {
  const { rows } = await pool.query(
    "select shard from directory_email where email = $1 and source = 'invitation' order by shard",
    [
      String(email ?? '')
        .trim()
        .toLowerCase()
    ]
  )
  return rows.map((row) => ({ shard: row.shard }))
}
