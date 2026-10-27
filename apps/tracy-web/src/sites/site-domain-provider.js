/**
 * A customer's own domain as Cloudflare for SaaS knows it (#1037, slice 2): the CUSTOM HOSTNAME of
 * the site zone that makes Cloudflare answer the name — with a certificate of its own — and send
 * its requests to the zone's fallback origin, which is tracy-web.
 *
 *   cloudflareHostnames   the four calls this needs of `/zones/{zone}/custom_hostnames`, each with a
 *                         deadline, each answering a closed set of outcomes (never throwing)
 *   ensureHostnames       a row `creating` for every PROVEN reservation that has none
 *   reconcileHostnames    every row that is due: create, read, or delete at Cloudflare, and write
 *                         what was answered (`083-site-custom-hostname.sql`)
 *   hostnameGate          whether the reservation's hostname and its certificate are both active —
 *                         read from the row, no call; one of the three things "connected" needs
 *
 * 🔒 ONLY A HOSTNAME TRACY CREATED FOR THIS RESERVATION IS EVER READ AS ITS OWN. Its id comes from
 * Cloudflare's answer to Tracy's own create, kept on the row. A name Cloudflare already holds
 * (`conflict`), and whatever exists under a name whose create was sent and never answered
 * (`posting`), are never taken as Tracy's: the first is refused, the second waits for a person —
 * nothing on Cloudflare says who made a hostname (`custom_metadata` is an Enterprise feature).
 *
 * 🔒 THE TOKEN NEVER LEAVES THE REQUEST HEADER. No answer, error, log line or row here carries it;
 * a failed call is told by a code (`TIMEOUT`, `HTTP_502`…), never by the request that made it.
 */

/** Cloudflare's API, unless a local stand names its stand-in (`config.js`). */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
/** How long one call may take, from asking to the last byte of the answer. */
const CALL_MS = 10_000
/** Cloudflare's error code for "a custom hostname of this name exists already". */
const DUPLICATE = 1406

/** Hostname statuses that end in a hostname that will never be active as it is. */
const HOSTNAME_FAILED = new Set(['blocked', 'moved', 'deleted', 'test_failed', 'test_blocked'])
/** Certificate statuses that end in a certificate that will never be issued as it is. */
const CERT_FAILED = new Set([
  'validation_timed_out',
  'issuance_timed_out',
  'deactivating',
  'inactive',
  'deleted',
  'expired',
  'pending_deletion'
])

/**
 * Why a hostname is not ready to serve, as the card is told it — or null when it is.
 *   HOSTNAME_PREPARING    no hostname yet: the reservation is not proven, or the create is queued
 *   HOSTNAME_UNCONFIRMED  a create was sent and never answered; nothing is taken as Tracy's
 *   HOSTNAME_CONFLICT     Cloudflare holds this name for somebody else
 *   HOSTNAME_PENDING      created; Cloudflare has not validated the name yet (the CNAME)
 *   HOSTNAME_FAILED       Cloudflare will not serve the name (blocked, moved, deleted)
 *   CERT_PENDING          the name is validated; its certificate is not issued yet
 *   CERT_FAILED           the certificate's validation or issuance ended without one
 *   HOSTNAME_UNREAD       the last read of the hostname failed (Cloudflare did not answer, or not
 *                         as a hostname): what was read before is not believed until a read succeeds
 */
export const HOSTNAME_REASONS = Object.freeze([
  'HOSTNAME_PREPARING',
  'HOSTNAME_UNCONFIRMED',
  'HOSTNAME_CONFLICT',
  'HOSTNAME_PENDING',
  'HOSTNAME_FAILED',
  'CERT_PENDING',
  'CERT_FAILED',
  'HOSTNAME_UNREAD'
])

/** What a hostname's statuses say, as one of {@link HOSTNAME_REASONS} or null (both active). */
export function statusReason(hostnameStatus, sslStatus) {
  if (HOSTNAME_FAILED.has(hostnameStatus)) return 'HOSTNAME_FAILED'
  if (CERT_FAILED.has(sslStatus)) return 'CERT_FAILED'
  if (hostnameStatus !== 'active') return 'HOSTNAME_PENDING'
  if (sslStatus !== 'active') return 'CERT_PENDING'
  return null
}

const text = (value, max = 255) => (typeof value === 'string' ? value.slice(0, max) : null)
const dnsName = (value) => (typeof value === 'string' ? value.toLowerCase().replace(/\.$/, '') : '')

/** More validation records than this, or a longer name or value, is not an answer this can show whole. */
const MAX_RECORDS = 32
const MAX_RECORD_NAME = 253
const MAX_RECORD_VALUE = 4096

