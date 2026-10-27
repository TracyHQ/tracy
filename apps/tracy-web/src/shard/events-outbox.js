// apps/tracy-web/src/shard/events-outbox.js
/**
 * The events a shard owes the master (shard beta, docs/sre/hop-dong-cua-shard.md §5): written to
 * `shard_event_outbox` in the same database (and transaction, when the caller passes `db`) as the
 * change they report, and sent later by `pump`. Envelope `{eventId (32 hex), kind, at, data}`. The
 * id is derived from the kind and a key naming THIS occurrence (a site's key and creation time, a
 * rename's two names and moment…), so writing an event twice is one row and the master dedupes on
 * it. Four kinds, closed: a customer's own domain never travels here — it goes through the master's
 * `custom-hostname` door (`master-link.js`) — and nothing in tracy-web changes an email or deletes
 * an account (spec §13 S29). `sites/` writes events through `shard.emit` (`node.js`), never by
 * importing this file.
 *
 * Sending, one event per call, oldest first (`outcomeOf`):
 *   2xx                                         sent — a duplicate the master already had is a 2xx
 *   400, 409, 403 with a `why` other than clock dead: the master will never take it as it is — alert
 *   network, 5xx, 408, 429, 403 why=clock       tried again after 15 s, 30 s, 60 s … at most an hour
 *   anything else (404, 401, 3xx…)              tried again too: a master that does not have the
 *                                               door yet must not lose the event
 * The first failure of an event and every dead one raise an alert. Rows are claimed with
 * `for update skip locked`, so two replicas never send one event twice at once.
 */
import { createHash } from 'node:crypto'
import { sweepUnreportedAccounts } from './node-store.js'

export const SHARD_EVENT_KINDS = Object.freeze([
  'site.created',
  'site.deleted',
  'site.renamed',
  'account.created'
])

const BACKOFF_BASE_MS = 15_000
const BACKOFF_MAX_MS = 3_600_000
const CLAIM_MS = 120_000

export function eventIdOf(kind, key) {
  return createHash('sha256').update(`${kind}\n${key}`).digest('hex').slice(0, 32)
}

export async function enqueueShardEvent(db, { kind, data, key, now = Date.now() }) {
  if (!SHARD_EVENT_KINDS.includes(kind)) throw new Error(`unknown shard event kind: ${kind}`)
  if (typeof key !== 'string' || key === '') throw new Error('a shard event needs a key')
  const eventId = eventIdOf(kind, key)
  await db.query(
    `insert into shard_event_outbox (event_id, kind, data, created_at, next_at) values ($1, $2, $3::jsonb, $4, $4)
     on conflict (event_id) do nothing`,
    [eventId, kind, JSON.stringify(data), new Date(now)]
  )
  return eventId
}

/** What to do with the master's answer to one event (contract §5). */
export function outcomeOf(answer) {
  if (answer.ok) return 'sent'
  if (answer.status === 400 || answer.status === 409) return 'dead'
  if (answer.status === 403) return answer.body?.why === 'clock' ? 'retry' : 'dead'
  return 'retry'
}

export function shardEvents({ pool, link, now = Date.now, log = console, alert = null, batch = 20 }) {
  const raise =
    alert ??
    (({ what, eventId, kind, status, why }) =>
      log.error(`[shard-alert] event ${what}: ${kind} ${eventId} (${why ?? `HTTP_${status}`})`))
  const emit = (kind, data, key, db = pool) => enqueueShardEvent(db, { kind, data, key, now: now() })

  async function pump() {
    const at = new Date(now())
    const { rows } = await pool.query(
      `with due as (
         select event_id from shard_event_outbox
          where sent_at is null and dead_at is null and next_at <= $1
          order by created_at limit $2 for update skip locked)
       update shard_event_outbox o set next_at = $1::timestamptz + make_interval(secs => $3)
         from due where o.event_id = due.event_id
       returning o.*`,
      [at, batch, CLAIM_MS / 1000]
    )
    const out = { sent: 0, retried: 0, dead: 0 }
    for (const row of rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      const answer = await link.sendEvent({
        eventId: row.event_id,
        kind: row.kind,
        at: new Date(row.created_at).toISOString(),
        data: row.data
      })
      const outcome = outcomeOf(answer)
      const why =
        answer.status === 0
          ? 'UNREACHABLE'
          : `HTTP_${answer.status} ${answer.body?.code ?? ''} ${answer.body?.why ?? ''}`.trim()
      if (outcome === 'sent') {
        await pool.query(
          'update shard_event_outbox set sent_at = $2, last_error = null where event_id = $1',
          [row.event_id, at]
        )
        out.sent++
      } else if (outcome === 'dead') {
        await pool.query('update shard_event_outbox set dead_at = $2, last_error = $3 where event_id = $1', [
          row.event_id,
          at,
          why
        ])
        raise({ what: 'dead', eventId: row.event_id, kind: row.kind, status: answer.status, why })
        out.dead++
      } else {
        const wait = Math.min(BACKOFF_BASE_MS * 2 ** row.attempts, BACKOFF_MAX_MS)
        await pool.query(
          'update shard_event_outbox set attempts = attempts + 1, next_at = $2, last_error = $3 where event_id = $1',
          [row.event_id, new Date(at.getTime() + wait), why]
        )
        // Once per event: the first failure. The backoff and `last_error` carry the rest.
        if (row.attempts === 0)
          raise({ what: 'retry', eventId: row.event_id, kind: row.kind, status: answer.status, why })
        out.retried++
      }
    }
    return out
  }

  async function sweepMirrors() {
    const fresh = await sweepUnreportedAccounts(pool, { now: now() })
    for (const account of fresh)
      await emit('account.created', { email: account.email, source: 'invitation' }, account.accountId)
    return fresh.length
  }

  async function counts() {
    const { rows } = await pool.query(
      `select count(*) filter (where sent_at is null and dead_at is null)::int as pending,
              count(*) filter (where dead_at is not null)::int as dead
         from shard_event_outbox`
    )
    return { pending: rows[0].pending, dead: rows[0].dead }
  }

  return { emit, pump, sweepMirrors, counts }
}
