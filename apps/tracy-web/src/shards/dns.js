/**
 * The zone's records for shard sites, written by the MASTER only (docs/sre/2026-10-15-shard-beta-
 * design.md §3.2): `<label>.<SITE_DOMAIN>` CNAME → `<tunnel>.cfargotunnel.com`, proxied.
 * Create-if-absent and never overwrite: a name that already points elsewhere is a conflict to report,
 * not a record to take — unlike `ingress_api.py`'s `dns_record`, which PUTs over what is there.
 * The token rides in one header and is never part of an error or a log line.
 */
export const CLOUDFLARE_DNS_API = 'https://api.cloudflare.com/client/v4'

export class DnsUnavailable extends Error {
  /** @param {string} why - `TIMEOUT`, `UNREACHABLE` or `HTTP_<status>` */
  constructor(why) {
    super(`dns unavailable: ${why}`)
    this.name = 'DnsUnavailable'
    this.why = why
  }
}

export const tunnelTarget = (tunnelId) => `${tunnelId}.cfargotunnel.com`

export function cloudflareDns({
  zoneId,
  token,
  fetchImpl = fetch,
  apiBase = CLOUDFLARE_DNS_API,
  callMs = 10_000,
  pageSize = 1000
}) {
  const base = `${apiBase}/zones/${encodeURIComponent(zoneId)}/dns_records`
  async function call(method, path = '', body = undefined) {
    const signal = AbortSignal.timeout(callMs)
    let response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal
      })
    } catch {
      throw new DnsUnavailable(signal.aborted ? 'TIMEOUT' : 'UNREACHABLE')
    }
    const parsed = await response.json().catch(() => null)
    if (!response.ok || parsed?.success !== true) throw new DnsUnavailable(`HTTP_${response.status}`)
    return parsed
  }
  const shape = (r) => ({
    id: String(r.id),
    type: String(r.type),
    name: String(r.name).toLowerCase(),
    content: String(r.content).toLowerCase()
  })
  const records = async (name) =>
    ((await call('GET', `?name=${encodeURIComponent(name)}`)).result ?? []).map(shape)
  return {
    async ensureCname(name, target) {
      const found = await records(name)
      if (found.some((r) => r.type === 'CNAME' && r.content === target)) return 'present'
      if (found.length > 0) return 'conflict'
      await call('POST', '', { type: 'CNAME', name, content: target, proxied: true, ttl: 1 })
      return 'created'
    },
    async removeCname(name, target) {
      const found = await records(name)
      if (found.length === 0) return 'absent'
      const ours = found.filter((r) => r.type === 'CNAME' && r.content === target)
      if (ours.length === 0) return 'kept'
      for (const record of ours) await call('DELETE', `/${encodeURIComponent(record.id)}`)
      return 'removed'
    },
    async listAll() {
      const out = []
      for (let page = 1; ; page++) {
        const answer = await call('GET', `?per_page=${pageSize}&page=${page}`)
        out.push(...(answer.result ?? []).map(shape))
        if (page >= Number(answer.result_info?.total_pages ?? 1)) return out
      }
    }
  }
}

/**
 * Whether a name is already a record of the zone (`cowork`, `connect`, `s1`, `demo-host`…), read
 * once per `ttlMs`. A zone that cannot be read keeps answering from the last good read (empty at
 * first) and is asked again after `retryMs`, so a slow Cloudflare never holds a site create.
 */
export function zoneNames(dns, { ttlMs = 5 * 60_000, retryMs = 60_000, now = Date.now, log = console } = {}) {
  let names = null
  let until = 0
  return {
    async has(name) {
      if (!dns) return false
      if (names === null || now() >= until) {
        try {
          names = new Set((await dns.listAll()).map((record) => record.name))
          until = now() + ttlMs
        } catch (error) {
          if (!(error instanceof DnsUnavailable)) throw error
          log.warn(`[shards] the zone could not be read (${error.why}); the directory alone decides for now`)
          names ??= new Set()
          until = now() + retryMs
        }
      }
      return names.has(String(name).toLowerCase())
    },
    forget() {
      names = null
    }
  }
}
