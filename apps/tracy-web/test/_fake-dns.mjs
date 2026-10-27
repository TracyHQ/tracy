// Test-only: Cloudflare's `/zones/{zone}/dns_records` in memory, for the master's DNS writes.
//   dns.records  id → { id, type, name, content, proxied }
//   dns.calls    every call as `METHOD path?query`
//   dns.down     true → every call answers 503
import { cloudflareDns } from '../src/shards/dns.js'

export const DNS_ZONE = 'f'.repeat(32)
export const DNS_TOKEN = 'dns-token-never-printed'

export function fakeDns({ pageSize = 1000 } = {}) {
  let seq = 0
  const dns = { records: new Map(), calls: [], down: false }
  dns.seed = (name, content, type = 'CNAME') => {
    const id = `r${++seq}`
    dns.records.set(id, { id, type, name, content, proxied: true })
    return id
  }
  dns.fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    dns.calls.push(`${method} ${url.pathname}${url.search}`)
    const reply = (status, body) => Response.json(body, { status })
    if (dns.down) return reply(503, { success: false, errors: [{ code: 1000 }] })
    if (new Headers(init.headers).get('authorization') !== `Bearer ${DNS_TOKEN}`)
      return reply(403, { success: false })
    const base = `/client/v4/zones/${DNS_ZONE}/dns_records`
    if (!url.pathname.startsWith(base)) return reply(404, { success: false })
    const id = decodeURIComponent(url.pathname.slice(base.length).replace(/^\//, ''))
    if (method === 'GET') {
      const name = url.searchParams.get('name')
      const all = [...dns.records.values()].filter((r) => !name || r.name === name)
      const per = Number(url.searchParams.get('per_page') ?? 100)
      const page = Number(url.searchParams.get('page') ?? 1)
      return reply(200, {
        success: true,
        result: all.slice((page - 1) * per, page * per),
        result_info: { page, per_page: per, total_pages: Math.max(1, Math.ceil(all.length / per)) }
      })
    }
    if (method === 'POST') {
      const made = { id: `r${++seq}`, ...JSON.parse(init.body) }
      dns.records.set(made.id, made)
      return reply(200, { success: true, result: made })
    }
    if (method === 'DELETE') {
      dns.records.delete(id)
      return reply(200, { success: true, result: { id } })
    }
    return reply(405, { success: false })
  }
  dns.client = cloudflareDns({ zoneId: DNS_ZONE, token: DNS_TOKEN, fetchImpl: dns.fetchImpl, pageSize })
  dns.names = () => [...dns.records.values()].map((r) => `${r.type} ${r.name} ${r.content}`).sort()
  return dns
}
