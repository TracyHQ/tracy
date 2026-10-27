/**
 * The master's two shard sweeps (docs/sre/2026-10-15-shard-beta-design.md §3.2, §5), each under its
 * own `pg_try_advisory_lock` so a replica that loses the race skips the tick (as `cron.js` does):
 *   - every minute, a shard heard from before and silent past three minutes is told to the ops topic,
 *     once per silence (the dedupe key carries its last heartbeat);
 *   - every hour, the zone is brought in step with the directory: a missing record written, one that
 *     points elsewhere flagged (never overwritten), an unfinished delete finished, and an orphan — a
 *     one-label name pointing at a shard's tunnel that no site, live hold or shard name accounts
 *     for — removed. The zone is read BEFORE the directory, so a site made meanwhile is never an
 *     orphan. Lapsed label holds are cleared on every pass.
 */
import { DnsUnavailable, tunnelTarget } from './dns.js'
import { SILENT_AFTER_MS } from './pick.js'

export const SILENT_LOCK_ID = 7_243_018
export const RECONCILE_LOCK_ID = 7_243_019

async function underLock(pool, lockId, fn) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [lockId])
    if (!rows[0].got) return { ran: false }
    try {
      return { ran: true, ...(await fn()) }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [lockId]).catch(() => {})
    }
  } finally {
    client.release()
  }
}

export function sweepSilentShards({ pool, signal = null, now = Date.now }) {
  return underLock(pool, SILENT_LOCK_ID, async () => {
    const { rows } = await pool.query(
      'select name, last_seen_at from shard where last_seen_at is not null and last_seen_at < $1 order by name',
      [new Date(now() - SILENT_AFTER_MS)]
    )
    for (const row of rows) {
      const since = row.last_seen_at.toISOString()
      await signal?.record('shard.silent', {
        data: { shard: row.name, since },
        dedupeKey: `silent:${row.name}:${since}`
      })
    }
    return { silent: rows.map((row) => row.name) }
  })
}

export function reconcileDns({ pool, config, dns, signal = null }) {
  return underLock(pool, RECONCILE_LOCK_ID, async () => {
    await pool.query('delete from label_registry where expires_at < now()')
    if (!dns) return { dns: 'off' }
    let zone
    try {
      zone = await dns.listAll()
    } catch (error) {
      if (error instanceof DnsUnavailable) return { dns: 'unavailable' }
      throw error
    }
    const named = new Map()
    for (const record of zone) named.set(record.name, [...(named.get(record.name) ?? []), record])
    const shards = (await pool.query('select name, origin, tunnel_id from shard')).rows
    const tunnelOf = new Map(shards.map((shard) => [shard.name, tunnelTarget(shard.tunnel_id)]))
    const sites = (
      await pool.query('select site_key, label, shard, dns_state from directory_site order by site_key')
    ).rows
    const counts = { created: 0, ok: 0, conflicts: 0, removed: 0, orphans: 0 }
    const accounted = new Set()
    try {
      for (const site of sites) {
        const hostname = `${site.label}.${config.siteDomain}`
        const target = tunnelOf.get(site.shard)
        const records = named.get(hostname) ?? []
        accounted.add(hostname)
        if (site.dns_state === 'removing') {
          await dns.removeCname(hostname, target)
          await pool.query("delete from directory_site where site_key = $1 and dns_state = 'removing'", [
            site.site_key
          ])
          counts.removed += 1
          continue
        }
        let state = 'ok'
        if (records.some((r) => r.type === 'CNAME' && r.content === target)) counts.ok += 1
        else if (records.length > 0) state = 'conflict'
        else if ((await dns.ensureCname(hostname, target)) === 'conflict') state = 'conflict'
        else counts.created += 1
        if (state === 'conflict') {
          counts.conflicts += 1
          await signal?.record('shard.dns_conflict', {
            data: { shard: site.shard, hostname },
            dedupeKey: `dns:${hostname}`
          })
        }
        if (state !== site.dns_state)
          await pool.query(
            'update directory_site set dns_state = $2, updated_at = now() where site_key = $1',
            [site.site_key, state]
          )
      }
      const held = (await pool.query('select label from label_registry where expires_at > now()')).rows
      for (const row of held) accounted.add(`${row.label}.${config.siteDomain}`)
      for (const shard of shards) accounted.add(new URL(shard.origin).hostname)
      const tunnels = new Set(tunnelOf.values())
      const suffix = `.${config.siteDomain}`
      for (const record of zone) {
        if (record.type !== 'CNAME' || !tunnels.has(record.content) || accounted.has(record.name)) continue
        if (!record.name.endsWith(suffix) || record.name.slice(0, -suffix.length).includes('.')) continue
        if ((await dns.removeCname(record.name, record.content)) === 'removed') counts.orphans += 1
      }
    } catch (error) {
      if (error instanceof DnsUnavailable) return { dns: 'unavailable', ...counts }
      throw error
    }
    return { dns: 'read', ...counts }
  })
}
