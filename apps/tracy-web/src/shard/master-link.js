// apps/tracy-web/src/shard/master-link.js
/**
 * A shard's calls to the master (shard beta, docs/sre/hop-dong-cua-shard.md §5), each a POST signed
 * with `SHARD_SECRET` (`lib/shard-channel.js`) under `/api/shards/<this shard>/…`:
 *   labels/reserve   hold a label of the one zone before a site takes it here
 *   events           tell the master what changed here (`events-outbox.js` sends them)
 *   custom-hostname  add / read / remove a customer's own domain at Cloudflare for SaaS, which only
 *                    the master can do (`sites/site-domain-provider.js` `brokeredHostnames`)
 * In `shard/`: `sites/` never imports it — it gets these functions from the composition root
 * (`shard/node.js`, `hostnameBroker`).
 */
import { signShardRequest } from '../lib/shard-channel.js'

const CALL_MS = 10_000
/** The only ops of the master's custom-hostname door (contract §5). */
const HOSTNAME_OPS = Object.freeze(['add', 'status', 'remove'])

/**
 * One signed POST to the master. Never throws: no answer is `{ok: false, status: 0, body: null}`,
 * an answer that is not JSON has `body: null`.
 */
async function signedPost({ shard, path, payload, fetchImpl, now }) {
  const body = JSON.stringify(payload ?? {})
  const headers = signShardRequest({ secret: shard.secret, method: 'POST', path, body, now: now() })
  let response
  try {
    response = await fetchImpl(`${shard.masterOrigin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_MS)
    })
  } catch {
    return { ok: false, status: 0, body: null }
  }
  let parsed = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  return { ok: response.ok, status: response.status, body: parsed }
}

export function masterLink({ shard, fetchImpl = fetch, now = Date.now }) {
  const post = (path, payload) =>
    signedPost({ shard, path: `/api/shards/${shard.name}${path}`, payload, fetchImpl, now })
  return {
    async reserveLabel({ label, siteKey = null }) {
      const answer = await post('/labels/reserve', siteKey ? { label, siteKey } : { label })
      if (answer.ok) return { reserved: true }
      // Only the master's own word for "somebody has it" is a refusal of the name; anything else
      // (no answer, a 5xx, an answer this shard does not understand) decided nothing about it.
      if (answer.status === 409 && answer.body?.code === 'LABEL_TAKEN')
        return { taken: true, reason: typeof answer.body.reason === 'string' ? answer.body.reason : null }
      return { unavailable: true, status: answer.status }
    },
    sendEvent: (event) => post('/events', event),
    customHostname({ siteKey, domain, op }) {
      // A programming error, not an answer: the adapter of Task 14 only ever sends these three.
      if (!HOSTNAME_OPS.includes(op))
        throw new Error(`custom-hostname op must be add, status or remove, not ${op}`)
      return post('/custom-hostname', { siteKey: siteKey ?? null, domain, op })
    }
  }
}

/**
 * The custom-hostname call a shard's own-domain code needs (`sites/site-domain-provider.js`
 * `hostnamesFromConfig`), or null on the master. Built by the composition root (`node.js`,
 * `cron.js`): `sites/` may not import this domain.
 */
export function hostnameBroker(config, fetchImpl = fetch) {
  if (config?.deploymentRole !== 'shard' || !config.shard) return null
  const link = masterLink({ shard: config.shard, fetchImpl })
  return (body) => link.customHostname(body)
}
