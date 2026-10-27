// One pass over a set of manifests against one app root (the tree under test or a scratch mutant).
// ONE database of its own in the owned cluster, seeded with two tenants and every role, ONE boot of
// the app; before each door the seeded state is restored from an in-database snapshot, so a control
// request that really writes (DELETE /api/sites/{key}…) never spoils the next door's fixtures.
// Used for the real run and for each mutant of the RED proof.
import { Executor, makeRouteTable } from './exec.mjs'
import {
  bootApp,
  createRunDatabase,
  loadProduct,
  makeFingerprint,
  makeSnapshot,
  principals,
  seed,
  sender
} from './harness.mjs'

/** A control request that proves the booted app serves at all (a boot failure is never a RED). */
async function bootControl(send) {
  const r = await send({ method: 'GET', path: '/health' })
  return r.status === 200
}

/**
 * @param {{ appRoot: string, clusterUrl: string, manifests: object[], doorIndex: Map<string, object>,
 *   doorsByPath: Map<string, object[]>, exceptions: object, label: string,
 *   onProgress?: (n: number, total: number) => void }} opts
 * @returns {Promise<{ ok: boolean, bootError?: string, results: Map<string, {v: string, reason: string, observations: object[], ms: number}> }>}
 */
export async function runAgainst(opts) {
  const results = new Map()
  let database
  try {
    const product = await loadProduct(opts.appRoot)
    database = await createRunDatabase(opts.clusterUrl, product, opts.label)
    const ids = await seed(product, database.pool)
    const reset = await makeSnapshot(database.pool)
    const good = bootApp(product, database.pool)
    const send = sender(good.app)
    if (!(await bootControl(send))) return { ok: false, bootError: 'GET /health did not answer 200', results }
    let downSend = null
    const shared = {
      send,
      get downSend() {
        downSend ??= sender(bootApp(product, database.pool, { hostDown: true }).app)
        return downSend
      },
      routeTable: makeRouteTable(good.app),
      ids,
      principals: await principals(product, ids),
      fingerprint: await makeFingerprint(database.pool),
      alive: async () =>
        await database.pool.query('select 1 as ok').then(
          (r) => r.rows[0].ok === 1,
          () => false
        ),
      secretValues: ids.secretValues,
      // Door scenarios (scenarios.mjs) boot the product themselves, on this run's database.
      product,
      pool: database.pool,
      senderFor: sender,
      doorsByPath: opts.doorsByPath,
      doorIndex: opts.doorIndex,
      exceptions: opts.exceptions
    }
    const groups = new Map()
    // A door's cases share one restored state; a door scenario writes, so each starts from its own.
    const groupOf = (m) => (m.scenario ? m.id : m.itemIds[0])
    for (const m of opts.manifests) groups.set(groupOf(m), [...(groups.get(groupOf(m)) ?? []), m])
    let n = 0
    for (const [, list] of groups) {
      await reset()
      const exec = new Executor({ ...shared, history: new Map() })
      for (const manifest of list) {
        const started = Date.now()
        let outcome
        try {
          outcome = await exec.run(manifest)
        } catch (error) {
          // An exception in the harness is not a product verdict.
          outcome = {
            v: 'PENDING',
            reason: `TEST_INVALID: harness error ${error?.message ?? error}`,
            observations: []
          }
        }
        results.set(manifest.id, { ...outcome, ms: Date.now() - started })
        n += 1
        opts.onProgress?.(n, opts.manifests.length)
      }
    }
    return { ok: true, results }
  } catch (error) {
    return {
      ok: false,
      bootError: String(error?.stack ?? error)
        .split('\n')
        .slice(0, 4)
        .join(' | '),
      results
    }
  } finally {
    if (database) await database.close().catch(() => {})
  }
}
