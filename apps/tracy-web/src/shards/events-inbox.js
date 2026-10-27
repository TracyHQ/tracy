/**
 * `POST /api/shards/:name/events` (docs/sre/2026-10-15-shard-beta-design.md §4.4; review amendments
 * 6, 7; docs/sre/hop-dong-cua-shard.md §5): what a shard tells its master about the people and sites
 * it holds. The envelope is `{eventId (32 hex), kind, at, data}`; the kinds are a closed set —
 * `site.created`, `site.deleted`, `site.renamed`, `account.created` — and anything else (`domain.*`,
 * `email.changed`, `account.deleted`) is BAD_EVENT. One event per call, answered once per `eventId` —
 * a replay gets the first answer, a 200 marked `duplicate`. A shard speaks only for its own sites
 * (403 SCOPE). `site.*` writes or removes `<label>.<SITE_DOMAIN>` → the shard's tunnel,
 * create-if-absent; a zone that cannot be reached now answers `dns: pending`, which the hourly
 * reconcile (`reconcile.js`) keeps. Own domains are not events: `custom-hostnames.js` owns them.
 * (The shard half's sender is `src/shard/events-outbox.js`; this file is the inbox.)
 */
import { EVENT_ID, MASTER_SHARD } from '../lib/shard-shapes.js'
import { DnsUnavailable, tunnelTarget } from './dns.js'
import { DNS_LABEL } from './labels.js'

const SITE_KEY = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PLATFORMS = new Set(['wordpress', 'joomla', 'emdash'])
const SOURCES = new Set(['adopt', 'invitation', 'seed'])
/**
 * How many `account.created {source: "invitation"}` rows one shard may add to the directory per hour
 * (contract §5: "K times / hour / shard", K left to W1, whose plan gives none) — 50 here. Each one opens
 * the beta gate for an address, so a shard that went rogue could otherwise open it for anybody.
 */
export const INVITATIONS_PER_HOUR = 50
const text = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const answer = (status, body) => ({ status, body })
const BAD_EVENT = answer(400, { code: 'BAD_EVENT' })
const SCOPE = answer(403, { code: 'SCOPE' })
const RATE_LIMITED = answer(429, { code: 'RATE_LIMITED' })
const stateOf = (done) =>
  done === 'created' || done === 'present' ? 'ok' : done === 'conflict' ? 'conflict' : 'pending'

