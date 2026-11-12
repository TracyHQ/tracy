/**
 * Webhooks of `/v1/demos` (migration 217): an account registers one https address (`PUT /v1/demos/webhook`) and Tracy
 * POSTs it a signed event when one of its demos is accepted (`demo.accepted`), completes (`demo.completed`), fails
 * (`demo.failed`, its bounded error code only) or is opened through its share link (`demo.opened`,
 * `lib/wo-demo-links.js`).
 *
 * 🔒 AN EVENT IS MADE FROM COMMITTED ROWS, NEVER INSIDE THE CHANGE. The sweep (`tick`, every few seconds from
 * `cron.js`) compares what is committed (the demo's action status, its counted opens) with the events already made,
 * and makes the missing ones. No build path calls this file, so a webhook can neither hold a build nor fail one, and
 * a status that a build wrote and rolled back never becomes an event. Events are made only for demos accepted since
 * the account's webhook was registered (`since`); each demo has each event once (`dedupe_key`).
 *
 * 🔒 THE OUTBOX IS THE ONLY WAY OUT. Each event's body is frozen when it is made (`{id, type, createdAt, demo}`, `demo`
 * the shape `GET /v1/demos/:id` answers), so every attempt sends the same bytes and the same `id`; a receiver dedupes
 * on `id`. Delivery is at least once: a process that stops between the POST and its settle sends that event again.
 * Each attempt is signed `X-Tracy-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`, waits at most
 * 10 s, follows no redirect, and goes through the crawler's pinned fetch (`app.js` `crawlFetch`), which refuses a
 * private, loopback or link-local address at connect time as the registration refused it by name. A 2xx answer
 * delivers; anything else waits `retryDelayMs` and tries again, 8 attempts in all, then the event is given up. An
 * account with no live address any more gives its pending events up at their next attempt.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { openSecret, sealSecret } from '../lib/secret-box.js'

export const WEBHOOK_EVENTS = Object.freeze(['demo.accepted', 'demo.completed', 'demo.failed', 'demo.opened'])
export const WEBHOOK_LIMITS = Object.freeze({
  urlMax: 2048,
  timeoutMs: 10_000,
  maxAttempts: 8,
  /** Events one sweep sends, in parallel. */
  batch: 20,
  /** How long a claimed event is kept from other replicas while its POST runs. */
  leaseMs: 60_000,
  /** Events one sweep makes. */
  enqueueBatch: 100,
  /** How far back a demo (or an open) is looked at for events still to make. */
  lookbackDays: 30,
  /** Delivered or given-up events are deleted this long after they were made. */
  keepDays: 30
})
const DAY_MS = 86_400_000
const PRUNE_EVERY_MS = 3_600_000

/** The wait after the `attempts`-th failed attempt: 30 s, 90 s, 4.5 min, … tripling, at most 6 h. */
export function retryDelayMs(attempts) {
  return Math.min(6 * 3_600_000, 30_000 * 3 ** Math.max(0, attempts - 1))
}

/** A signing secret: `whsec_` and 32 random bytes in base64url. The HMAC key is the whole string. */
export const newWebhookSecret = () => `whsec_${randomBytes(32).toString('base64url')}`

/** The `X-Tracy-Signature` of `body` sent at `unixSeconds`. */
export function signatureHeader(secret, body, unixSeconds) {
  const v1 = createHmac('sha256', secret).update(`${unixSeconds}.${body}`).digest('hex')
  return `t=${unixSeconds},v1=${v1}`
}

/** `assertPublicUrl`'s reasons as the codes `PUT /v1/demos/webhook` answers. */
const REFUSED = {
  invalid_url: 'INVALID_URL',
  scheme: 'HTTPS_REQUIRED',
  credentials: 'CREDENTIALS_NOT_ALLOWED',
  port: 'PORT_NOT_ALLOWED',
  private_address: 'PRIVATE_ADDRESS',
  dns_failed: 'HOST_NOT_FOUND',
  dns_empty: 'HOST_NOT_FOUND',
  dns_unavailable: 'HOST_NOT_FOUND'
}