/**
 * The DNS records a certificate's validation asks for, as `{ type, name, value }`, each once and each
 * WHOLE — the card tells the customer to create exactly these, so none is cut short or left out. An
 * answer with more of them, or longer ones, than {@link MAX_RECORDS} / {@link MAX_RECORD_VALUE} has
 * no list to show (null): an incomplete one would send the customer away with a set-up that cannot
 * work. It is a fact about the CARD only — the hostname's identity is read apart from it
 * ({@link readHostname}). An HTTP validation record is not one: Cloudflare serves it itself once the
 * name points at the zone.
 */
function validationRecords(ssl) {
  const found = []
  let whole = true
  const add = (type, name, value) => {
    const record = { type, name: dnsName(name), value: String(value) }
    if (!record.name || !record.value) return
    if (record.name.length > MAX_RECORD_NAME || record.value.length > MAX_RECORD_VALUE) whole = false
    else if (!found.some((r) => r.type === type && r.name === record.name && r.value === record.value))
      found.push(record)
  }
  for (const raw of Array.isArray(ssl?.validation_records) ? ssl.validation_records : []) {
    if (!raw || typeof raw !== 'object') continue
    if (typeof raw.txt_name === 'string' && typeof raw.txt_value === 'string')
      add('TXT', raw.txt_name, raw.txt_value)
    if (typeof raw.cname === 'string' && typeof raw.cname_target === 'string')
      add('CNAME', raw.cname, dnsName(raw.cname_target))
  }
  return whole && found.length <= MAX_RECORDS ? found : null
}

/**
 * One custom hostname as Cloudflare answered it, in the fields this reads; null when it is not one
 * (no id, or no name). 🔒 ITS IDENTITY NEVER DEPENDS ON WHAT IS SHOWN OF IT: a hostname whose
 * validation records cannot be shown whole is still this hostname, with its id — `records` is then
 * empty and `recordsWhole` false, and it is never ready while it still needs them
 * ({@link settleCreated}). Losing the id of a hostname Tracy made would leave it at Cloudflare with
 * nothing to delete it.
 */
export function readHostname(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.hostname !== 'string')
    return null
  const records = validationRecords(raw.ssl)
  return {
    id: raw.id.slice(0, 64),
    hostname: dnsName(raw.hostname),
    status: text(raw.status, 40) ?? 'unknown',
    sslStatus: text(raw.ssl?.status, 40) ?? 'unknown',
    records: records ?? [],
    recordsWhole: records !== null
  }
}

/**
 * The client of one zone's custom hostnames. Every call answers, never throws:
 *   create(name)  { created: H } · { duplicate: true } (certain: nothing made) ·
 *                 { refused: code } (certain: nothing made) · { uncertain: code } (it may exist now)
 *   get(id)       { found: H } · { gone: true } · { error: code } (`MALFORMED`: answered, not readable;
 *                 `MISMATCH`: answered for another id than the one asked)
 *   find(name)    { found: H[] } · { error: code } — an entry that is not a hostname, or not of `name`,
 *                 makes the whole answer unreadable (`MALFORMED`): it is never read as "nothing there"
 * 🔒 ONLY THE EXACT ANSWER TO THE QUESTION ASKED IS READ: a create's hostname is of the name sent, a
 * read's is of the id asked, a lookup's entries are all of the name asked. Anything else is an error —
 * never a different hostname taken for this one, and never an absence.
 *   remove(id)    { removed: true } (Cloudflare said it succeeded) · { gone: true } · { error: code }
 * @param {{ zoneId: string, token: string, apiBase?: string, fetchImpl?: typeof fetch, callMs?: number }} input
 */
