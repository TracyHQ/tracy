/**
 * Remove an unfinished import — the ONE deletion path for it, used by the Remove door
 * (`DELETE /api/sites/:key/import`, `sites/route.js`) and by the abandoned-import sweep (`cron.js`
 * `sweepAbandonedImports`). PR #1598, part 2.
 *
 * An import claims its row and an accepted owner seat before the read; a read that failed keeps the
 * row so Retry can reuse it (#1578). Until now nothing removed such a row but the narrow
 * `DELETE /api/sites/:key/claim`, which looks at jobs of any kind and not at a read still going on
 * the host. This one follows a protocol, in order, and deletes nothing until every step said yes:
 *
 * 1. THE RIGHT TO DELETE, TAKEN IN ONE GUARDED STATEMENT: `removing_at` is set only on a row that is
 *    an unfinished import (`lib/import-pending.js`, the same rule as every other door) and that no
 *    other Remove holds. It is taken under the site's provision lock, the one `/provision` holds
 *    while it files its job, so a provision either filed its job first (the row is no longer
 *    unfinished: refused here) or meets the mark (refused there). The claim door, `/provision` and
 *    `/agent` refuse a marked row with `IMPORT_REMOVING`.
 * 2. THE HOST CONFIRMS NO READ IS GOING, AND HOLDS THE SITE (`lib/add-site-host.js` → the add-site
 *    host half's `hold`): its check and its hold are one step, and its `startRun` refuses a held
 *    site, so a start, retry or Continue racing this Remove either opened its run first (the hold is
 *    refused, the mark lifted) or is refused. A host that is busy, unknown or unreachable: the mark
 *    is lifted, nothing is deleted, the person is told to try again later.
 * 3. ONLY THEN THE CLEAN-UP, UNDER THE HOLD: the seats and the row first, in one transaction, the
 *    delete still guarded by this Remove's own mark; then the store keys the hold named (aborted or
 *    deleted when inside this site's own prefixes); then the host forgets the site's runs,
 *    `runs.json` lines, Claude Cowork code and upload cursor, and keeps the site held as a tombstone
 *    until the hold lapses. The hold is lifted only when Remove gives up before deleting anything.
 *
 * The host asked is the one on the site's row (`lib/add-site-host.js`), never today's default.
 *
 * Never a finished import (a provision job on record), never a site built in Tracy, never another
 * site's keys: the rule in step 1 and the prefix check in step 3 say so.
 */
import { importPendingSql, IMPORT_REMOVING } from '../lib/import-pending.js'
import { addSiteHostCall } from '../lib/add-site-host.js'
import { DELETE_BRIEF_OF_GONE } from '../lib/site-brief-row.js'
import { signedCall } from './artifacts.js'
import { fleetLabel, labelPrefix } from './label.js'

/**
 * A mark older than this is a Remove that died between its steps or answered `REMOVE_INCOMPLETE`;
 * another Remove, or the sweep (`cron.js` `sweepAbandonedImports`), takes it over and finishes. Longer
 * than the host's hold (`hold.ts` `HOLD_TTL_MS`, 15 min), so a Remove still at work is never taken
 * over while its hold stands.
 */
export const REMOVE_MARK_STALE_MS = 20 * 60_000

/** The store keys the host named, kept only when they are inside this site's own prefixes. */
async function ownPrefixes(siteKey, config) {
  return [`sites/${labelPrefix(siteKey)}/`, `sites/${await fleetLabel(siteKey, config.siteDomain)}/`]
}
const insidePrefix = (key, prefixes) =>
  typeof key === 'string' &&
  !key.split('/').some((seg) => seg === '..' || seg === '.') &&
  prefixes.some((prefix) => key.startsWith(prefix))

