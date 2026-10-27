/**
 * The life of a customer domain on Tracy's Resend account (mode `tracy-domain`): asked for, reused,
 * replaced, removed, released when abandoned (`029-site-mail-domain-lifecycle.sql`).
 *
 * The account is SHARED by every customer site and its plan holds few domains (Free: 3, two of them
 * Tracy's own sending domains). Before this file, Save created a domain and nothing ever deleted
 * one: measured 24/09 on the dev machine, one person trying two domains filled the account and every
 * later Save failed. Three rules keep it from filling again:
 *
 *   1. Replace, don't accumulate — a new domain, a mode other than `tracy-domain`, or "Remove" deletes
 *      the site's previous domain.
 *   2. Reuse, don't duplicate — a name the account already holds is not created twice, and a name
 *      another site holds is refused (409 `SITE_MAIL_DOMAIN_TAKEN`).
 *   3. Release the abandoned — `releaseAbandonedDomains` (run hourly by `cron.js`) deletes a domain
 *      still unverified `SITE_MAIL_DOMAIN_PENDING_DAYS` after it was asked for.
 *
 * 🔒 TRACY DELETES ONLY WHAT IT CREATED. `domain_owned` is set only by Tracy's own POST /domains for
 * this site; a domain that was already on the account, one another row still points at, and the
 * deployment's own sending domains (`SITE_MAIL_DOMAIN`, `SITE_DOMAIN`, the domain of `MAIL_FROM`
 * and anything under them) are never deleted, whatever the row says.
 *
 * MODULE GRAPH: like the rest of `mail/`, this imports only its siblings; `cron.js` (top-level)
 * calls it.
 */
import { domainFailure, isGone, ResendError } from './resend-domains.js'
import { abandonedDomains, audit, resendIdShared, saveMailRow } from './store.js'

/** Every domain column back to "no domain". */
export const NO_DOMAIN = Object.freeze({
  domain: null,
  resend_domain_id: null,
  domain_status: null,
  domain_records: null,
  domain_owned: false,
  domain_requested_at: null,
  domain_released_at: null
})

/** What a released row reads: the name stays (the screen says which one went), the claim does not. */
const RELEASED = (at) => ({
  resend_domain_id: null,
  domain_status: 'expired',
  domain_records: [],
  domain_owned: false,
  domain_released_at: at
})

/** The domain of an address as `MAIL_FROM` writes it (`noreply@x` or `Tracy <noreply@x>`), or null. */
export function addressDomain(from) {
  const m = /@([^\s<>@]+?)\s*>?\s*$/.exec(String(from ?? ''))
  return m ? m[1].toLowerCase() : null
}

/**
 * A domain Tracy itself sends from or serves: never a customer's, never deleted. Tracy's system
 * sender (`MAIL_FROM`) counts too: on a deployment whose `SITE_DOMAIN` differs from it, a site that
 * claimed it would reuse the account's verified domain and send DKIM-valid mail as Tracy.
 */
export function tracyDomain(name, config) {
  const d = String(name ?? '').toLowerCase()
  return [config.siteMail?.domain, config.siteDomain, addressDomain(config.mail?.from)]
    .filter(Boolean)
    .some((own) => d === own.toLowerCase() || d.endsWith(`.${own.toLowerCase()}`))
}

/** Thrown when the plan has no room, before anything was created or deleted. */
export class DomainLimit extends Error {
  constructor(used, limit) {
    super(`resend account holds ${used} of ${limit} domains`)
    this.name = 'DomainLimit'
  }
}

/** A failed lifecycle step, as the door answers it. */
export function lifecycleFailure(error) {
  if (error instanceof DomainLimit) return { status: 409, body: { code: 'SITE_MAIL_DOMAIN_LIMIT' } }
  return domainFailure(error)
}

/**
 * Why Tracy may not delete the Resend domain this row points at, or null when it may.
 * @returns {Promise<'none' | 'not-created-by-tracy' | 'tracy-domain' | 'shared' | null>}
 */
export async function keepReason(pool, row, config) {
  if (!row?.resend_domain_id) return 'none'
  if (!row.domain_owned) return 'not-created-by-tracy'
  if (row.domain && tracyDomain(row.domain, config)) return 'tracy-domain'
  if (await resendIdShared(pool, row.resend_domain_id, row.site_key)) return 'shared'
  return null
}

/**
 * Delete the Resend domain the row points at, when Tracy may. A 404 is success: the domain is gone
 * either way (deleted on the dashboard, or by an earlier try that died before the row was written).
 * @returns {Promise<{deleted: boolean, kept: string | null}>}
 */
export async function releaseRemote({ pool, client, row, config }) {
  const kept = await keepReason(pool, row, config)
  if (kept) return { deleted: false, kept }
  const existed = await client.remove(row.resend_domain_id)
  return { deleted: existed, kept: null }
}