export function cloudflareHostnames({
  zoneId,
  token,
  apiBase = CLOUDFLARE_API,
  fetchImpl = fetch,
  callMs = CALL_MS
}) {
  const base = `${apiBase.replace(/\/$/, '')}/zones/${encodeURIComponent(zoneId)}/custom_hostnames`
  /** One call: `{ status, body }` when an answer was read whole, or `{ error }`. */
  async function call(method, path, body) {
    const deadline = AbortSignal.timeout(callMs)
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: deadline
      })
      let parsed = null
      try {
        parsed = await response.json()
      } catch {
        /* An answer that is not JSON reads as no body. */
      }
      return { status: response.status, body: parsed && typeof parsed === 'object' ? parsed : null }
    } catch {
      return { error: deadline.aborted ? 'TIMEOUT' : 'UNREACHABLE' }
    }
  }
  const codes = (body) =>
    Array.isArray(body?.errors) ? body.errors.map((error) => Number(error?.code)).filter(Number.isFinite) : []
  const failure = (answer) => answer.error ?? `HTTP_${answer.status}`
  return {
    zoneId,
    // The second argument of every method is the shape the master (W1) and the shard adapter (W2)
    // agreed on (docs/sre/hop-dong-cua-shard.md §5): `originServer` is read here, `row` only by the
    // shard's adapter; this Cloudflare client ignores `row`.
    async create(name, { originServer = null, row: _row = null } = {}) {
      // `originServer`: a shard's own hostname (`custom_origin_server`, shard beta review amendment 7),
      // so the customer's traffic goes to that shard's tunnel and not to the zone's fallback origin.
      const answer = await call('POST', '', {
        hostname: name,
        ssl: { method: 'http', type: 'dv' },
        ...(originServer ? { custom_origin_server: originServer } : {})
      })
      if (answer.error) return { uncertain: answer.error }
      if (answer.status >= 200 && answer.status < 300 && answer.body?.success === true) {
        const created = readHostname(answer.body.result)
        return created && created.hostname === name ? { created } : { uncertain: 'MALFORMED' }
      }
      if (codes(answer.body).includes(DUPLICATE) || answer.status === 409) return { duplicate: true }
      // A 4xx that is not a timeout or a rate limit was refused before anything was made.
      if (answer.status >= 400 && answer.status < 500 && answer.status !== 408 && answer.status !== 429)
        return { refused: failure(answer) }
      return { uncertain: failure(answer) }
    },
    async get(id, { row: _row = null } = {}) {
      const answer = await call('GET', `/${encodeURIComponent(id)}`)
      if (answer.error) return { error: answer.error }
      if (answer.status === 404) return { gone: true }
      const success = answer.status === 200 && answer.body?.success === true
      const found = success ? readHostname(answer.body.result) : null
      if (found) return found.id === id ? { found } : { error: 'MISMATCH' }
      return { error: success ? 'MALFORMED' : failure(answer) }
    },
    async find(name, { row: _row = null } = {}) {
      const answer = await call('GET', `?hostname=${encodeURIComponent(name)}`)
      if (answer.error) return { error: answer.error }
      if (answer.status !== 200 || answer.body?.success !== true || !Array.isArray(answer.body.result))
        return { error: failure(answer) }
      const all = answer.body.result.map(readHostname)
      if (all.some((h) => h === null || h.hostname !== name)) return { error: 'MALFORMED' }
      return { found: all }
    },
    async remove(id, { row: _row = null } = {}) {
      const answer = await call('DELETE', `/${encodeURIComponent(id)}`)
      if (answer.error) return { error: answer.error }
      if (answer.status === 404) return { gone: true }
      // 🔒 REMOVED ONLY WHEN CLOUDFLARE SAYS SO: its envelope with `success: true`, or a 204, which
      // carries no body by definition. Any other answer — a 2xx saying `success: false` among them —
      // keeps the row and its id, the only record of what is left to delete.
      if (
        answer.status === 204 ||
        (answer.status >= 200 && answer.status < 300 && answer.body?.success === true)
      )
        return { removed: true }
      return { error: answer.status >= 200 && answer.status < 300 ? 'UNCONFIRMED' : failure(answer) }
    }
  }
}

/** The `zone_id` of every hostname a shard registers through the master. */
export const BROKERED_ZONE = 'master'

/**
 * The master's custom-hostname answer (docs/sre/hop-dong-cua-shard.md §5:
 * `{hostname, id, status, sslStatus, validationRecords: [{type, name, value}]}`) in the shape
 * Cloudflare answers and `readHostname` reads, so every line of own-domain code below is the same
 * on a shard and on the master. A record of a type the card does not show is left out.
 */
export function cloudflareShapeOf(answer) {
  if (!answer || typeof answer !== 'object') return null
  const records = Array.isArray(answer.validationRecords) ? answer.validationRecords : []
  return {
    id: answer.id,
    hostname: answer.hostname,
    status: answer.status,
    ssl: {
      status: answer.sslStatus,
      validation_records: records.map((r) => {
        const type = String(r?.type ?? '').toUpperCase()
        if (type === 'TXT') return { txt_name: r.name, txt_value: r.value }
        if (type === 'CNAME') return { cname: r.name, cname_target: r.value }
        return {}
      })
    }
  }
}

