/** Read-only import preflight: disclose availability, never another account's identity. */
import { json, normalizeSiteKey, requireViewer } from '../lib/http.js'
import { importPending } from '../lib/import-pending.js'
import { siteByKey } from './store.js'

/** A reserved import address has no copy until a host has been asked to build it: the import is
 * not finished (`lib/import-pending.js`, the one rule every door reads). */
export async function importClaimRetryable(pool, site) {
  return site?.origin === 'migrated' && (await importPending(pool, site.site_key))
}

/**
 * One press of the import claim door on its row: the activity the abandoned-import sweep reads
 * (`import_touched_at`, `cron.js`) and the press's identity.
 *
 * Every start is sent right after a press and carries `press` — microseconds since the epoch,
 * strictly increasing per row, because the row is locked first (`for update`, which also reads the
 * press a concurrent one just committed) and a press never takes a time at or before the last. The
 * host opens no read for a start whose press is not newer than one a run already carries
 * (`packages/site/tracy-add-site/src/host/run.ts` `superseded`). `pressBefore` names the press
 * before this one (the row's birth when none was recorded) and `idleMs` how long ago it was, on
 * this server's clock: a claim idle long enough, with no run on the host, may be taken over by a
 * start naming the press it supersedes (#1665, `packages/site/tracy-add-site/src/client/import.ts`).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} siteKey - a row that exists.
 * @returns {Promise<{idleMs: number, press: string | undefined, pressBefore: string | undefined}>}
 */
export async function pressImportClaim(db, siteKey) {
  const { rows } = await db.query(
    `with prev as (
       select site_key, greatest(created_at, coalesce(import_touched_at, created_at)) as at
         from site where site_key = $1 for update)
     update site s set import_touched_at = greatest(now(), prev.at + interval '1 microsecond')
       from prev
      where s.site_key = prev.site_key
      returning floor(extract(epoch from now() - prev.at) * 1000)::bigint as idle_ms,
        (extract(epoch from s.import_touched_at) * 1000000)::bigint::text as press,
        (extract(epoch from prev.at) * 1000000)::bigint::text as press_before`,
    [siteKey]
  )
  return {
    idleMs: Math.max(0, Number(rows[0]?.idle_ms ?? 0)),
    press: rows[0]?.press,
    pressBefore: rows[0]?.press_before
  }
}

/** Only an existing site's actual, valid fleet label can become a join link. */
export function importJoinPath(site) {
  const label = site?.label
  return typeof label === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    ? `/${label}/join`
    : undefined
}

/** No account creation, claim, seat write, remote request, or owner details. */
export function importAddressHandler(pool, config, seats) {
  return async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    c.header('cache-control', 'no-store')
    let siteKey
    try {
      siteKey = normalizeSiteKey(c.req.query('siteKey') ?? '')
    } catch {
      siteKey = ''
    }
    if (!siteKey) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { ownership: 'available' })
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await seats.grantFor(pool, account.id, siteKey) : null
    if (grant) return json(c, { ownership: (await importClaimRetryable(pool, site)) ? 'available' : 'mine' })
    const joinPath = importJoinPath(site)
    return json(c, { ownership: 'other', ...(joinPath ? { joinPath } : {}) })
  }
}
