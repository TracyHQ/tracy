/**
 * Running a shared research hub (ADR 0036 Phase 3) inside a server: the intake and read doors under `/hub/v1`, and the
 * two background ticks that turn contributions into published snapshots.
 *
 *   hub verify   decides pending observations against the hub's own read of their source (`verify-queue.js`)
 *   hub publish  links verified businesses to a place, then rebuilds every place whose evidence moved (`materializeDirty`)
 *
 * A business is linked only once the hub itself read it at its source and accepted an observation about it: a
 * contribution alone never creates a place.
 */
import { Hono } from 'hono'
import { hubIntakeRoutes } from './intake-routes.js'
import { materializeDirty, POLICY_VERSION } from './materialize.js'
import { createHubQuota } from './quota.js'
import { hubReadRoutes } from './read-routes.js'
import { createHubTokens } from './tokens.js'
import { createGooglePlacesAdapter, createVerifyQueue } from './verify-queue.js'

// Namespaces a place identity may have (`wo_place_identity`); a subject in any other is never linked.
const LINKABLE_NAMESPACES = ['google', 'osm']

/**
 * Accepted subjects with no place yet get one: a place, its identity and its hub row (which marks it to be built).
 * Serialised per identity with the same lock `places.js resolvePlace` takes, so research and the hub make one place.
 * @returns {Promise<number>} how many places were made
 */
export async function linkVerifiedSubjects(pool, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `select o.subject_namespace as namespace, o.subject_external_id as external_id,
            (array_agg(o.value #>> '{}' order by o.decided_at desc) filter (where o.field = 'name'))[1] as name
       from wo_hub_observation o
      where o.status = 'accepted' and o.subject_namespace = any($2)
        and not exists (select 1 from wo_place_identity i
                         where i.namespace = o.subject_namespace and i.external_id = o.subject_external_id)
        and not exists (select 1 from wo_hub_suppressed_identity x
                         where x.namespace = o.subject_namespace and x.external_id = o.subject_external_id)
      group by 1, 2 limit $1`,
    [limit, LINKABLE_NAMESPACES]
  )
  let made = 0
  for (const r of rows) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `wo_place:${r.namespace}:${r.external_id}`
      ])
      const known = await client.query(
        'select 1 from wo_place_identity where namespace = $1 and external_id = $2',
        [r.namespace, r.external_id]
      )
      if (!known.rowCount) {
        const placeId = (
          await client.query('insert into wo_place (display_name) values ($1) returning id', [r.name ?? null])
        ).rows[0].id
        await client.query(
          `insert into wo_place_identity (namespace, external_id, place_id, source) values ($1, $2, $3, 'hub')`,
          [r.namespace, r.external_id, placeId]
        )
        await client.query(
          'insert into wo_hub_place (place_id) values ($1) on conflict (place_id) do nothing',
          [placeId]
        )
        made++
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  return made
}

/**
 * @param {{ pool: import('pg').Pool, host: object, config: { origin?: string }, ledger: object,
 *   googleKey: () => Promise<string | null | undefined>, fetchImpl?: typeof fetch, resolve?: Function,
 *   objects?: { get: (key: string) => Promise<Response | null> } | null, quotaLimits?: object,
 *   now?: () => number, log?: Console }} deps
 * @returns {{ routes: Hono, ticks: { ms: number, name: string, run: () => Promise<object> }[] }}
 */
export function createHubService({
  pool,
  host,
  config,
  ledger,
  googleKey,
  fetchImpl,
  resolve,
  objects,
  quotaLimits,
  now = Date.now,
  log = console
}) {
  const tokens = createHubTokens({ pool })
  const quota = createHubQuota({ pool, limits: quotaLimits, now })
  const routes = new Hono()
  routes.route('/', hubIntakeRoutes({ pool, host, config, tokens, quota, now }))
  routes.route('/', hubReadRoutes({ pool, host, tokens, quota, objects: objects ?? undefined, now }))
  const verify = createVerifyQueue({
    pool,
    adapters: [createGooglePlacesAdapter({ googleKey, fetch: fetchImpl, resolve })],
    ledger,
    now,
    log
  })
  return {
    routes,
    ticks: [
      { ms: 10_000, name: 'hub verify', run: () => verify.tick() },
      {
        ms: 10_000,
        name: 'hub publish',
        run: async () => {
          const linked = await linkVerifiedSubjects(pool)
          return { linked, ...(await materializeDirty(pool, POLICY_VERSION)) }
        }
      }
    ]
  }
}