/**
 * Custom hostnames on a shard (shard beta, amendment 4, contract §5): an ADAPTER. Towards the
 * own-domain code it is the client of `cloudflareHostnames` — create, get, find, remove, each a
 * closed set of outcomes, never throwing; towards the master it speaks the three ops of
 * `POST /api/shards/:name/custom-hostname`:
 *   create(name, {row})  → op add     the hostname of `name`; 404 UNKNOWN_SITE, 409 DOMAIN_TAKEN or
 *                                     another 4xx (not 408/429) is a certain refusal (nothing made);
 *                                     502 CLOUDFLARE, a 5xx, 408, 429 or no answer is uncertain. Never
 *                                     `duplicate`: `add` answers the hostname that is already there.
 *   get(id, {row})       → op status  the hostname, only when its id is `id` (else MISMATCH);
 *                                     `200 {status: "absent"}` (never registered, contract §5) or
 *                                     `404 HOSTNAME_GONE` (Cloudflare lost it, contract §6) is `gone`,
 *                                     so the own-domain code makes it again under a new id.
 *   find(name, {row})    → op status  that one hostname, as a list of one; absent or gone is an
 *                                     empty list, as Cloudflare's own `find` answers.
 *   remove(id, {row})    → op remove  done; 404 UNKNOWN_SITE is `gone` — the master no longer holds the
 *                                     site for this shard, so nothing is left to remove through it.
 * The master alone holds the Cloudflare for SaaS token and creates the hostname with this shard as
 * its `custom_origin_server`. The signature is the one `cloudflareHostnames` has (contract §5, shared
 * with W1): `create(name, {originServer, row})`, `get/find/remove(…, {row})` — `row` is the
 * `site_custom_hostname` (or orphan) row the call is about, since the master is asked by domain and
 * site; `originServer` is the master's concern and is ignored here. A hostname is read with
 * `readHostname`, and one of another name is never this one.
 * @param {{ call: (body: {siteKey: string|null, domain: string, op: 'add'|'status'|'remove'}) =>
 *   Promise<{ok: boolean, status: number, body: any}> }} input
 */
export function brokeredHostnames({ call }) {
  const failure = (answer) => (answer.status === 0 ? 'UNREACHABLE' : `HTTP_${answer.status}`)
  const code = (answer) =>
    typeof answer.body?.code === 'string' ? answer.body.code.slice(0, 40) : failure(answer)
  const certainRefusal = (answer) =>
    answer.status >= 400 && answer.status < 500 && answer.status !== 408 && answer.status !== 429
  /** The master says there is no hostname of `name`: never registered (200 absent) or lost (404 HOSTNAME_GONE). */
  const nothingThere = (answer, name) =>
    (answer.ok && answer.body?.status === 'absent' && answer.body?.hostname === name) ||
    (!answer.ok && answer.status === 404 && answer.body?.code === 'HOSTNAME_GONE')
  /** The hostname the master answered, only when it is of `name`. */
  const one = (answer, name) => {
    const found = readHostname(cloudflareShapeOf(answer.body))
    return found && found.hostname === name ? found : null
  }
  return {
    zoneId: BROKERED_ZONE,
    async create(name, { row = null } = {}) {
      const answer = await call({ siteKey: row?.site_key ?? null, domain: name, op: 'add' })
      if (!answer.ok) return certainRefusal(answer) ? { refused: code(answer) } : { uncertain: code(answer) }
      const created = one(answer, name)
      return created ? { created } : { uncertain: 'MALFORMED' }
    },
    async get(id, { row = null } = {}) {
      if (!row?.name) return { error: 'NO_ROW' }
      const answer = await call({ siteKey: row.site_key ?? null, domain: row.name, op: 'status' })
      if (nothingThere(answer, row.name)) return { gone: true }
      if (!answer.ok) return { error: code(answer) }
      const found = one(answer, row.name)
      if (!found) return { error: 'MALFORMED' }
      return found.id === id ? { found } : { error: 'MISMATCH' }
    },
    async find(name, { row = null } = {}) {
      const answer = await call({ siteKey: row?.site_key ?? null, domain: name, op: 'status' })
      if (nothingThere(answer, name)) return { found: [] }
      if (!answer.ok) return { error: code(answer) }
      const found = one(answer, name)
      return found ? { found: [found] } : { error: 'MALFORMED' }
    },
    async remove(id, { row = null } = {}) {
      if (!row?.name) return { error: 'NO_ROW' }
      const answer = await call({ siteKey: row.site_key ?? null, domain: row.name, op: 'remove' })
      if (answer.ok) return { removed: true }
      if (answer.status === 404 && answer.body?.code === 'UNKNOWN_SITE') return { gone: true }
      return { error: code(answer) }
    }
  }
}

/**
 * The client a deployment configured (`config.customHostnames`), or null: own domains are then off.
 * On a shard it is the master-brokered adapter around `broker` — the signed custom-hostname call the
 * composition root hands in (`shard/master-link.js` `hostnameBroker`); without one, null.
 */
export function hostnamesFromConfig(config, fetchImpl = fetch, broker = null) {
  const saas = config?.customHostnames
  if (saas?.brokered === true)
    return typeof broker === 'function' ? brokeredHostnames({ call: broker }) : null
  if (!saas || typeof saas.zoneId !== 'string' || typeof saas.token !== 'string') return null
  return cloudflareHostnames({ zoneId: saas.zoneId, token: saas.token, apiBase: saas.apiBase, fetchImpl })
}

/** The name a customer points their domain at: the proxied record of the site zone. */
export const connectTarget = (config) =>
  `${config.ownDomainLabels?.connect ?? 'connect'}.${config.siteDomain}`

