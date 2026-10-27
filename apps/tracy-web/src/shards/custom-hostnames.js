/**
 * `POST /api/shards/:name/custom-hostname` (review amendment 7; docs/sre/hop-dong-cua-shard.md §5):
 * a shard's site connects (`add`), reads (`status`) or drops (`remove`) a customer's own domain
 * through its master, which alone holds `CLOUDFLARE_SAAS_*`. The hostname is registered with
 * `custom_origin_server = <the shard's host>`, so the traffic goes straight to that shard's tunnel
 * (spec §3.4); `directory_domain` records whose it is. The row is written before Cloudflare is asked,
 * so a create whose answer is lost leaves no hostname nobody owns.
 *
 * Every op answers `{hostname, id, status, sslStatus, validationRecords: [{type, name, value}]}`; the
 * errors are the contract's three — 404 UNKNOWN_SITE, 409 DOMAIN_TAKEN {shard}, 502 CLOUDFLARE {detail}
 * — plus 400 for a body that is not one.
 */
import { MASTER_SHARD } from '../lib/shard-shapes.js'

const OPS = new Set(['add', 'remove', 'status'])
const SITE_KEY = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const text = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const answer = (status, body) => ({ status, body })
const view = (h) => ({
  hostname: h.hostname,
  id: h.id,
  status: h.status,
  sslStatus: h.sslStatus,
  validationRecords: h.records
})
/** The same shape for a hostname that is not (any more) at Cloudflare. */
const none = (hostname, status, id = null) => ({
  hostname,
  id,
  status,
  sslStatus: null,
  validationRecords: []
})
const cloudflare = (detail) => answer(502, { code: 'CLOUDFLARE', detail })
const taken = (shard) => answer(409, { code: 'DOMAIN_TAKEN', shard })

export function shardCustomHostnames({ pool, config, hostnames }) {
  async function read(domain, id) {
    const got = await hostnames.get(id)
    if (got.found) return answer(200, view(got.found))
    if (got.gone) return answer(200, none(domain, 'absent'))
    return cloudflare(`UNREADABLE:${got.error}`)
  }

  async function create(shard, domain) {
    const made = await hostnames.create(domain, { originServer: new URL(shard.origin).hostname })
    if (made.created) {
      await pool.query('update directory_domain set hostname_id = $2 where domain = $1', [
        domain,
        made.created.id
      ])
      return answer(200, view(made.created))
    }
    if (made.uncertain) return cloudflare(`UNCERTAIN:${made.uncertain}`)
    await pool.query('delete from directory_domain where domain = $1 and hostname_id is null', [domain])
    return made.duplicate ? taken(null) : cloudflare(`REFUSED:${made.refused}`)
  }

  async function add(shard, siteKey, domain, row) {
    if (row?.hostname_id) return read(domain, row.hostname_id)
    const found = await hostnames.find(domain)
    if (found.error) return cloudflare(`UNREADABLE:${found.error}`)
    if (row) {
      // An earlier add whose answer was lost: the hostname it made, if it made one, is this site's.
      if (found.found.length > 1) return cloudflare('UNREADABLE:MANY')
      if (found.found.length === 1) {
        await pool.query('update directory_domain set hostname_id = $2 where domain = $1', [
          domain,
          found.found[0].id
        ])
        return answer(200, view(found.found[0]))
      }
      return create(shard, domain)
    }
    if ((await pool.query('select 1 from site_name where name = $1', [domain])).rowCount)
      return taken(MASTER_SHARD)
    if (found.found.length > 0) return taken(null)
    const claimed = await pool.query(
      'insert into directory_domain (domain, site_key, shard) values ($1, $2, $3) on conflict do nothing',
      [domain, siteKey, shard.name]
    )
    if (claimed.rowCount === 0) {
      const holder = (await pool.query('select shard from directory_domain where domain = $1', [domain]))
        .rows[0]
      return taken(holder?.shard ?? null)
    }
    return create(shard, domain)
  }

  async function handle(shard, body) {
    const siteKey = text(body.siteKey)
    const domain = text(body.domain)
    const op = typeof body.op === 'string' ? body.op : ''
    const tracyName = domain === config.siteDomain || domain.endsWith(`.${config.siteDomain}`)
    if (!OPS.has(op) || !SITE_KEY.test(siteKey) || !DOMAIN.test(domain) || tracyName)
      return answer(400, { code: 'INVALID_REQUEST' })
    if (!hostnames) return cloudflare('NOT_CONFIGURED')
    // Another shard's site does not exist under this shard's name: the same 404 as no site at all.
    const site = (await pool.query('select shard from directory_site where site_key = $1', [siteKey])).rows[0]
    if (site?.shard !== shard.name) return answer(404, { code: 'UNKNOWN_SITE' })
    const row = (
      await pool.query('select site_key, shard, hostname_id from directory_domain where domain = $1', [
        domain
      ])
    ).rows[0]
    if (row && (row.shard !== shard.name || row.site_key !== siteKey)) return taken(row.shard)
    if (op === 'add') return add(shard, siteKey, domain, row)
    if (op === 'status')
      return row?.hostname_id ? read(domain, row.hostname_id) : answer(200, none(domain, 'absent'))
    if (row?.hostname_id) {
      const removed = await hostnames.remove(row.hostname_id)
      if (!removed.removed && !removed.gone) return cloudflare(`UNREMOVED:${removed.error}`)
    }
    await pool.query('delete from directory_domain where domain = $1', [domain])
    return answer(200, none(domain, 'deleted', row?.hostname_id ?? null))
  }

  return { handle }
}
