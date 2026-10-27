/**
 * The social-stats cache's last measurement of each social profile a place links to, for its place profile, from where
 * this deployment keeps it: its own `wo_social_stat` (a deployment that collects, `standalone` or `central`), or the
 * shared authority's replica `wo_social_replica_*` (a `client`, as `social-client.js` reads it). Read-only: nothing is
 * queued, adopted or refreshed here (`social-stats.js` owns that). A profile found missing, or whose alias was
 * invalidated, gives nothing.
 */
import { parseSocialUrl } from '../domain/social-stats/handles.mjs'
import { SOCIAL_STAT_NETWORKS, statKeyOf } from './social-stats.js'

/** @typedef {{role: 'standalone' | 'central' | 'client', origin?: string | null}} SocialStatsSource */

/** @type {SocialStatsSource} */
let deploymentSource = { role: 'standalone' }

/**
 * Where this process's reads find measurements: set once by the app from `WO_SOCIAL_ROLE` and the authority's origin.
 * @param {SocialStatsSource} source
 */
export function useSocialStatsSource({ role, origin = null }) {
  deploymentSource = role === 'client' ? { role, origin } : { role }
}

/** The profile URLs a research read names: its merged profile's socials, then each social source row's page. */
function handlesOf({ profile, sources }) {
  const handles = []
  for (const [network, url] of Object.entries(profile?.socials ?? {}))
    if (typeof url === 'string') handles.push({ network, url })
  for (const row of Array.isArray(sources) ? sources : [])
    if (typeof row?.ref === 'string') handles.push({ network: row.source, url: row.ref })
  return handles.filter((h) => SOCIAL_STAT_NETWORKS.includes(h.network))
}

const providerOf = (network, provider) => (provider.includes('/') ? provider : `${network}/${provider}`)
const countOf = (v) => (v === null || v === undefined ? null : Number(v))

/**
 * `[{network, url, handle?, followers, posts?, fetchedAt, provider?}]`, one per measured profile, ordered by network and
 * url; `followers` is null when only the post count was measured.
 * @param {{ query: Function }} db @param {{ profile?: object, sources?: object[] }} read
 * @param {SocialStatsSource} [source] - the deployment's (`useSocialStatsSource`)
 */
export async function socialStatsOfRead(db, read, source = deploymentSource) {
  const urls = new Map()
  for (const h of handlesOf(read)) {
    const key = statKeyOf(h, parseSocialUrl)
    if (key && !urls.has(key)) urls.set(key, parseSocialUrl(h.url, { network: h.network })?.url ?? h.url)
  }
  const keys = [...urls.keys()]
  if (!keys.length) return []
  if (source.role === 'client') return source.origin ? replicaStats(db, source.origin, urls) : []
  const { rows } = await db.query(
    `select distinct s.stat_key, s.network, s.url, s.handle, s.followers, s.posts, s.fetched_at, s.provider
       from wo_social_stat s
      where s.fetched_at is not null and (s.followers is not null or s.posts is not null) and s.status <> 'not_found'
        and (s.stat_key = any($1)
             or s.stat_key in (select owner_key from wo_social_alias where alias_key = any($1) and invalidated_at is null))
        and not exists (select 1 from wo_social_alias a where a.owner_key = s.stat_key and a.alias_key = any($1)
                        and a.invalidated_at is not null)
      order by s.network, s.url`,
    [keys]
  )
  return rows.map((r) => ({
    network: r.network,
    url: r.url,
    ...(r.handle ? { handle: r.handle } : {}),
    followers: countOf(r.followers),
    ...(r.posts !== null && r.posts !== undefined ? { posts: Number(r.posts) } : {}),
    fetchedAt: new Date(r.fetched_at).toISOString(),
    ...(r.provider ? { provider: providerOf(r.network, r.provider) } : {})
  }))
}

/**
 * The replica of the authority this client is pinned to: each alias bound to a verified identity, one row per identity,
 * cited to the profile URL the place links to.
 * @param {{ query: Function }} db @param {string} origin @param {Map<string, string>} urls - alias key → profile URL
 */
async function replicaStats(db, origin, urls) {
  const { rows } = await db.query(
    `select a.alias_key, i.identity_key, i.network, i.snapshot, i.fetched_at
       from wo_social_replica_alias a
       join wo_social_replica_authority p on (p.origin, p.authority_id) = (a.origin, a.authority_id)
       join wo_social_replica_identity i on (i.origin, i.authority_id, i.identity_key) = (a.origin, a.authority_id, a.identity_key)
      where a.origin = $1 and a.alias_key = any($2) and a.invalidated_at is null
        and coalesce(a.state->>'status', '') <> 'not_found'
      order by a.alias_key`,
    [origin, [...urls.keys()]]
  )
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const s = r.snapshot ?? {}
    const followers = countOf(s.followers)
    const posts = countOf(s.posts)
    if (seen.has(r.identity_key) || (followers === null && posts === null)) continue
    seen.add(r.identity_key)
    out.push({
      network: r.network,
      url: urls.get(r.alias_key),
      ...(s.handle ? { handle: s.handle } : {}),
      followers,
      ...(posts !== null ? { posts } : {}),
      fetchedAt: new Date(r.fetched_at).toISOString(),
      ...(typeof s.provider === 'string' && s.provider ? { provider: providerOf(r.network, s.provider) } : {})
    })
  }
  return out.toSorted((a, b) => a.network.localeCompare(b.network) || a.url.localeCompare(b.url))
}

/** A research read with the cache's measurements, as `socialStats`; a read with none is returned as it was. */
export async function withSocialStats(db, read) {
  const socialStats = await socialStatsOfRead(db, read)
  return socialStats.length ? { ...read, socialStats } : read
}