/**
 * A reservation that is still the one a row was made for: same name, site and token, being
 * connected or connected. A row with none is to be deleted at Cloudflare.
 */
const BOUND = `exists (select 1 from site_name n
   where n.name = h.name and n.site_key = h.site_key and n.token = h.token
     and n.kind = 'custom' and n.state in ('pending', 'active'))`

/**
 * How long a claimed row keeps every other pass off it: longer than one row's calls can take. A
 * claim is also a GENERATION (`claim_id`): every write of a pass is fenced by its own, so a pass that
 * outlived its claim writes nothing on a row another pass took since, and lets go of no claim but its
 * own.
 */
const CLAIM = "interval '2 minutes'"
/** A hostname not ready yet is read again after 15 s, doubling to 15 min. */
const BACKOFF = "least(interval '15 minutes', interval '15 seconds' * power(2, least(tries, 6)))"
/** A ready hostname is read again this often: Cloudflare may take it away (a certificate expires). */
const READY_AGAIN = "interval '6 hours'"
/** A row this cannot act on alone (a create never answered, a conflict) is looked at this often. */
const STUCK_AGAIN = "interval '1 hour'"

/**
 * Give every PROVEN reservation without a row one in `creating`: a reservation whose `_tracy` TXT
 * record was found (`ownership_proven_at`), or a name connected before this slice. A hostname is
 * created only for a name somebody proved they control — never for a name merely typed.
 * @param {{ query: Function }} db
 * @param {{ zoneId: string, name?: string | null }} input
 */
export async function ensureHostnames(db, { zoneId, name = null }) {
  await db.query(
    `insert into site_custom_hostname (name, zone_id, site_key, token, state)
     select n.name, $1, n.site_key, n.token, 'creating' from site_name n
      where n.kind = 'custom' and n.state in ('pending', 'active') and n.token is not null
        and (n.ownership_proven_at is not null or n.state = 'active')
        and ($2::text is null or n.name = $2)
        and not exists (select 1 from site_custom_hostname h where h.name = n.name)
     on conflict (name) do nothing`,
    [zoneId, name]
  )
}

/**
 * Mark every row whose reservation is gone: one never created (or refused, or a conflict) goes at
 * once — nothing of it is at Cloudflare that is Tracy's — and one that was created, or whose create
 * was never answered, is to be deleted there. A row being created right now keeps its claim.
 */
async function markUnbound(db, name) {
  // A row a pass holds is left to that pass: it writes what its call answered, under its claim.
  await db.query(
    `delete from site_custom_hostname h
      where h.state in ('creating', 'conflict') and not ${BOUND} and ($1::text is null or h.name = $1)
        and (h.claimed_until is null or h.claimed_until <= clock_timestamp())`,
    [name]
  )
  await db.query(
    `update site_custom_hostname h
        set state = 'deleting', tries = 0, reason = null, updated_at = now(),
            -- Due now: a ready hostname waits hours for its next read, and the name it serves is
            -- no one's any more. A create still in the air is not taken meanwhile: its pass holds
            -- the row (claimed_until), and writes the id it is answered on this row.
            next_at = clock_timestamp()
      where h.state in ('created', 'posting') and not ${BOUND} and ($1::text is null or h.name = $1)`,
    [name]
  )
}

/**
 * Do what each due row asks of Cloudflare, and write what Cloudflare answered — on the row as it was
 * claimed (same name and token), so a late answer never lands on a newer reservation's row.
 *
 * 🔒 ONE PASS AT A TIME ON A ROW, FORCED OR NOT. A row is claimed (`claimed_until`) before anything is
 * asked and let go when its pass ends; `force` (Check DNS, the probe's read just before it asks) makes
 * a row due early but never takes one another pass holds. A create in the air can therefore not be
 * looked up by name meanwhile, found missing and sent again — which would leave the first answer's id
 * with no row to land on. Its answer is written only on the row of the create that was sent
 * (`attempt`).
 *
 *   creating  `posting` is written BEFORE the create is sent: a process that dies with the call in
 *             the air leaves a row that says so. Created → `created`; already held → `conflict`;
 *             refused → `creating` again later; no answer → stays `posting`
 *   posting   asked by name: nothing there → the create never landed, `creating` again (or the row
 *             goes, its reservation gone). Something there → not taken; it waits for a person
 *   created   read by its id: statuses written; the moment both are active, a routed name of the
 *             reservation is due for its HTTPS probe at once. Gone at Cloudflare → created again
 *   conflict  asked by name: free again → `creating`; still held → looked at hourly
 *   deleting  deleted by its id (gone already counts); the row goes. Without an id it is asked by
 *             name, and only an empty answer lets the row go
 * Rows of another zone than the client's are left for a person (`ZONE_CHANGED`).
 *
 * 🔒 EVERY HOSTNAME TRACY WAS TOLD IT CREATED IS DELETED OR KEPT — NEVER FORGOTTEN. A create answered
 * to a pass that can no longer write it on its row (its claim taken by a later pass, its attempt
 * superseded, the row gone) is kept in `site_custom_hostname_orphan` with its id, and deleted there
 * by id on every pass until Cloudflare says it is gone ({@link deleteOrphans}).
 * @param {import('pg').Pool} pool
 * @param {{ hostnames: ReturnType<typeof cloudflareHostnames>, name?: string | null,
 *   force?: boolean, limit?: number, log?: Pick<Console, 'warn' | 'error'> }} input
 * @returns {Promise<{ taken: number, ready: string[], deleted: string[] }>}
 */