/**
 * Point this site at `name` on Resend: reuse the account's domain when it already holds that name,
 * otherwise create it — after deleting the site's previous domain when Tracy may, so a change of
 * domain never needs two slots. The plan is checked FIRST, from one list call, so a full account
 * is refused with nothing deleted and nothing created.
 *
 * The caller has already refused a name another site holds and a name of Tracy's own.
 *
 * @param {object} o
 * @param {{released?: boolean}} [o.progress] - set to `released: true` the moment the old domain is
 *   deleted, so a caller whose create then fails can still write down that the old one is gone.
 * @returns {Promise<{patch: object, released: boolean}>} the columns to write, and whether the old
 *   Resend domain was deleted on the way.
 * @throws {DomainLimit | ResendError}
 */
export async function claimRemote({ pool, client, row, name, config, now = new Date(), progress = {} }) {
  const account = await client.list()
  const found = account.find((d) => d.name === name)
  const oldId = row?.resend_domain_id ?? null
  const mayDelete = oldId !== null && oldId !== found?.id && (await keepReason(pool, row, config)) === null
  if (!found) {
    const freed = mayDelete && account.some((d) => d.id === oldId) ? 1 : 0
    const limit = config.siteMail.domainLimit
    if (account.length - freed >= limit) throw new DomainLimit(account.length, limit)
  }
  let released = false
  if (mayDelete) {
    await client.remove(oldId)
    released = true
    progress.released = true
  }
  if (found) {
    const current = await client.get(found.id)
    return {
      released,
      patch: {
        domain: name,
        resend_domain_id: found.id,
        domain_status: current.status ?? found.status,
        domain_records: current.records,
        // Reused, not made: Tracy made it only if this very row already said so for this very id.
        domain_owned: Boolean(row?.domain_owned && oldId === found.id),
        domain_requested_at: oldId === found.id ? (row?.domain_requested_at ?? now) : now,
        domain_released_at: null
      }
    }
  }
  const made = await client.create(name)
  if (!made.id) throw new ResendError('resend POST /domains: answered without an id', 502)
  return {
    released,
    patch: {
      domain: name,
      resend_domain_id: made.id,
      domain_status: made.status,
      domain_records: made.records,
      domain_owned: true,
      domain_requested_at: now,
      domain_released_at: null
    }
  }
}

/** When an unverified Tracy-made domain will be released, or null when the clock does not run. */
export function releaseAt(row, pendingDays) {
  if (!row?.domain_owned || !row.resend_domain_id || !row.domain_requested_at) return null
  if (String(row.domain_status ?? '').toLowerCase() === 'verified') return null
  return new Date(new Date(row.domain_requested_at).getTime() + pendingDays * 86_400_000)
}

/**
 * The release clock: every Tracy-made domain still unverified `SITE_MAIL_DOMAIN_PENDING_DAYS` after
 * it was asked for is deleted on Resend and its row marked `expired` (the site keeps sending, from
 * the Tracy address, as it did while the domain was unverified). Asks Resend first, because a
 * customer may have verified it without anyone pressing "Check again": that row is updated and kept.
 *
 * Idempotent (a released row has no id and is never picked again) and safe when Resend answers 404.
 * One domain that fails is logged and left for the next run; it never stops the others.
 *
 * @returns {Promise<{released: string[], verified: string[], failed: string[]}>} site keys.
 */
export async function releaseAbandonedDomains(
  pool,
  config,
  { resend, log = console, now = new Date() } = {}
) {
  const out = { released: [], verified: [], failed: [] }
  const siteMail = config.siteMail
  if (siteMail.mode === 'off' || !siteMail.key || !resend) return out
  const client = resend(siteMail.key)
  for (const row of await abandonedDomains(pool, siteMail.domainPendingDays)) {
    try {
      let current = null
      try {
        current = await client.get(row.resend_domain_id)
      } catch (error) {
        if (!isGone(error)) throw error
      }
      if (current && String(current.status ?? '').toLowerCase() === 'verified') {
        await saveMailRow(
          pool,
          row.site_key,
          { domain_status: current.status, domain_records: current.records },
          null
        )
        out.verified.push(row.site_key)
        continue
      }
      const result = current
        ? await releaseRemote({ pool, client, row, config })
        : { deleted: false, kept: null }
      if (result.kept) continue
      await saveMailRow(pool, row.site_key, RELEASED(now), null)
      await audit(pool, {
        actor: null,
        action: 'site.mail.domain.expired',
        siteKey: row.site_key,
        detail: {
          domain: row.domain,
          resendDomainId: row.resend_domain_id,
          requestedAt: new Date(row.domain_requested_at).toISOString(),
          pendingDays: siteMail.domainPendingDays,
          deleted: result.deleted
        }
      })
      out.released.push(row.site_key)
      log.log?.(`[site-mail] released unverified domain ${row.domain} of ${row.site_key}`)
    } catch (error) {
      out.failed.push(row.site_key)
      log.warn(`[site-mail] could not release domain ${row.domain} of ${row.site_key}: ${error.message}`)
    }
  }
  return out
}