/**
 * The address to keep for a webhook, or why it is refused: https only, no user or password in it, the default port,
 * and a host whose every DNS answer is public (not private, loopback, link-local or cloud metadata). The fragment is
 * dropped.
 * @param {unknown} raw
 * @param {{ domain: { assertPublicUrl: Function }, resolve: Function }} deps
 * @returns {Promise<{ url: string } | { code: string }>}
 */
export async function checkWebhookUrl(raw, { domain, resolve }) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > WEBHOOK_LIMITS.urlMax)
    return { code: 'INVALID_URL' }
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return { code: 'INVALID_URL' }
  }
  if (url.protocol !== 'https:') return { code: 'HTTPS_REQUIRED' }
  if (url.username || url.password) return { code: 'CREDENTIALS_NOT_ALLOWED' }
  try {
    await domain.assertPublicUrl(url, { resolve })
  } catch (error) {
    if (error?.code !== 'URL_BLOCKED') throw error
    return { code: REFUSED[error.reason] ?? 'PRIVATE_ADDRESS' }
  }
  url.hash = ''
  return { url: url.href }
}

/** What `GET /v1/demos/webhook` answers of the account's live webhook, or null. Never its secret. */
export async function webhookOf(db, accountId) {
  const { rows } = await db.query(
    `select w.url, w.created_at, w.since,
       (select count(*)::int from wo_demo_webhook_event e
         where e.account_id = w.account_id and e.delivered_at is null and e.gave_up_at is null) as pending,
       (select count(*)::int from wo_demo_webhook_event e
         where e.account_id = w.account_id and e.gave_up_at is not null and e.created_at >= w.since) as failed,
       (select max(e.delivered_at) from wo_demo_webhook_event e where e.account_id = w.account_id) as last_delivered_at
     from wo_demo_webhook w where w.account_id = $1 and w.revoked_at is null`,
    [accountId]
  )
  const w = rows[0]
  if (!w) return null
  return {
    url: w.url,
    events: [...WEBHOOK_EVENTS],
    createdAt: new Date(w.created_at).toISOString(),
    since: new Date(w.since).toISOString(),
    deliveries: {
      pending: w.pending,
      failed: w.failed,
      lastDeliveredAt: w.last_delivered_at ? new Date(w.last_delivered_at).toISOString() : null
    }
  }
}

/**
 * Register (or replace) the account's one webhook, with a new signing secret answered once. A replaced address keeps
 * the `since` of the one before, so a demo in flight still gets its events at the new address.
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ webhook: object, secret: string }>}
 */