export async function reconcileHostnames(
  pool,
  { hostnames, name = null, force = false, limit = 20, log = console }
) {
  await ensureHostnames(pool, { zoneId: hostnames.zoneId, name })
  await markUnbound(pool, name)
  const { rows } = await pool.query(
    `with due as (
       select name from site_custom_hostname
        where ($1::text is null or name = $1)
          and (claimed_until is null or claimed_until <= clock_timestamp())
          and ($2 or next_at <= clock_timestamp())
        order by next_at, name
        limit $3
        for update skip locked)
     update site_custom_hostname h
        set next_at = clock_timestamp() + ${CLAIM}, claimed_until = clock_timestamp() + ${CLAIM},
            claim_id = gen_random_uuid()
       from due where h.name = due.name
     returning h.*`,
    [name, force, limit]
  )
  const out = { taken: rows.length, ready: [], deleted: [] }
  for (const row of rows) {
    try {
      await reconcileOne(pool, hostnames, row, out, log)
    } catch (error) {
      log.error?.(`[own-domain] ${row.name}: custom hostname not reconciled`, error?.message ?? error)
    } finally {
      // Let go of THIS pass's claim only: a later pass may hold the row by now.
      await pool
        .query(
          'update site_custom_hostname set claimed_until = null, claim_id = null where name = $1 and claim_id = $2',
          [row.name, row.claim_id]
        )
        .catch(() => {})
    }
  }
  if (name === null) await deleteOrphans(pool, hostnames, log)
  return out
}

async function reconcileOne(pool, hostnames, row, out, log) {
  const mine = [row.name, row.token, row.claim_id]
  /**
   * Write on the row this pass claimed — same name, token AND claim — in one of `states` (and, given
   * one, of that create `attempt`); answers whether it was still there.
   */
  const write = async (set, params = [], states = [row.state], attempt = null) => {
    const all = [...mine, states, ...params]
    let where = 'name = $1 and token = $2 and claim_id = $3 and state = any($4::text[])'
    if (attempt !== null) {
      all.push(attempt)
      where += ` and attempt = $${all.length}`
    }
    return (
      (await pool.query(`update site_custom_hostname set ${set}, updated_at = now() where ${where}`, all))
        .rowCount === 1
    )
  }
  const later = (reason, every = BACKOFF) =>
    write(`reason = $5, tries = tries + 1, next_at = clock_timestamp() + ${every}`, [reason])
  const forget = async () => {
    const gone = await pool.query(
      'delete from site_custom_hostname where name = $1 and token = $2 and claim_id = $3',
      mine
    )
    if (gone.rowCount === 1) out.deleted.push(row.name)
  }
  if (row.zone_id !== hostnames.zoneId) return later('ZONE_CHANGED', STUCK_AGAIN)

  if (row.state === 'creating') {
    const attempt = row.attempt + 1
    if (!(await write("state = 'posting', reason = null, attempt = attempt + 1"))) return
    const made = await hostnames.create(row.name, { row })
    if (made.created) {
      if (await settleCreated(pool, row, made.created, out, attempt)) return
      // Made, and this pass can no longer say so on the row: kept by its id, to be deleted.
      return keepOrphan(pool, hostnames.zoneId, row.name, made.created.id)
    }
    // Certain that nothing was made: a row whose reservation went meanwhile (`deleting`) has
    // nothing at Cloudflare to delete.
    if ((made.duplicate || made.refused) && (await write('tries = tries', [], ['deleting'], attempt)))
      return forget()
    if (made.duplicate)
      return write(
        `state = 'conflict', reason = 'HOSTNAME_CONFLICT', tries = 0, next_at = clock_timestamp() + ${STUCK_AGAIN}`,
        [],
        ['posting'],
        attempt
      )
    if (made.refused)
      return write(
        `state = 'creating', reason = $5, tries = tries + 1, next_at = clock_timestamp() + ${BACKOFF}`,
        [`REFUSED_${made.refused}`.slice(0, 40)],
        ['posting'],
        attempt
      )
    // No answer that says what became of it: whatever is at Cloudflare now may be this create.
    return write(
      `reason = 'HOSTNAME_UNCONFIRMED', tries = tries + 1, next_at = clock_timestamp() + ${BACKOFF}`,
      [],
      ['posting', 'deleting'],
      attempt
    )
  }

  if (row.state === 'posting' || row.state === 'conflict' || (row.state === 'deleting' && !row.provider_id)) {
    const looked = await hostnames.find(row.name, { row })
    if (looked.error) return later(row.state === 'conflict' ? 'HOSTNAME_CONFLICT' : 'HOSTNAME_UNCONFIRMED')
    if (looked.found.length === 0) {
      if (row.state === 'deleting') return forget()
      // Nothing under the name: the create never landed, or the other holder let it go.
      return write(`state = 'creating', reason = null, tries = 0, next_at = clock_timestamp()`)
    }
    // 🔒 SOMETHING IS THERE, AND NOTHING SAYS TRACY MADE IT FOR THIS RESERVATION: it is not taken.
    if (row.state !== 'conflict')
      log.warn?.(
        `[own-domain] ${row.name}: a hostname exists at Cloudflare that Tracy cannot prove it created; left for a person`
      )
    return later(row.state === 'conflict' ? 'HOSTNAME_CONFLICT' : 'HOSTNAME_UNCONFIRMED', STUCK_AGAIN)
  }

  if (row.state === 'deleting') {
    const removed = await hostnames.remove(row.provider_id, { row })
    if (removed.removed || removed.gone) return forget()
    return later(`DELETE_${removed.error}`.slice(0, 40))
  }

  // created
  const read = await hostnames.get(row.provider_id, { row })
  if (read.gone)
    // Taken away at Cloudflare (by hand, say): made again, under a new id, if the name is still one.
    return write(
      `state = 'creating', provider_id = null, hostname_status = null, ssl_status = null,
       records = '[]'::jsonb, reason = null, tries = 0, next_at = clock_timestamp()`
    )
  if (read.error) return later(`READ_${read.error}`.slice(0, 40))
  if (read.found.hostname !== row.name) return later('HOSTNAME_CONFLICT', STUCK_AGAIN)
  await settleCreated(pool, row, read.found, out)
}

