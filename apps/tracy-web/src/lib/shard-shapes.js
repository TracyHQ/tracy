/**
 * The shapes the shard beta agrees on in every file that reads them (docs/sre/hop-dong-cua-shard.md
 * §1, §2, §8; docs/sre/2026-10-15-shard-beta-design.md): configuration, the `shard` table, the /ops
 * doors, the event and check doors, and the shard half (W2), the fleet scripts (W5) and the
 * installer, which take the SAME regexes from here. One copy, so a name `config.js` accepts is never
 * one the table, a shard or `host-dsh-init.sh` refuses.
 */

/** The name directory rows use for THIS master — the sites that were here before shards. */
export const MASTER_SHARD = 's0'
export const SHARD_NAME = /^[a-z][a-z0-9]{0,15}$/
/** An event a shard sends its master (`POST /api/shards/:name/events`): 16 random bytes, hex. */
export const EVENT_ID = /^[0-9a-f]{32}$/
/** A one-time handoff ticket a shard answers `/_shard/adopt` with: 32 random bytes, base64url. */
export const TICKET = /^[A-Za-z0-9_-]{43}$/
/** The marker a shard puts on the master's `/login?next=` URL after a handoff that did not open. */
export const HANDOFF_FAILED_PARAM = 'handoff'
export const HANDOFF_FAILED_VALUE = 'failed'
/** A shard channel secret: 32 bytes, hex — what `openssl rand -hex 32` prints. */
export const SHARD_SECRET = /^[0-9a-f]{64}$/
export const TUNNEL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const SHARD_REGIONS = Object.freeze(['asia', 'america', 'europe', 'unknown'])
/** A container image tag, as `docker tag` accepts it. */
export const IMAGE_TAG = /^[A-Za-z0-9_.-]{1,128}$/

/**
 * `https://s1.tracy.ai` from what a person typed, or null: an http(s) origin and nothing after it,
 * because every door appends its own path to it.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function shardOriginOf(raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null
  return url.origin
}
