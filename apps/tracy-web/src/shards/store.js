/**
 * The `shard` table (docs/sre/2026-10-15-shard-beta-design.md §1; docs/sre/hop-dong-cua-shard.md
 * §8): the shards this master adopts people into and takes signed calls from. Rows come from the
 * SHARDS seed at every boot and from /ops › Shards › Add. A shard's secret is sealed in its row
 * (`lib/secret-box.js`) and opened only into this process's book; nothing here logs it.
 */
import { openSecret, sealSecret } from '../lib/secret-box.js'

const COLUMNS = Object.freeze({
  accepting: 'accepting',
  maxSites: 'max_sites',
  pinnedAppTag: 'pinned_app_tag',
  pinnedDshTag: 'pinned_dsh_tag',
  targetAppTag: 'target_app_tag',
  targetDshTag: 'target_dsh_tag'
})

/**
 * Write the seed (`SHARDS`, `config.shardSeed`) into the table at boot. What a shard IS — origin,
 * secret, tunnel, provider, region — follows SHARDS every boot (env wins, contract §8), so a rotated
 * `SHARD_<name>_SECRET` takes effect with the next deploy, over a row /ops added too. What /ops ›
 * Shards decides — accepting, the site limit, the pins, the target tags — is written only when the
 * row is new, and never again from here.
 * @returns {Promise<number>} how many rows were written or brought in step.
 */
export async function seedShards(pool, seed, sessionSecret) {
  let written = 0
  for (const row of seed) {
    const { rowCount } = await pool.query(
      `insert into shard (name, origin, secret_box, tunnel_id, provider, region, max_sites)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (name) do update set origin = excluded.origin, secret_box = excluded.secret_box,
         tunnel_id = excluded.tunnel_id, provider = excluded.provider, region = excluded.region`,
      [
        row.name,
        row.origin,
        await sealSecret(row.secret, sessionSecret),
        row.tunnelId,
        row.provider ?? null,
        row.region ?? 'unknown',
        row.maxSites ?? 200
      ]
    )
    written += rowCount
  }
  return written
}

/**
 * One new shard from /ops › Shards › Add (contract §8 (b)), already checked by `ops-routes.js`.
 * Closed to new people until /ops opens it. Never over an existing row: a taken name or origin
 * answers false and writes nothing.
 * @returns {Promise<boolean>}
 */
export async function addShard(pool, row, sessionSecret) {
  const { rowCount } = await pool.query(
    `insert into shard (name, origin, secret_box, tunnel_id, provider, region)
     values ($1, $2, $3, $4, $5, $6)
     on conflict do nothing`,
    [
      row.name,
      row.origin,
      await sealSecret(row.secret, sessionSecret),
      row.tunnelId,
      row.provider ?? null,
      row.region ?? 'unknown'
    ]
  )
  return rowCount === 1
}

function toShard(row, secret) {
  return {
    name: row.name,
    origin: row.origin,
    secret,
    tunnelId: row.tunnel_id,
    provider: row.provider,
    region: row.region,
    accepting: row.accepting,
    degradedUntil: row.degraded_until,
    maxSites: row.max_sites,
    sites: row.sites,
    pinned: Boolean(row.pinned_app_tag || row.pinned_dsh_tag),
    pinnedAppTag: row.pinned_app_tag,
    pinnedDshTag: row.pinned_dsh_tag,
    targetAppTag: row.target_app_tag,
    targetDshTag: row.target_dsh_tag,
    heartbeat: row.last_heartbeat ?? null,
    heartbeatAt: row.last_seen_at,
    migrationHead: row.migration_head,
    lowMemBeats: row.low_mem_beats,
    updateGrantedAt: row.update_granted_at,
    createdAt: row.created_at
  }
}

/**
 * Every shard with its secret opened. A secret that no longer opens (SESSION_SECRET rotated) reads
 * as null: that shard then signs nothing and verifies nothing until /ops gives it a new one.
 * @returns {Promise<Map<string, ReturnType<typeof toShard>>>}
 */
export async function readShards(pool, sessionSecret) {
  const { rows } = await pool.query('select * from shard order by name')
  const out = new Map()
  for (const row of rows) out.set(row.name, toShard(row, await openSecret(row.secret_box, sessionSecret)))
  return out
}

/**
 * The shards as this process reads them on every request that needs one — a pointer cookie, a
 * signed call — kept for `ttlMs` so a page view is not a query and a secret decrypt.
 */
export function createShardBook({ pool, sessionSecret, ttlMs = 30_000, now = Date.now }) {
  let cached = null
  let at = 0
  const all = async () => {
    if (!cached || now() - at > ttlMs) {
      cached = await readShards(pool, sessionSecret)
      at = now()
    }
    return cached
  }
  return {
    all,
    async get(name) {
      return typeof name === 'string' ? ((await all()).get(name) ?? null) : null
    },
    async byOrigin(origin) {
      for (const shard of (await all()).values()) if (shard.origin === origin) return shard
      return null
    },
    invalidate() {
      cached = null
    }
  }
}

/**
 * Change the named columns of one shard (`COLUMNS`, never anything a caller spells). A `null`
 * pinned or target tag clears it. Answers the row as stored, or null when nothing was named or no
 * such shard.
 */
export async function updateShard(pool, name, changes) {
  const keys = Object.keys(changes).filter((key) => Object.hasOwn(COLUMNS, key))
  if (keys.length === 0) return null
  const sets = keys.map((key, i) => `${COLUMNS[key]} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(`update shard set ${sets} where name = $1 returning *`, [
    name,
    ...keys.map((key) => changes[key])
  ])
  return rows[0] ?? null
}

/**
 * A shard that failed an adopt is passed over until `until`, or its next good heartbeat if that
 * comes first (spec §4.2; `check.js` clears the mark).
 */
export async function markDegraded(pool, name, until) {
  await pool.query('update shard set degraded_until = $2 where name = $1', [name, until])
}

/**
 * One heartbeat in (`check.js`, already read field by field): kept as the shard's last word
 * (`last_heartbeat`, `last_seen_at`, `sites`, `migration_head`). A good one forgives a failed adopt
 * (spec §4.2: "until its next good heartbeat"); one that could not read its counts (`degraded`)
 * passes the shard over for `degradedMs` more (contract §7). Beats in a row at or under
 * `lowMemoryMb` are counted. Answers the row as stored, or null for no such shard.
 */
export async function recordHeartbeat(
  pool,
  name,
  beat,
  { lowMemoryMb, degraded, degradedMs, now = Date.now() }
) {
  const low = typeof beat.mem_available_mb === 'number' && beat.mem_available_mb <= lowMemoryMb
  // `last_seen_at` and `degraded_until` are written on the clock that reads them back (`eligible`,
  // `sweepSilentShards`: the injected JS `now`), never on SQL `now()`.
  const { rows } = await pool.query(
    `update shard set last_heartbeat = $2, last_seen_at = $8::timestamptz, sites = $3, migration_head = $4,
       degraded_until = case when $5::boolean then $8::timestamptz + $6::int * interval '1 millisecond' else null end,
       low_mem_beats = case when $7::boolean then low_mem_beats + 1 else 0 end
     where name = $1 returning *`,
    [name, beat, beat.sites, beat.migration_head, degraded, degradedMs, low, new Date(now)]
  )
  return rows[0] ?? null
}

/** Stop a shard taking new people (spec §4.1). True only for the call that closed it. */
export async function closeShard(pool, name) {
  const { rowCount } = await pool.query('update shard set accepting = false where name = $1 and accepting', [
    name
  ])
  return rowCount === 1
}