/** A hostname Tracy created that no row can carry any more: kept by its id until it is deleted. */
async function keepOrphan(db, zoneId, name, providerId) {
  await db.query(
    `insert into site_custom_hostname_orphan (provider_id, zone_id, name)
     values ($1, $2, $3) on conflict (provider_id) do nothing`,
    [providerId, zoneId, name]
  )
}

/**
 * Delete at Cloudflare, by id, every hostname kept in `site_custom_hostname_orphan` that is due; a
 * row goes only once Cloudflare said it is deleted, or gone already. A name held back by one (a later
 * create of it answered `conflict`) is looked at again at once.
 */
async function deleteOrphans(pool, hostnames, log) {
  const { rows } = await pool.query(
    `with due as (
       select provider_id from site_custom_hostname_orphan
        where zone_id = $1 and next_at <= clock_timestamp()
        order by next_at limit 20 for update skip locked)
     update site_custom_hostname_orphan o set next_at = clock_timestamp() + ${CLAIM}
       from due where o.provider_id = due.provider_id
     returning o.*`,
    [hostnames.zoneId]
  )
  for (const orphan of rows) {
    try {
      const removed = await hostnames.remove(orphan.provider_id, { row: orphan })
      if (removed.removed || removed.gone) {
        await pool.query('delete from site_custom_hostname_orphan where provider_id = $1', [
          orphan.provider_id
        ])
        await pool.query(
          "update site_custom_hostname set next_at = clock_timestamp() where name = $1 and state = 'conflict'",
          [orphan.name]
        )
      } else
        await pool.query(
          `update site_custom_hostname_orphan
              set reason = $2, tries = tries + 1, next_at = clock_timestamp() + ${BACKOFF}
            where provider_id = $1`,
          [orphan.provider_id, `DELETE_${removed.error}`.slice(0, 40)]
        )
    } catch (error) {
      log.error?.(`[own-domain] ${orphan.name}: an orphan hostname was not deleted`, error?.message ?? error)
    }
  }
}

/**
 * Write a hostname Cloudflare answered for this row — under this pass's claim, and of create
 * `attempt` when it is a create's answer — and make a routed name due once it is ready. A row whose
 * reservation went meanwhile (`deleting`) keeps the id and is due for its delete at once, whatever the
 * statuses say. A hostname still waiting on validation records that cannot be shown whole is not
 * ready, and reads as unread (`READ_RECORDS`): the customer cannot be told what to create. Answers
 * whether the row took it.
 */