/** Abort the open multipart upload and delete the finished archives the hold named. Best effort. */
async function dropNamedArtifacts({ config, fetchImpl, log }, siteKey, forgotten) {
  const store = config.artifactStore
  const prefixes = await ownPrefixes(siteKey, config)
  const kept = []
  let deleted = 0
  const upload = forgotten?.upload
  const archives = Array.isArray(forgotten?.archives) ? forgotten.archives : []
  const calls = []
  if (upload && insidePrefix(upload.key, prefixes) && typeof upload.uploadId === 'string')
    calls.push({ key: upload.key, query: { uploadId: upload.uploadId } })
  for (const key of archives) if (insidePrefix(key, prefixes)) calls.push({ key, query: {} })
  for (const call of calls) {
    const ok = store
      ? await signedCall(store, { method: 'DELETE', key: call.key, query: call.query }, fetchImpl)
          .then((res) => res.ok || res.status === 404)
          .catch(() => false)
      : false
    if (ok) deleted++
    else kept.push(call.key)
  }
  if (kept.length)
    log.warn(
      `[import-remove] ${siteKey}: removed without ${kept.length} stored object(s)${store ? '' : ' (no artifact store configured)'}: ${kept.join(', ')}`
    )
  return { deleted, kept }
}

/** The whole of `forgetImportAtHost`, every call in it included, ends within this. */
export const FORGET_AT_HOST_DEADLINE_MS = 30_000

/**
 * The host half of a removal for an imported site whose row went by ANOTHER path than
 * `removeUnfinishedImport`: a finished import torn down by the site delete (`closeBook` in
 * `sites/route.js`), or a migrated row released by `DELETE /api/sites/:key/claim`. The add-site host
 * still keeps the site's Claude Cowork code (`site-tokens.json`), its finished read
 * (`handovers.json`) and its runs; only `forget` drops them, and `forget` answers only a held site.
 * So: hold, delete the store keys the hold named, forget, release.
 *
 * - Released after a confirmed `forget`, unlike the Remove: the tombstone there guards a `/new/` tab
 *   still open on an unfinished read, and a finished import has none. The owner may import the same
 *   address again at once.
 * - Best effort, AFTER the row is gone: a host that refuses, is unknown, does not answer or throws is
 *   logged and the delete stands, as step 3 of the Remove does. Every request in here (the seat
 *   session, the host calls, the store deletes) shares one deadline, so a host that hangs holds the
 *   delete for `FORGET_AT_HOST_DEADLINE_MS` at most.
 *
 * @param {{config: any, seatDoor: {mintSeatSession?: Function}, fetchImpl?: typeof fetch, log?: Console,
 *   deadlineMs?: number}} deps
 * @param {{siteKey: string, host: string, email: string | null | undefined}} site
 * @returns {Promise<boolean>} whether the host confirmed it forgot the site
 */