export async function registerWebhook(pool, { accountId, url, grantId = null, sessionSecret, now }) {
  const secret = newWebhookSecret()
  const sealed = await sealSecret(secret, sessionSecret)
  const at = new Date(now)
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `wo-demo-webhook:${accountId}`
    ])
    const { rows } = await client.query(
      `update wo_demo_webhook set revoked_at = $2 where account_id = $1 and revoked_at is null returning since`,
      [accountId, at]
    )
    await client.query(
      `insert into wo_demo_webhook (id, account_id, url, secret_box, since, grant_id, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), accountId, url, sealed, rows[0]?.since ?? at, grantId, at]
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  return { webhook: await webhookOf(pool, accountId), secret }
}

/** Remove the account's webhook; its pending events are given up at their next attempt. Answers whether one was live. */
export async function removeWebhook(db, accountId, now) {
  const { rowCount } = await db.query(
    'update wo_demo_webhook set revoked_at = $2 where account_id = $1 and revoked_at is null',
    [accountId, new Date(now)]
  )
  return rowCount > 0
}

/** Demos with an event due: accepted since the account's live webhook, and each event not made yet. */
const STATE_EVENTS_SQL = `select d.id as demo_id, d.account_id, t.type
  from wo_public_demo d
  join wo_demo_webhook w on w.account_id = d.account_id and w.revoked_at is null
  join wo_demo_action a on a.id = d.action_id
  cross join lateral (values
    ('demo.accepted', true),
    ('demo.completed', d.cancelled_at is null and a.status = any($1::text[])),
    ('demo.failed', d.cancelled_at is null and a.status = any($2::text[]))) t(type, due)
  where t.due and d.created_at >= w.since and d.created_at >= $3
    and not exists (select 1 from wo_demo_webhook_event e where e.dedupe_key = d.id::text || ':' || t.type)
  order by d.created_at, t.type
  limit $4`

/** Counted opens of those demos' share links, each not made an event yet. */
const OPEN_EVENTS_SQL = `select d.id as demo_id, d.account_id, o.id as open_id
  from wo_demo_open o
  join wo_demo_link l on l.id = o.link_id
  join wo_build b on b.id = l.build_id
  join wo_demo_action a on a.account_id = b.account_id and a.build_request_id = b.request_id
  join wo_public_demo d on d.action_id = a.id
  join wo_demo_webhook w on w.account_id = d.account_id and w.revoked_at is null
  where d.created_at >= w.since and o.opened_at >= w.since and o.opened_at >= $1
    and not exists (select 1 from wo_demo_webhook_event e where e.dedupe_key = d.id::text || ':opened:' || o.id::text)
  order by o.opened_at
  limit $2`

/**
 * The webhook sweep: `tick()` makes the events due, then sends the due ones.
 * @param {{
 *   pool: import('pg').Pool,
 *   sessionSecret: string,
 *   fetchImpl: typeof fetch,
 *   demoBody: (accountId: string, demoId: string) => Promise<object | null>,
 *   completed: string[], failed: string[],
 *   now?: () => number, log?: Pick<Console, 'warn'>
 * }} deps `demoBody` is the demo as `GET /v1/demos/:id` shapes it (`public-demos.js` `snapshot`); `completed` and
 *   `failed` the action statuses of a completed and a failed demo.
 */
export function createDemoWebhooks({
  pool,
  sessionSecret,
  fetchImpl,
  demoBody,
  completed,
  failed,
  now = Date.now,
  log = console
}) {
  let running = null
  let prunedAt = 0

  /** Make the events due; answers how many were made. */
  async function enqueue() {
    const at = now()
    const from = new Date(at - WEBHOOK_LIMITS.lookbackDays * DAY_MS)
    const [states, opens] = await Promise.all([
      pool.query(STATE_EVENTS_SQL, [completed, failed, from, WEBHOOK_LIMITS.enqueueBatch]),
      pool.query(OPEN_EVENTS_SQL, [from, WEBHOOK_LIMITS.enqueueBatch])
    ])
    const due = [
      ...states.rows.map((r) => ({ ...r, key: `${r.demo_id}:${r.type}` })),
      ...opens.rows.map((r) => ({ ...r, type: 'demo.opened', key: `${r.demo_id}:opened:${r.open_id}` }))
    ]
    let made = 0
    for (const event of due) {
      let demo
      try {
        demo = await demoBody(event.account_id, event.demo_id)
      } catch (error) {
        log.warn?.(
          `[wo-webhook] ${event.type} of ${event.demo_id} not made: ${error?.code ?? error?.message}`
        )
        continue
      }
      if (!demo) continue
      const id = randomUUID()
      const createdAt = new Date(now())
      const body = JSON.stringify({ id, type: event.type, createdAt: createdAt.toISOString(), demo })
      const { rowCount } = await pool.query(
        `insert into wo_demo_webhook_event (id, account_id, demo_id, type, dedupe_key, body, created_at, next_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7) on conflict (dedupe_key) do nothing`,
        [id, event.account_id, event.demo_id, event.type, event.key, body, createdAt]
      )
      made += rowCount
    }
    return made
  }

  /** Claim the due events, send each once, settle each; answers what happened. */
  async function deliver() {
    const at = now()
    const { rows: events } = await pool.query(
      `update wo_demo_webhook_event e set next_at = $2
        where e.id in (select id from wo_demo_webhook_event
                        where delivered_at is null and gave_up_at is null and next_at <= $1
                        order by next_at, created_at limit $3 for update skip locked)
       returning e.*`,
      [new Date(at), new Date(at + WEBHOOK_LIMITS.leaseMs), WEBHOOK_LIMITS.batch]
    )
    if (!events.length) return { delivered: 0, retried: 0, gaveUp: 0 }
    const { rows: hooks } = await pool.query(
      'select * from wo_demo_webhook where account_id = any($1::uuid[]) and revoked_at is null',
      [[...new Set(events.map((e) => e.account_id))]]
    )
    const hookOf = new Map(hooks.map((h) => [h.account_id, h]))
    const outcomes = await Promise.all(events.map((event) => attempt(event, hookOf.get(event.account_id))))
    return {
      delivered: outcomes.filter((o) => o === 'delivered').length,
      retried: outcomes.filter((o) => o === 'retried').length,
      gaveUp: outcomes.filter((o) => o === 'gave-up').length
    }
  }

  async function attempt(event, hook) {
    if (!hook) return settle(event, { error: 'WEBHOOK_REMOVED', final: true })
    const secret = await openSecret(hook.secret_box, sessionSecret)
    if (!secret) return settle(event, { error: 'SECRET_UNREADABLE', final: true })
    let status = null
    let error = null
    try {
      const res = await fetchImpl(hook.url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Tracy-Webhooks/1',
          'x-tracy-event-id': event.id,
          'x-tracy-event-type': event.type,
          'x-tracy-signature': signatureHeader(secret, event.body, Math.floor(now() / 1000))
        },
        body: event.body,
        signal: AbortSignal.timeout(WEBHOOK_LIMITS.timeoutMs)
      })
      status = res.status
      await res.body?.cancel?.().catch(() => {})
      if (status >= 200 && status < 300) return settle(event, { status, delivered: true })
      error = `HTTP_${status}`
    } catch (failure) {
      error =
        failure?.name === 'TimeoutError' || failure?.name === 'AbortError'
          ? 'TIMEOUT'
          : failure?.code === 'URL_BLOCKED'
            ? 'URL_BLOCKED'
            : 'NETWORK_ERROR'
    }
    return settle(event, { status, error })
  }

  async function settle(event, { status = null, error = null, delivered = false, final = false }) {
    const at = now()
    if (delivered) {
      await pool.query(
        `update wo_demo_webhook_event set delivered_at = $2, attempts = attempts + 1, last_status = $3,
           last_error = null where id = $1`,
        [event.id, new Date(at), status]
      )
      return 'delivered'
    }
    const attempts = event.attempts + 1
    const giveUp = final || attempts >= WEBHOOK_LIMITS.maxAttempts
    await pool.query(
      `update wo_demo_webhook_event set attempts = $2, last_status = $3, last_error = $4,
         gave_up_at = $5, next_at = $6 where id = $1`,
      [
        event.id,
        final ? event.attempts : attempts,
        status,
        error,
        giveUp ? new Date(at) : null,
        new Date(at + (giveUp ? 0 : retryDelayMs(attempts)))
      ]
    )
    return giveUp ? 'gave-up' : 'retried'
  }

  async function prune() {
    const at = now()
    if (at - prunedAt < PRUNE_EVERY_MS) return
    prunedAt = at
    await pool.query(
      `delete from wo_demo_webhook_event
        where (delivered_at is not null or gave_up_at is not null) and created_at < $1`,
      [new Date(at - WEBHOOK_LIMITS.keepDays * DAY_MS)]
    )
  }

  /** One sweep at a time in this process; replicas are kept apart by the claim's row locks. */
  async function tick() {
    if (running) return running
    running = (async () => {
      await prune()
      const made = await enqueue()
      return { made, ...(await deliver()) }
    })().finally(() => {
      running = null
    })
    return running
  }

  return { enqueue, deliver, tick }
}