async function settleCreated(pool, row, found, out, attempt = null) {
  const status = statusReason(found.status, found.sslStatus)
  const reason = status !== null && !found.recordsWhole ? 'READ_RECORDS' : status
  const { rows } = await pool.query(
    `update site_custom_hostname
        set provider_id = $3, state = case when state = 'posting' then 'created' else state end,
            hostname_status = $4, ssl_status = $5, records = $6::jsonb, reason = $7, read_at = now(),
            tries = case when $7::text is null then 0 else tries + 1 end,
            next_at = case when state = 'deleting' then clock_timestamp()
                           when $7::text is null then clock_timestamp() + ${READY_AGAIN}
                           else clock_timestamp() + ${BACKOFF} end,
            updated_at = now()
      where name = $1 and token = $2 and claim_id = $9 and state in ('posting', 'created', 'deleting')
        -- The id on a row is never replaced: a row carries the one hostname it was answered for.
        and (provider_id is null or provider_id = $3)
        and ($8::int is null or attempt = $8)
      returning state, (hostname_status is distinct from $4 or ssl_status is distinct from $5) as moved`,
    [
      row.name,
      row.token,
      found.id,
      found.status,
      found.sslStatus,
      JSON.stringify(found.records),
      reason,
      attempt,
      row.claim_id
    ]
  )
  if (!rows[0]) return false
  if (rows[0].state !== 'created' || reason !== null) return true
  out.ready.push(row.name)
  // Ready now: a name whose route is installed is asked at once rather than at its next backoff.
  await pool.query(
    `update site_name set probe_next_at = clock_timestamp()
      where name = $1 and site_key = $2 and token = $3 and kind = 'custom'
        and routed_at is not null and probe_secret is not null and connected_at is null`,
    [row.name, row.site_key, row.token]
  )
  return true
}

/**
 * Whether Cloudflare serves the reservation's name with a valid certificate, as last read:
 * `{ ready: true }`, or `{ ready: false, reason }` ({@link HOSTNAME_REASONS}). Read from the row on
 * `db` — the caller's transaction when it writes a connection on it.
 * @param {{ query: Function }} db
 * @param {{ name: string, siteKey: string }} row
 */
export async function hostnameGate(db, { name, siteKey }) {
  const { rows } = await db.query(
    `select h.state, h.hostname_status, h.ssl_status, h.reason from site_custom_hostname h
       join site_name n on n.name = h.name and n.site_key = h.site_key and n.token = h.token
      where h.name = $1 and h.site_key = $2`,
    [name, siteKey]
  )
  return gateOf(rows[0] ?? null)
}

/**
 * {@link hostnameGate} of a row already read (`state`, `hostname_status`, `ssl_status`, `reason`), or
 * of none. 🔒 READY ONLY ON THE LAST READ, AND ONLY WHEN IT SUCCEEDED: a read that failed, or that
 * answered another name, leaves `reason` set, and statuses read before it are not believed until a
 * read succeeds again (`HOSTNAME_UNREAD`, or the read's own reason).
 */
export function gateOf(row) {
  if (!row || row.state === 'creating') return { ready: false, reason: 'HOSTNAME_PREPARING' }
  if (row.state === 'posting') return { ready: false, reason: 'HOSTNAME_UNCONFIRMED' }
  if (row.state !== 'created') return { ready: false, reason: 'HOSTNAME_CONFLICT' }
  if (row.reason)
    return { ready: false, reason: HOSTNAME_REASONS.includes(row.reason) ? row.reason : 'HOSTNAME_UNREAD' }
  const reason = statusReason(row.hostname_status, row.ssl_status)
  return reason === null ? { ready: true } : { ready: false, reason }
}

/**
 * The row of a reservation as the card reads it — `{ state, hostname_status, ssl_status, records }`
 * of the hostname made for exactly this name, site and token — or null.
 */
export async function hostnameOfReservation(db, { name, siteKey, token }) {
  const { rows } = await db.query(
    `select state, hostname_status, ssl_status, records, reason from site_custom_hostname
      where name = $1 and site_key = $2 and token = $3`,
    [name, siteKey, token]
  )
  return rows[0] ?? null
}

/**
 * Whether a name may be reserved by `siteKey` now: a row left by an earlier reservation (another
 * site's, or this site's own removed one) is still being deleted at Cloudflare. Null when free.
 */
export async function releasing(db, { name, siteKey, token = null }) {
  // A hostname of the name Tracy made and lost track of is being deleted too: nobody's create of the
  // name can land before it is gone.
  const orphan = await db.query('select 1 from site_custom_hostname_orphan where name = $1 limit 1', [name])
  if (orphan.rows.length > 0) return 'DOMAIN_RELEASING'
  const { rows } = await db.query('select site_key, token from site_custom_hostname where name = $1', [name])
  const row = rows[0]
  if (!row) return null
  return row.site_key === siteKey && token !== null && row.token === token ? null : 'DOMAIN_RELEASING'
}
