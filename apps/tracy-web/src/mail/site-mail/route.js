/**
 * The doors of site mail (`tasks/todo-mail-site-khach.md`, "Contract between the parts"):
 *
 *   POST /_site-mail                   — a site's `tracy-sendmail` shim, token-authenticated.
 *   GET  /api/ops/mail                 — /ops: the feature, today's use, every site's policy.
 *   PUT  /api/ops/mail/sites/:key      — /ops: a site's mode and limits.
 *   GET  /api/ops/mail/log             — /ops: the log.
 *   GET  /api/sites/:key/mail          — the site's own admin: its policy.
 *   PUT  /api/sites/:key/mail          — the site's own admin: mode, own domain, own SMTP.
 *   POST /api/sites/:key/mail/verify   — the site's own admin: ask Resend to check the domain again.
 *   DELETE /api/sites/:key/mail/domain — the site's own admin: remove the own domain.
 *   DELETE /api/ops/mail/sites/:key/domain — /ops: release a site's domain.
 *
 * Every door that changes a site's domain goes through `domains.js`, which deletes on Resend only
 * what Tracy created there — the account is shared by every customer site and holds few domains.
 *
 * MODULE GRAPH: `mail/` may import only `lib/` and `db/`. The staff door (`ops/admit.js`) and the
 * seat book (`seats/`) arrive through `deps`, wired by `app.js` like every other cross-domain need.
 *
 * 🔒 `/_site-mail` IS NOT A PUBLIC DOOR. The shim reaches it over the `tracy` docker network by
 * address (`172.30.0.10:8080`), so a request that names Tracy's own public hostname, or carries a
 * Cloudflare header, did not come from a site container and is answered 404 (`deps.isPublicHost`).
 * A request naming a SITE hostname never gets here at all: `app.js` hands those to the site proxy
 * first. The token is the real gate either way; this only keeps the door off the public surface.
 *
 * 🔒 NO DOOR ANSWERS A STORED SMTP PASSWORD, sealed or opened — only `hasPassword`.
 */
import { Hono } from 'hono'
import { json, normalizeSiteKey, viewer } from '../../lib/http.js'
import { sealSecret } from '../../lib/secret-box.js'
import { MAX_MESSAGE_BYTES } from './message.js'
import {
  domainVerified,
  fromAddressFor,
  limitsFor,
  MODES,
  modeOf,
  normaliseDomain,
  smtpRefusal,
  TRACY_PAID
} from './policy.js'
import { claimRemote, lifecycleFailure, NO_DOMAIN, releaseAt, releaseRemote, tracyDomain } from './domains.js'
import { authenticate, relay } from './relay.js'
import { isGone, resendDomains } from './resend-domains.js'
import {
  audit,
  domainHolder,
  lastOriginalFrom,
  mailRow,
  recentLog,
  saveMailRow,
  sentToday,
  siteForMail,
  sitesForOps,
  usedToday
} from './store.js'

class TooLarge extends Error {
  constructor() {
    super('message over the size limit')
    this.name = 'TooLarge'
  }
}

/** The request body, refused as soon as it passes `max` bytes — never buffered whole first. */
export async function readLimited(request, max = MAX_MESSAGE_BYTES) {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) throw new TooLarge()
  if (!request.body) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      throw new TooLarge()
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/** A bad body, said the one way the screens read it: `INVALID_REQUEST` plus what was wrong. */
const invalid = (c, reason) => json(c, { code: 'INVALID_REQUEST', reason }, 400)

/** Another site already holds this domain: one domain belongs to at most one site. */
const taken = (c) => json(c, { code: 'SITE_MAIL_DOMAIN_TAKEN' }, 409)
/** Postgres' unique-violation code: `029-site-mail-domain-lifecycle.sql`'s index caught a race. */
const UNIQUE_VIOLATION = '23505'

const iso = (v) => (v ? new Date(v).toISOString() : null)