export async function forgetImportAtHost(
  { config, seatDoor, fetchImpl = fetch, log = console, deadlineMs = FORGET_AT_HOST_DEADLINE_MS },
  { siteKey, host, email }
) {
  if (!email) {
    log.warn(`[import-remove] ${siteKey}: deleted; nobody to ask its add-site host to forget it as`)
    return false
  }
  const deadline = AbortSignal.timeout(deadlineMs)
  const bounded = (url, init = {}) =>
    fetchImpl(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
  const call = (op) => addSiteHostCall({ config, seatDoor, fetchImpl: bounded, host, email, op, siteKey })
  try {
    const held = await call('hold')
    if (!held.ok) {
      log.warn(
        `[import-remove] ${siteKey}: deleted, but its add-site host would not hold it (${held.status})`
      )
      // A refusal the host made itself held nothing; anything else may have, so ask it to let go.
      if (held.body?.code !== 'RUN_ACTIVE') await call('release')
      return false
    }
    await dropNamedArtifacts({ config, fetchImpl: bounded, log }, siteKey, held.body)
    const forgotten = await call('forget')
    if (!forgotten.ok) {
      log.warn(
        `[import-remove] ${siteKey}: deleted, but its add-site host did not forget its runs (${forgotten.status})`
      )
      return false
    }
    const released = await call('release')
    if (!released.ok)
      log.warn(
        `[import-remove] ${siteKey}: forgotten, but its add-site host kept the hold (${released.status}); a new import of it waits until the hold lapses`
      )
    return true
  } catch (error) {
    log.warn(
      `[import-remove] ${siteKey}: deleted, but asking its add-site host to forget it failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}

/**
 * @param {{pool: import('pg').Pool, config: any, seats: {revokeAllGrants: Function},
 *   seatDoor: {mintSeatSession?: Function}, fetchImpl?: typeof fetch, log?: Console}} deps
 */
export function importRemover({ pool, config, seats, seatDoor, fetchImpl = fetch, log = console }) {
  const refused = (status, code, extra = {}) => ({ refused: { status, code, ...extra } })

  /** Step 1: the mark, under the site's provision lock. Answers the marked row, or a refusal. */
  async function takeMark(siteKey) {
    const client = await pool.connect()
    try {
      const lockName = `site-provision:${siteKey}`
      const { rows: lock } = await client.query(
        'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
        [lockName]
      )
      // A provision is being filed for it right now: not this moment's to remove.
      if (!lock[0].locked) return refused(409, 'IMPORT_BUSY')
      try {
        const { rows } = await client.query(
          // Milliseconds, so the JS Date this answers compares equal when the mark is lifted or used.
          `update site s set removing_at = date_trunc('milliseconds', now())
            where s.site_key = $1
              and (s.removing_at is null or s.removing_at < now() - make_interval(secs => $2))
              and ${importPendingSql('s')}
          returning s.*`,
          [siteKey, REMOVE_MARK_STALE_MS / 1000]
        )
        if (rows[0]) return { site: rows[0] }
        const { rows: found } = await client.query(
          `select s.removing_at, ${importPendingSql('s')} as pending from site s where s.site_key = $1`,
          [siteKey]
        )
        if (!found[0]) return refused(404, 'SITE_UNKNOWN')
        if (found[0].pending) return refused(409, IMPORT_REMOVING)
        return refused(409, 'NOT_UNFINISHED_IMPORT')
      } finally {
        await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockName]).catch(() => {})
      }
    } finally {
      client.release()
    }
  }

  /** Give the right to delete back: only this Remove's own mark, never a later one's. */
  async function liftMark(site) {
    await pool
      .query('update site set removing_at = null where site_key = $1 and removing_at = $2', [
        site.site_key,
        site.removing_at
      ])
      .catch((error) => log.error(`[import-remove] ${site.site_key}: could not lift its mark`, error))
  }

  /** Step 3, store half: the keys the hold named (`dropNamedArtifacts`). */
  const dropArtifacts = (siteKey, forgotten) =>
    dropNamedArtifacts({ config, fetchImpl, log }, siteKey, forgotten)

  /**
   * The comment files' stored objects, after the commit. A refusal is logged and the removal stands:
   * the site and the rows naming these objects are already gone, so no later sweep can find them.
   */
  async function dropCommentFiles(siteKey, keys) {
    const store = config.artifactStore
    const kept = []
    for (const key of keys) {
      const ok = store
        ? await signedCall(store, { method: 'DELETE', key }, fetchImpl)
            .then((res) => res.ok || res.status === 404)
            .catch(() => false)
        : false
      if (!ok) kept.push(key)
    }
    if (kept.length)
      log.warn(
        `[import-remove] ${siteKey}: removed without ${kept.length} comment file(s) the store kept${store ? '' : ' (no artifact store configured)'}: ${kept.join(', ')}`
      )
  }

  /**
   * @param {string} siteKey
   * @param {{email: string, quietForMs?: number}} input - `email`: whose lane session carries the
   *   host call (the person pressing Remove, or the import's owner for the sweep). `quietForMs`: the
   *   sweep's "no activity for this long", checked by the host against its own runs and parts.
   * @returns {Promise<{removed: true, artifacts: {deleted: number, kept: string[]}} | {refused: {status: number, code: string}}>}
   */
  return async function removeUnfinishedImport(siteKey, { email, quietForMs } = {}) {
    const marked = await takeMark(siteKey)
    if (marked.refused) return marked
    const { site } = marked

    const held = await addSiteHostCall({
      config,
      seatDoor,
      fetchImpl,
      host: site.host,
      email,
      op: 'hold',
      siteKey,
      quietForMs
    })
    if (!held.ok) {
      const code = held.body?.code
      // A refusal the host made itself held nothing; anything else may have, so ask it to let go.
      if (code !== 'RUN_ACTIVE' && code !== 'RECENT_ACTIVITY')
        await addSiteHostCall({ config, seatDoor, fetchImpl, host: site.host, email, op: 'release', siteKey })
      await liftMark(site)
      if (code === 'RUN_ACTIVE') return refused(409, 'IMPORT_RUNNING')
      if (code === 'RECENT_ACTIVITY')
        return refused(409, 'IMPORT_RECENT', { lastActivityAt: held.body.lastActivityAt })
      return refused(503, 'HOST_UNAVAILABLE')
    }

    // 🔒 FROM HERE THE HOLD STAYS until every deletion is done: a start arriving now is refused by the
    // host. The seats and the row first, together, the delete only finding a row still under THIS
    // mark. A failure here deleted nothing (the transaction is rolled back) and keeps the mark and the
    // hold, so the next Remove or sweep finishes the job once the mark is stale.
    // 🔒 NOTHING IRREVERSIBLE BEFORE THE COMMIT. The comment files' object keys are read inside the
    // transaction; their rows go with the site row (cascade); the stored objects are deleted only after
    // the commit (`dropCommentFiles`). A transaction that fails leaves rows and objects in place.
    let commentFiles = []
    const client = await pool.connect()
    try {
      await client.query('begin')
      ;({ rows: commentFiles } = await client.query(
        'select object_key from site_comment_attachment where site_key = $1 and purged_at is null',
        [siteKey]
      ))
      await seats.revokeAllGrants(client, siteKey)
      const { rows: removed } = await client.query(
        `with gone as (
           delete from site s where s.site_key = $1 and s.removing_at = $2 and ${importPendingSql('s')}
           returning s.site_key
         ), brief as (${DELETE_BRIEF_OF_GONE})
         select count(*)::int as n from gone`,
        [siteKey, site.removing_at]
      )
      if (removed[0].n !== 1) {
        await client.query('rollback')
        // The row is not this mark's any more; nothing was deleted, so the site may start again.
        await addSiteHostCall({ config, seatDoor, fetchImpl, host: site.host, email, op: 'release', siteKey })
        return refused(409, 'NOT_UNFINISHED_IMPORT')
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      log.error(`[import-remove] ${siteKey}: could not delete the row; its mark and hold stay`, error)
      return refused(503, 'REMOVE_INCOMPLETE')
    } finally {
      client.release()
    }
    // Then what the reads left in the store (named by the hold), then the host's own books. Both
    // best effort: the row is gone, the host keeps the site held as a tombstone until it lapses, and a
    // run or cursor it could not forget expires with `RUN_TTL_MS`.
    await dropCommentFiles(
      siteKey,
      commentFiles.map((row) => row.object_key)
    )
    const artifacts = await dropArtifacts(siteKey, held.body)
    const forgotten = await addSiteHostCall({
      config,
      seatDoor,
      fetchImpl,
      host: site.host,
      email,
      op: 'forget',
      siteKey
    })
    if (!forgotten.ok)
      log.warn(
        `[import-remove] ${siteKey}: removed, but its host did not forget its runs (${forgotten.status})`
      )
    // No `site.deleted` to the shard master, as `DELETE /api/sites/:key/claim` sends none for a row no build was filed for (kept by decision, 22/10/2026).
    log.warn(`[import-remove] ${siteKey}: unfinished import removed`)
    return { removed: true, artifacts }
  }
}