export function shardEvents({ pool, config, dns, hostnames = null, signal = null }) {
  const hostname = (label) => `${label}.${config.siteDomain}`

  /** `label` → the shard's tunnel: created | present | conflict (told to the ops topic) | pending | off. */
  async function point(shard, label) {
    if (!dns) return 'off'
    let done
    try {
      done = await dns.ensureCname(hostname(label), tunnelTarget(shard.tunnelId))
    } catch (error) {
      if (error instanceof DnsUnavailable) return 'pending'
      throw error
    }
    if (done === 'conflict')
      await signal?.record('shard.dns_conflict', {
        data: { shard: shard.name, hostname: hostname(label) },
        dedupeKey: `dns:${hostname(label)}`
      })
    return done
  }

  /** `label` off the shard's tunnel: removed | absent | kept (points elsewhere) | pending | off. */
  async function unpoint(shard, label) {
    if (!dns) return 'off'
    try {
      return await dns.removeCname(hostname(label), tunnelTarget(shard.tunnelId))
    } catch (error) {
      if (error instanceof DnsUnavailable) return 'pending'
      throw error
    }
  }

  /** Who else has `label`: this master's sites, another directory site, another holder's live hold. */
  async function labelOwner(label, siteKey, shard) {
    const own = await pool.query(
      'select 1 from site where label = $1 union all select 1 from site_name where name = $2',
      [label, hostname(label)]
    )
    if (own.rowCount) return MASTER_SHARD
    const listed = (await pool.query('select shard, site_key from directory_site where label = $1', [label]))
      .rows[0]
    if (listed && (listed.shard !== shard.name || listed.site_key !== siteKey)) return listed.shard
    const held = (
      await pool.query(
        'select holder from label_registry where label = $1 and holder <> $2 and expires_at > now()',
        [label, shard.name]
      )
    ).rows[0]
    return held?.holder ?? null
  }

  /** A deleted site's own domains: each custom hostname is deleted at Cloudflare, then its row. */
  async function dropDomains(siteKey) {
    const { rows } = await pool.query(
      'select domain, hostname_id from directory_domain where site_key = $1',
      [siteKey]
    )
    for (const row of rows) {
      if (row.hostname_id) {
        if (!hostnames) continue
        const removed = await hostnames.remove(row.hostname_id)
        if (!removed.removed && !removed.gone) continue
      }
      await pool.query('delete from directory_domain where domain = $1', [row.domain])
    }
  }

  /** The label is someone else's: told to the ops topic once per shard and label (contract §5). */
  async function labelTaken(shard, label, owner) {
    await signal?.record('shard.label_conflict', {
      data: { shard: shard.name, label, holder: owner },
      dedupeKey: `label:${shard.name}:${label}`
    })
    return answer(409, { code: 'LABEL_TAKEN', shard: owner })
  }

  const KINDS = {
    async 'site.created'(shard, data) {
      const siteKey = text(data.siteKey)
      const label = text(data.label)
      if (!SITE_KEY.test(siteKey) || !DNS_LABEL.test(label)) return BAD_EVENT
      const listed = (await pool.query('select shard from directory_site where site_key = $1', [siteKey]))
        .rows[0]
      if (listed && listed.shard !== shard.name) return SCOPE
      const owner = await labelOwner(label, siteKey, shard)
      if (owner) return labelTaken(shard, label, owner)
      await pool.query(
        `insert into directory_site (site_key, label, shard, platform) values ($1, $2, $3, $4)
         on conflict (site_key) do update set label = excluded.label, platform = excluded.platform, updated_at = now()`,
        [siteKey, label, shard.name, PLATFORMS.has(text(data.platform)) ? text(data.platform) : null]
      )
      await pool.query('delete from label_registry where label = $1', [label])
      // A name pointing elsewhere is the master's to sort out (alert from `point`): the site is listed.
      const done = await point(shard, label)
      await pool.query('update directory_site set dns_state = $2, updated_at = now() where site_key = $1', [
        siteKey,
        stateOf(done)
      ])
      return answer(200, { ok: true, dns: done })
    },

    async 'site.deleted'(shard, data) {
      const siteKey = text(data.siteKey)
      const label = text(data.label)
      if (!SITE_KEY.test(siteKey) || !DNS_LABEL.test(label)) return BAD_EVENT
      const row = (await pool.query('select label, shard from directory_site where site_key = $1', [siteKey]))
        .rows[0]
      // Never listed here (its site.created was refused, or lost): only this shard's own record goes.
      if (!row) return answer(200, { ok: true, dns: await unpoint(shard, label) })
      if (row.shard !== shard.name) return SCOPE
      await dropDomains(siteKey)
      await pool.query(
        "update directory_site set dns_state = 'removing', updated_at = now() where site_key = $1",
        [siteKey]
      )
      const done = await unpoint(shard, row.label)
      if (done !== 'pending') await pool.query('delete from directory_site where site_key = $1', [siteKey])
      return answer(200, { ok: true, dns: done })
    },

    async 'site.renamed'(shard, data) {
      const siteKey = text(data.siteKey)
      const from = text(data.from)
      const to = text(data.to)
      if (!SITE_KEY.test(siteKey) || !DNS_LABEL.test(from) || !DNS_LABEL.test(to)) return BAD_EVENT
      const row = (await pool.query('select label, shard from directory_site where site_key = $1', [siteKey]))
        .rows[0]
      if (!row || row.shard !== shard.name) return SCOPE
      if (row.label === to) return answer(200, { ok: true, dns: 'present' })
      const owner = await labelOwner(to, siteKey, shard)
      if (owner) return labelTaken(shard, to, owner)
      // The new name first. The shard owns its site's label: a `from` that is not the label listed
      // here (an event lost on the way) does not stop the rename — the listed label is what goes.
      const done = await point(shard, to)
      await pool.query(
        'update directory_site set label = $2, dns_state = $3, updated_at = now() where site_key = $1',
        [siteKey, to, stateOf(done)]
      )
      await pool.query('delete from label_registry where label = $1', [to])
      return answer(200, { ok: true, dns: done, previous: await unpoint(shard, row.label) })
    },

    async 'account.created'(shard, data) {
      const email = text(data.email)
      const source = text(data.source)
      if (!EMAIL.test(email) || !SOURCES.has(source)) return BAD_EVENT
      if (source === 'invitation') {
        const { rows } = await pool.query(
          `select count(*)::int as n from directory_email
            where shard = $1 and source = 'invitation' and created_at > now() - interval '1 hour'`,
          [shard.name]
        )
        if (rows[0].n >= INVITATIONS_PER_HOUR) {
          await signal?.record('shard.invitation_flood', {
            data: { shard: shard.name, limit: INVITATIONS_PER_HOUR },
            dedupeKey: `invitations:${shard.name}:${Math.floor(Date.now() / 3_600_000)}`
          })
          return RATE_LIMITED
        }
      }
      // Never over a row already there: a person this master adopted keeps `source = 'master'`. The
      // row is stamped with the epoch, so it never becomes the person's HOME (`directory.js`
      // `homeOf` takes the latest `used_at`; contract §5: the event only ADDS the shard to the list).
      // The shard becomes home when the person is actually sent there (`recordHome` freshens it).
      await pool.query(
        `insert into directory_email (email, shard, source, used_at)
         values ($1, $2, $3, timestamptz 'epoch') on conflict (email, shard) do nothing`,
        [email, shard.name, source]
      )
      return answer(200, { ok: true })
    }
  }

  async function handle(shard, body) {
    const eventId = typeof body.eventId === 'string' ? body.eventId : ''
    const kind = typeof body.kind === 'string' ? body.kind : ''
    const sentAt = typeof body.at === 'string' ? Date.parse(body.at) : Number.NaN
    const data = body.data
    if (
      !EVENT_ID.test(eventId) ||
      !Object.hasOwn(KINDS, kind) ||
      !Number.isFinite(sentAt) ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    )
      return BAD_EVENT
    const seen = (
      await pool.query('select status, outcome from shard_event where shard = $1 and event_id = $2', [
        shard.name,
        eventId
      ])
    ).rows[0]
    if (seen)
      return answer(seen.status, seen.status === 200 ? { ...seen.outcome, duplicate: true } : seen.outcome)
    const result = await KINDS[kind](shard, data)
    // A 400 is a bad event and a 429 a "later" the shard's outbox retries under the same id: neither is remembered.
    if (result.status !== 400 && result.status !== 429)
      await pool.query(
        `insert into shard_event (shard, event_id, kind, sent_at, status, outcome) values ($1, $2, $3, $4, $5, $6)
         on conflict do nothing`,
        [shard.name, eventId, kind, new Date(sentAt), result.status, result.body]
      )
    return result
  }

  return { handle }
}
