/** A deployment replica. This module has no credential runtime or provider worker. */
import { randomUUID } from 'node:crypto'
import { statKeyOf } from './social-stats.js'
import { SOCIAL_SERVICE_BASE, validSocialFence } from './social-service.js'
import { applySocialEnvelope, readSocialReplica } from './social-replica.js'
import { createDurableQueue } from './durable-queue.js'

export { socialOrigin } from './wo-social-auth.js'
import { socialOrigin } from './wo-social-auth.js'
async function boundedJson(response) {
  if (!response.ok) throw new Error(`Shared social HTTP ${response.status}`)
  const reader = response.body.getReader(),
    parts = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 256000) throw new Error('Shared social response too large')
      parts.push(value)
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'))
  } finally {
    await reader.cancel().catch(() => {})
  }
}
export function createSocialClient({
  pool,
  domain,
  origin,
  token,
  fetchImpl = fetch,
  now = Date.now,
  log = console,
  switchOn = async () => true
}) {
  const remote = socialOrigin(origin)
  const domainOf = typeof domain === 'function' ? domain : async () => domain
  const queue = createDurableQueue({
    pool,
    table: 'wo_social_outbox',
    keyColumn: 'outbox_key',
    notBeforeColumn: 'next_retry_at',
    name: 'social-replica',
    now,
    run: send,
    enabled: async () => !!remote && !!token && (await cutoverReady()) && (await switchOn()),
    maxAttempts: 1000000,
    hourlyCap: 200,
    log
  })
  async function cutoverReady() {
    // Never overlap a previous deployment collector's queued or uncertain paid work with the authority.
    const result = await pool.query(`select exists(select 1 from wo_social_stat where status='queued' or
      apify_attempt->>'phase' in ('planned','reserved','starting','running','start_uncertain','publishing')) as pending`)
    return !result.rows[0].pending
  }
  async function call(path, body) {
    if (!remote || !token) throw new Error('Shared social is not configured')
    const signal = AbortSignal.timeout(12000)
    return boundedJson(
      await fetchImpl(`${remote}${SOCIAL_SERVICE_BASE}${path}`, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal
      })
    )
  }
  async function normalise(handles) {
    const dom = await domainOf(),
      valid = new Map(),
      invalid = {}
    for (const h of handles) {
      const key = statKeyOf(h, dom.parseSocialUrl)
      if (!key) {
        if (typeof h?.url === 'string') invalid[h.url] = { status: 'not_found', error: 'not_a_profile' }
        continue
      }
      if (valid.has(key)) {
        valid.get(key).originalUrls.push(h.url)
        continue
      }
      valid.set(key, {
        aliasKey: key,
        network: h.network,
        url: dom.parseSocialUrl(h.url, { network: h.network }).url,
        originalUrls: [h.url],
        originalUrl: h.url
      })
    }
    return { valid, invalid }
  }
  async function sync(valid) {
    if (!valid.size) return null
    try {
      const envelope = await call('/lookup', {
        handles: [...valid.values()].map(({ network, url }) => ({ network, url }))
      })
      await applySocialEnvelope({ pool, origin: remote, envelope, expected: valid, now: now() })
      return null
    } catch (e) {
      return e.code === 'SOCIAL_AUTHORITY_CHANGED'
        ? 'shared_social_authority_changed'
        : 'shared_social_unavailable'
    }
  }
  function expandOriginalUrls(result, valid) {
    for (const h of valid.values())
      for (const url of h.originalUrls ?? []) {
        const value = result[h.originalUrl ?? h.url]
        if (value) result[url] = { ...value, ...(value.url ? { url } : {}) }
      }
    return result
  }
  async function queuedOverlay(result, valid, error) {
    if (!error && remote) {
      const rows = (
        await pool.query(
          "select alias_key from wo_social_outbox where origin=$1 and status='queued' and alias_key=any($2)",
          [remote, [...valid.keys()]]
        )
      ).rows
      for (const row of rows) {
        const h = valid.get(row.alias_key)
        result[h.originalUrl ?? h.url] = { ...result[h.originalUrl ?? h.url], status: 'queued' }
      }
    }
    return expandOriginalUrls(result, valid)
  }
  async function lookup(handles) {
    const { valid, invalid } = await normalise(handles)
    const error = await sync(valid)
    return {
      ...(await queuedOverlay(
        await readSocialReplica(pool, remote ?? origin ?? 'unconfigured', valid, now(), error),
        valid,
        error
      )),
      ...invalid
    }
  }
  async function request(handles, { force = false, limit = Infinity } = {}) {
    const { valid, invalid } = await normalise(handles)
    let error = await sync(valid)
    const ready = await cutoverReady().catch(() => false)
    if (!ready) error = 'shared_social_cutover_required'
    let count = 0
    const skipped = new Set()
    const pin = remote
      ? (await pool.query('select authority_id from wo_social_replica_authority where origin=$1', [remote]))
          .rows[0]
      : null
    if (remote && token && ready && pin && error !== 'shared_social_authority_changed') {
      for (const h of valid.values()) {
        const cached = (
          await pool.query(
            'select state,observed_at from wo_social_replica_alias where origin=$1 and alias_key=$2',
            [remote, h.aliasKey]
          )
        ).rows[0]
        const expired = cached?.observed_at && now() - new Date(cached.observed_at).getTime() >= 7 * 86400000
        if (!force && !error && cached?.state?.refreshNeeded === false && !expired) continue
        if (count >= limit) {
          skipped.add(h.originalUrl ?? h.url)
          continue
        }
        if (!validSocialFence(cached?.state?.refreshFence)) continue
        const id = randomUUID()
        await pool.query(
          `insert into wo_social_outbox(outbox_key,origin,operation_id,alias_key,network,url,force,status,queued_at,authority_id,expected_fence)
          values($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,$10) on conflict(origin,alias_key) where status='queued' do nothing`,
          [
            `${remote}:${id}`,
            remote,
            id,
            h.aliasKey,
            h.network,
            h.url,
            force,
            new Date(now()),
            pin.authority_id,
            cached.state.refreshFence
          ]
        )
        count++
      }
      // Persist before transport. An uncertain HTTP result retries this UUID with exponential backoff.
      await queue.tick()
    }
    const result = await queuedOverlay(
      await readSocialReplica(pool, remote ?? origin ?? 'unconfigured', valid, now(), error),
      valid,
      error
    )
    for (const url of skipped) result[url] = { status: 'not_queued' }
    return { ...expandOriginalUrls(result, valid), ...invalid }
  }
  async function send(row, lease) {
    // Outbox entries belong to a fixed origin; changing config never sends an old ID to a new authority.
    if (row.origin !== remote)
      return lease.finish({ status: 'failed', error: 'origin_changed', checked_at: new Date(now()) })
    try {
      const result = await call('/refresh', {
        operationId: row.operation_id,
        authorityId: row.authority_id,
        expectedFence: row.expected_fence,
        handle: { network: row.network, url: row.url },
        force: row.force
      })
      if (
        result.operationId !== row.operation_id ||
        result.aliasKey !== row.alias_key ||
        !['admitted', 'joined', 'fresh', 'superseded', 'uncertain'].includes(result.admission)
      )
        throw new Error('Invalid shared operation receipt')
      const error = await sync(
        new Map([[row.alias_key, { aliasKey: row.alias_key, network: row.network, url: row.url }]])
      )
      if (error) throw new Error('Shared observation unavailable after admission')
      await lease.finish({ status: 'done', remote_result: result, error: null, checked_at: new Date(now()) })
    } catch {
      await lease.finish({
        status: 'queued',
        error: 'shared_social_unavailable',
        next_retry_at: new Date(now() + Math.min(3600000, 1000 * 2 ** Math.min(row.attempts, 12)))
      })
    }
  }
  return { lookup, request, tick: queue.tick, drain: queue.drain, start: queue.start, stop: queue.stop }
}

/** Rich social content has no shared contract yet. Stored research remains readable. */
export function replicaSocialDomain(domain) {
  return {
    ...domain,
    connectorsFor(env) {
      const connectors = domain.connectorsFor(env)
      for (const source of ['facebook', 'instagram', 'tiktok', 'youtube'])
        connectors[source] = {
          available: false,
          reason: 'shared_social_required',
          async collect() {
            return {
              source,
              status: 'blocked',
              reason: 'shared_social_required',
              cursor: null,
              posts: [],
              media: [],
              coverage: { fetched: 0 }
            }
          }
        }
      return connectors
    }
  }
}