const LIMIT_MAX = 1_000_000
const isLimit = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= LIMIT_MAX)

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config
 * @param {Function} deps.admit - `ops/admit.js`'s `admit`.
 * @param {Function} deps.denied - `ops/admit.js`'s `denied`.
 * @param {{accountByEmail: Function, grantFor: Function, actingOwner: Function}} deps.seats
 * @param {(c: import('hono').Context) => boolean} [deps.isPublicHost]
 * @param {Function} [deps.smtp] - `smtp.js`'s `sendSmtp`, replaceable by a test.
 * @param {Function} [deps.resolve] - DNS lookup for own-SMTP hosts, replaceable by a test.
 * @param {(key: string) => ReturnType<typeof resendDomains>} [deps.resend]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {{log: Function, warn: Function}} [deps.log]
 */
export function siteMailRoutes({
  pool,
  config,
  admit,
  denied,
  seats,
  isPublicHost = () => false,
  smtp,
  resolve,
  fetchImpl = fetch,
  resend = (key) => resendDomains({ key, fetchImpl }),
  log = console
}) {
  const app = new Hono()
  const siteMail = config.siteMail

  // One warning per limit scope per UTC day: the cap being reached is news once, not per message.
  const warned = new Map()
  const onLimit = (scope) => {
    const day = new Date().toISOString().slice(0, 10)
    if (warned.get(scope) === day) return
    warned.set(scope, day)
    log.warn(`[site-mail] limit reached: ${scope} — further mail refused with 429 until it resets`)
  }

  /**
   * Where a domain's release clock stands, for both screens: waiting since when, released at when
   * if still unverified then, or released already. Null fields when the clock does not apply.
   */
  const domainClock = (row) => ({
    domainOwned: Boolean(row?.domain_owned),
    domainPendingSince: row?.domain && row.domain_status !== 'expired' ? iso(row.domain_requested_at) : null,
    domainReleaseAt: iso(releaseAt(row, siteMail.domainPendingDays)),
    domainReleasedAt: row?.domain_status === 'expired' ? iso(row.domain_released_at) : null
  })

  /**
   * Take the site's domain away: delete it on Resend when Tracy may, clear the row's domain
   * columns, and leave `tracy-domain` for `tracy` (a mode with no domain is the Tracy address anyway,
   * and the screen should say what is true). A failed delete changes nothing and answers the error.
   * @returns {Promise<{row?: object, deleted?: boolean, kept?: string | null, fail?: {status: number, body: object}}>}
   */
  const dropDomain = async (row, updatedBy) => {
    let result = { deleted: false, kept: 'none' }
    if (row?.resend_domain_id) {
      if (!siteMail.key) return { fail: { status: 503, body: { code: 'SITE_MAIL_DOMAIN_UNAVAILABLE' } } }
      try {
        result = await releaseRemote({ pool, client: resend(siteMail.key), row, config })
      } catch (error) {
        log.warn(`[site-mail] could not delete domain ${row.domain} of ${row.site_key}: ${error.message}`)
        return { fail: lifecycleFailure(error) }
      }
    }
    const saved = await saveMailRow(
      pool,
      row.site_key,
      { ...NO_DOMAIN, ...(row.mode === 'tracy-domain' ? { mode: 'tracy' } : {}) },
      updatedBy
    )
    return { row: saved, ...result }
  }

  app.post('/_site-mail', async (c) => {
    if (isPublicHost(c)) return c.body(null, 404)
    if (siteMail.mode === 'off') return json(c, { code: 'SITE_MAIL_DISABLED' }, 503)
    const who = await authenticate({
      pool,
      config,
      label: c.req.header('x-tracy-site') ?? null,
      token: c.req.header('x-tracy-token') ?? null
    })
    if (!who.site) return json(c, who.body, who.status)
    const row = await mailRow(pool, who.site.site_key)
    const result = await relay({
      pool,
      config,
      site: who.site,
      row,
      readBody: () => readLimited(c.req.raw),
      ...(smtp ? { smtp } : {}),
      ...(resolve ? { resolve } : {}),
      log,
      onLimit
    })
    return json(c, result.body, result.status)
  })

  // ── /ops ────────────────────────────────────────────────────────────────────────────────────

  const staff = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's — same rule as every other /ops write.
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /** `hourly`/`daily` are this site's OVERRIDES, null when it is on `defaults` (the contract). */
  const opsSite = (r) => {
    const row = r.mode ? r : null
    return {
      siteKey: r.site_key,
      label: r.label,
      published: r.publish === 'published',
      mode: modeOf(row),
      fromAddress: fromAddressFor(r, row, siteMail),
      hourly: r.hourly_limit ?? null,
      daily: r.daily_limit ?? null,
      sentToday: r.sent_today,
      domain: r.domain ?? null,
      domainStatus: r.domain_status ?? null,
      ...domainClock(row),
      lastError: r.last_error || null
    }
  }

  /**
   * How full Tracy's Resend account is: `used` read from Resend itself (the only true count — it
   * includes Tracy's own sending domains and anything added on the dashboard), null when it could
   * not be read; `limit` from `SITE_MAIL_DOMAIN_LIMIT`.
   */
  const domainSlots = async () => {
    let used = null
    if (siteMail.mode !== 'off' && siteMail.key) {
      try {
        used = (await resend(siteMail.key).list()).length
      } catch (error) {
        log.warn(`[site-mail] could not count resend domains: ${error.message}`)
      }
    }
    return { used, limit: siteMail.domainLimit }
  }

  app.get('/api/ops/mail', async (c) => {
    const g = await staff(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return json(c, {
      enabled: siteMail.mode !== 'off',
      mode: siteMail.mode,
      domain: siteMail.domain,
      globalDaily: siteMail.globalDaily,
      usedToday: await usedToday(pool),
      defaults: { hourly: siteMail.siteHourly, daily: siteMail.siteDaily },
      domainSlots: await domainSlots(),
      domainPendingDays: siteMail.domainPendingDays,
      writable: ['owner', 'admin'].includes(g.who.role),
      sites: (await sitesForOps(pool)).map(opsSite)
    })
  })

  app.put('/api/ops/mail/sites/:key', async (c) => {
    const g = await staff(c, { write: true })
    if (g.deny) return g.deny
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const site = siteKey ? await siteForMail(pool, { siteKey }) : null
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return invalid(c, 'NOT_JSON')
    const row = await mailRow(pool, siteKey)
    const patch = {}
    if (body.mode !== undefined) {
      if (!MODES.includes(body.mode)) return invalid(c, 'INVALID_MODE')
      if (body.mode === 'own-smtp' && !row?.smtp) return invalid(c, 'SMTP_REQUIRED')
      if (body.mode === 'tracy-domain' && (!row?.domain || row.domain_status === 'expired'))
        return invalid(c, 'DOMAIN_REQUIRED')
      patch.mode = body.mode
    }
    for (const [field, column] of [
      ['hourly', 'hourly_limit'],
      ['daily', 'daily_limit']
    ]) {
      if (body[field] === undefined) continue
      if (!isLimit(body[field]))
        return json(c, { code: 'INVALID_REQUEST', reason: 'INVALID_LIMIT', field }, 400)
      patch[column] = body[field]
    }
    if (Object.keys(patch).length === 0) return invalid(c, 'NOTHING_TO_CHANGE')
    // Leaving `tracy-domain` takes the domain with it (rule 1 of `domains.js`), before the mode is
    // written, so a Resend that fails leaves the site exactly as it was.
    let dropped = null
    if (patch.mode !== undefined && patch.mode !== 'tracy-domain' && row?.domain) {
      dropped = await dropDomain(row, g.who.email)
      if (dropped.fail) return json(c, dropped.fail.body, dropped.fail.status)
    }
    await saveMailRow(pool, siteKey, patch, g.who.email)
    await audit(pool, {
      actor: g.who.email,
      action: 'ops.site-mail',
      siteKey,
      detail: { ...patch, ...(dropped ? { domainRemoved: row.domain, deleted: dropped.deleted } : {}) }
    })
    const [entry] = await sitesForOps(pool, siteKey)
    return json(c, opsSite(entry))
  })

  app.delete('/api/ops/mail/sites/:key/domain', async (c) => {
    const g = await staff(c, { write: true })
    if (g.deny) return g.deny
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const site = siteKey ? await siteForMail(pool, { siteKey }) : null
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const row = await mailRow(pool, siteKey)
    if (!row?.domain) return invalid(c, 'DOMAIN_REQUIRED')
    const dropped = await dropDomain(row, g.who.email)
    if (dropped.fail) return json(c, dropped.fail.body, dropped.fail.status)
    await audit(pool, {
      actor: g.who.email,
      action: 'ops.site-mail.domain.release',
      siteKey,
      detail: { domain: row.domain, deleted: dropped.deleted, kept: dropped.kept }
    })
    const [entry] = await sitesForOps(pool, siteKey)
    return json(c, opsSite(entry))
  })

  app.get('/api/ops/mail/log', async (c) => {
    const g = await staff(c)
    if (g.deny) return g.deny
    const raw = c.req.query('siteKey')
    const siteKey = raw ? normalizeSiteKey(raw) || null : null
    if (raw && !siteKey) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const asked = Number.parseInt(c.req.query('limit') ?? '100', 10)
    const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 100
    c.header('cache-control', 'no-store')
    return json(c, { entries: await recentLog(pool, { siteKey, limit }) })
  })

  // ── the site's own admin ────────────────────────────────────────────────────────────────────

  /**
   * A signed-in Owner of an existing site, or the Response to return. The site's mail (its sender,
   * its own SMTP password, its domain) is site administration, so the Owner's alone (ADR 0028). With the feature off
   * (`SITE_MAIL=off`) there is nothing to configure: 503 after the seat check, so the answer never
   * tells a stranger more than a 403 would.
   */
  const siteAdmin = async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const email = await viewer(c, config)
    if (!email) return { deny: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const account = await seats.accountByEmail(pool, email)
    const grant = account && siteKey ? await seats.grantFor(pool, account.id, siteKey) : null
    if (!grant) return { deny: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    if (!seats.actingOwner(grant)) return { deny: json(c, { code: 'NOT_SITE_OWNER' }, 403) }
    const site = await siteForMail(pool, { siteKey })
    if (!site) return { deny: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    if (siteMail.mode === 'off') return { deny: json(c, { code: 'SITE_MAIL_DISABLED' }, 503) }
    return { email, site }
  }

  const siteView = async (site, row) => {
    const mode = modeOf(row)
    const smtpRow = row?.smtp ?? null
    return {
      mode,
      fromAddress: fromAddressFor(site, row, siteMail),
      // Where replies go in the modes where Tracy rewrites `From`: the site's own `From`, as the
      // relay last saw it (the address lives in the CMS, so null until the first message).
      replyTo: TRACY_PAID.has(mode) ? await lastOriginalFrom(pool, site.site_key) : null,
      domain: row?.domain ?? null,
      domainStatus: row?.domain_status ?? null,
      domainPendingSince: domainClock(row).domainPendingSince,
      domainReleaseAt: domainClock(row).domainReleaseAt,
      domainReleasedAt: domainClock(row).domainReleasedAt,
      dnsRecords: Array.isArray(row?.domain_records) ? row.domain_records : [],
      smtp: smtpRow
        ? {
            host: smtpRow.host,
            port: smtpRow.port,
            user: smtpRow.user,
            hasPassword: Boolean(smtpRow.password)
          }
        : null,
      limits: limitsFor(row, siteMail),
      sentToday: await sentToday(pool, site.site_key),
      published: site.publish === 'published',
      enabled: siteMail.mode !== 'off'
    }
  }

  /**
   * Point the site at `name` on Resend (`domains.js`'s `claimRemote`), writing down a deleted
   * previous domain even when the new one then fails — the row must never name a Resend id that no
   * longer exists.
   * @returns {Promise<{patch: object} | {fail: {status: number, body: object}}>}
   */
  const claim = async (siteKey, row, name) => {
    const client = resend(siteMail.key)
    const progress = { released: false }
    try {
      const { patch } = await claimRemote({ pool, client, row, name, config, progress })
      return { patch }
    } catch (error) {
      log.warn(`[site-mail] resend refused domain ${name} for ${siteKey}: ${error.message}`)
      if (progress.released) await saveMailRow(pool, siteKey, NO_DOMAIN, null)
      return { fail: lifecycleFailure(error) }
    }
  }

  app.get('/api/sites/:key/mail', async (c) => {
    const a = await siteAdmin(c)
    if (a.deny) return a.deny
    c.header('cache-control', 'no-store')
    return json(c, await siteView(a.site, await mailRow(pool, a.site.site_key)))
  })

  app.put('/api/sites/:key/mail', async (c) => {
    const a = await siteAdmin(c)
    if (a.deny) return a.deny
    if (!c.req.header('content-type')?.startsWith('application/json')) return invalid(c, 'NOT_JSON')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return invalid(c, 'NOT_JSON')
    if (!MODES.includes(body.mode)) return invalid(c, 'INVALID_MODE')
    const siteKey = a.site.site_key
    const row = await mailRow(pool, siteKey)
    const patch = { mode: body.mode }

    // The domain this save asks for: undefined = unchanged, null = none. Leaving `tracy-domain`
    // means none — the old domain is deleted, not kept on a shared account for a mode not in use.
    let want
    if (body.domain === null) want = null
    else if (body.domain !== undefined) {
      want = normaliseDomain(body.domain)
      if (!want) return invalid(c, 'DOMAIN_INVALID')
      if (tracyDomain(want, config)) return invalid(c, 'DOMAIN_NOT_ALLOWED')
    }
    if (body.mode !== 'tracy-domain' && row?.domain) want = null
    const domainAfter = want === undefined ? (row?.domain ?? null) : want
    if (body.mode === 'tracy-domain' && !domainAfter) return invalid(c, 'DOMAIN_REQUIRED')
    if (want && (await domainHolder(pool, want, siteKey))) return taken(c)

    const domainChange =
      want === null && row?.domain
        ? 'removed'
        : want && (want !== row?.domain || !row?.resend_domain_id)
          ? 'requested'
          : null

    if (body.smtp === null) {
      patch.smtp = null
    } else if (body.smtp !== undefined) {
      const refusal = smtpRefusal(body.smtp)
      if (refusal) return invalid(c, refusal)
      const password = body.smtp.password
        ? await sealSecret(body.smtp.password, config.sessionSecret)
        : (row?.smtp?.password ?? null)
      if (!password) return invalid(c, 'SMTP_PASSWORD_REQUIRED')
      patch.smtp = {
        host: body.smtp.host.trim().toLowerCase(),
        port: Number(body.smtp.port),
        user: body.smtp.user.trim(),
        password
      }
    }
    const smtpAfter = Object.hasOwn(patch, 'smtp') ? patch.smtp : (row?.smtp ?? null)
    if (body.mode === 'own-smtp' && !smtpAfter) return invalid(c, 'SMTP_REQUIRED')

    // Resend last, once every field has passed: a domain created for a save that is then refused
    // would sit on the shared account with no row pointing at it.
    if (domainChange === 'requested') {
      if (siteMail.key) {
        const got = await claim(siteKey, row, want)
        if (got.fail) return json(c, got.fail.body, got.fail.status)
        Object.assign(patch, got.patch)
      } else {
        // No Resend key (log mode on a stand): the name is kept, nothing is registered.
        Object.assign(patch, NO_DOMAIN, { domain: want, domain_records: [], domain_requested_at: new Date() })
      }
    }
    let deleted = null
    if (domainChange === 'removed') {
      const dropped = await dropDomain(row, a.email)
      if (dropped.fail) return json(c, dropped.fail.body, dropped.fail.status)
      deleted = dropped.deleted
    }
    let saved
    try {
      saved = await saveMailRow(pool, siteKey, patch, a.email)
    } catch (error) {
      if (error?.code === UNIQUE_VIOLATION) return taken(c)
      throw error
    }
    await audit(pool, {
      actor: a.email,
      action: 'site.mail',
      siteKey,
      detail: {
        mode: body.mode,
        ...(domainChange === 'requested'
          ? {
              domain: patch.domain,
              resendDomainId: patch.resend_domain_id ?? null,
              created: patch.domain_owned
            }
          : {}),
        ...(domainChange === 'removed' ? { domainRemoved: row.domain, deleted } : {}),
        ...(Object.hasOwn(patch, 'smtp')
          ? { smtpHost: patch.smtp?.host ?? null, passwordChanged: Boolean(body.smtp?.password) }
          : {})
      }
    })
    return json(c, await siteView(a.site, saved))
  })

  app.post('/api/sites/:key/mail/verify', async (c) => {
    const a = await siteAdmin(c)
    if (a.deny) return a.deny
    const siteKey = a.site.site_key
    const row = await mailRow(pool, siteKey)
    if (!row?.domain) return invalid(c, 'DOMAIN_REQUIRED')
    if (!siteMail.key) return json(c, { code: 'SITE_MAIL_DISABLED' }, 503)
    const client = resend(siteMail.key)
    let patch = null
    if (row.resend_domain_id) {
      try {
        const found = await client.verify(row.resend_domain_id)
        patch = {
          resend_domain_id: found.id ?? row.resend_domain_id,
          domain_status: found.status,
          domain_records: found.records
        }
      } catch (error) {
        // 404: the id names a domain Resend no longer has (deleted on the dashboard). It is gone —
        // ask for the name again below instead of repeating a check that can never succeed.
        if (!isGone(error)) {
          log.warn(`[site-mail] resend verify failed for ${siteKey}: ${error.message}`)
          const fail = lifecycleFailure(error)
          return json(c, fail.body, fail.status)
        }
        log.warn(
          `[site-mail] resend no longer has domain ${row.resend_domain_id} of ${siteKey}: asking again`
        )
      }
    }
    if (!patch) {
      if (await domainHolder(pool, row.domain, siteKey)) return taken(c)
      // Nothing to delete: the old id is gone, or there never was one (released, or saved keyless).
      const got = await claim(siteKey, { ...row, resend_domain_id: null }, row.domain)
      if (got.fail) return json(c, got.fail.body, got.fail.status)
      patch = got.patch
    }
    const saved = await saveMailRow(pool, siteKey, patch, a.email)
    await audit(pool, {
      actor: a.email,
      action: 'site.mail.verify',
      siteKey,
      detail: {
        domain: row.domain,
        status: saved.domain_status,
        verified: domainVerified(saved),
        ...(saved.resend_domain_id !== row.resend_domain_id ? { resendDomainId: saved.resend_domain_id } : {})
      }
    })
    return json(c, await siteView(a.site, saved))
  })

  app.delete('/api/sites/:key/mail/domain', async (c) => {
    const a = await siteAdmin(c)
    if (a.deny) return a.deny
    const siteKey = a.site.site_key
    const row = await mailRow(pool, siteKey)
    if (!row?.domain) return invalid(c, 'DOMAIN_REQUIRED')
    const dropped = await dropDomain(row, a.email)
    if (dropped.fail) return json(c, dropped.fail.body, dropped.fail.status)
    await audit(pool, {
      actor: a.email,
      action: 'site.mail.domain.remove',
      siteKey,
      detail: { domain: row.domain, deleted: dropped.deleted, kept: dropped.kept }
    })
    return json(c, await siteView(a.site, dropped.row))
  })

  return app
}
