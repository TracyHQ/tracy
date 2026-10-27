/**
 * The global label book (docs/sre/2026-10-15-shard-beta-design.md §3.2; review amendments 4, 6): one
 * label, one site, across this master (`s0`) and every shard. A hold lasts thirty minutes and is
 * confirmed by the site existing — `site.created` from a shard, or this master's own `site` row.
 * This master's sites have no record of their own in the zone (the wildcard serves them), so the
 * `site` and `site_name` tables are read here, not the zone.
 */
import { MASTER_SHARD } from '../lib/shard-shapes.js'

export const LABEL_HOLD_MS = 30 * 60_000
export const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Hold `label` for `holder` (a shard name, or `s0` for this master), or say who has it, with the
 * reasons of docs/sre/hop-dong-cua-shard.md §5: `in_use` (a site has it), `reserved` (another holder's
 * live hold), `zone_record` (a name of the zone), `reserved_name` (a forbidden word or a shard name).
 * @param {{pool: any, config: {siteDomain: string}, zone: {has: (name: string) => Promise<boolean>},
 *   reservedLabels: Set<string>, holder: string, label: string, siteKey?: string | null, now?: () => number}} input
 */
export async function holdLabel({
  pool,
  config,
  zone,
  reservedLabels,
  holder,
  label,
  siteKey = null,
  now = Date.now
}) {
  if (reservedLabels.has(label)) return { ok: false, reason: 'reserved_name' }
  const hostname = `${label}.${config.siteDomain}`
  const own = (
    await pool.query(
      'select site_key from site where label = $1 union all select site_key from site_name where name = $2',
      [label, hostname]
    )
  ).rows[0]
  if (own && !(holder === MASTER_SHARD && own.site_key === siteKey))
    return { ok: false, reason: 'in_use', shard: MASTER_SHARD }
  const listed = (await pool.query('select site_key, shard from directory_site where label = $1', [label]))
    .rows[0]
  if (listed && !(listed.shard === holder && listed.site_key === siteKey))
    return { ok: false, reason: 'in_use', shard: listed.shard }
  if (!own && !listed && (await zone.has(hostname))) return { ok: false, reason: 'zone_record' }
  const expiresAt = new Date(now() + LABEL_HOLD_MS)
  const held = await pool.query(
    `insert into label_registry (label, holder, site_key, expires_at) values ($1, $2, $3, $4)
     on conflict (label) do update set holder = excluded.holder, site_key = excluded.site_key, expires_at = excluded.expires_at
       where label_registry.holder = excluded.holder or label_registry.expires_at < now()
     returning holder`,
    [label, holder, siteKey, expiresAt]
  )
  if (held.rowCount === 1) return { ok: true, expiresAt }
  const other = (await pool.query('select holder from label_registry where label = $1', [label])).rows[0]
  return { ok: false, reason: 'reserved', shard: other?.holder ?? null }
}
