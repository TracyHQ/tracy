/**
 * The notification log (`055-notification.sql`, spec #809): write a row for a person, read their
 * Inbox, mark rows read, and drop rows older than the retention window.
 *
 * Every query here is scoped by `account_id`: a person reads and marks only their own rows. Rows hold
 * facts (`kind` + `data`), never sentences; the Inbox writes the words in the reader's language.
 */
import { personFace } from '../lib/person-face.js'

/** How long a notification is kept (spec #809: 90 days). */
export const RETENTION_DAYS = 90

/** The most rows one Inbox page returns. */
export const PAGE_LIMIT = 50

/** The account behind a session email, with the language it last chose; null if none. */
export async function accountForEmail(pool, email) {
  const { rows } = await pool.query('select id, language from account where email = $1', [
    email.toLowerCase()
  ])
  return rows[0] ?? null
}

/**
 * Remember the language a person chose for their interface, so mail and notifications triggered by
 * someone else still reach them in it (spec #809, user story 15). Only a known language is stored.
 * @returns {Promise<boolean>} whether the stored value changed.
 */
export async function rememberLanguage(pool, accountId, language) {
  const { rowCount } = await pool.query(
    'update account set language = $2 where id = $1 and language is distinct from $2',
    [accountId, language]
  )
  return rowCount > 0
}

/**
 * Write one notification. `recipient` is an account id; a row for the actor themselves is never
 * written (rule R2), so callers may pass every candidate and let this drop the actor.
 * @param {import('pg').Pool} pool
 * @param {{recipient: string, kind: string, siteKey?: string|null, actor?: string|null,
 *   data?: Record<string, unknown>, ref?: string|null, inInbox?: boolean,
 *   mailState?: 'none'|'pending'|'held', mailDueAt?: Date|null}} row
 * @returns {Promise<{id: string, createdAt: string} | null>} null when the row was the actor's own.
 */
export async function addNotification(pool, row) {
  if (!row.recipient || !row.kind) throw new TypeError('notification needs a recipient and a kind')
  if (row.actor && row.actor === row.recipient) return null
  const { rows } = await pool.query(
    `insert into notification (account_id, kind, site_key, actor_account_id, data, ref, in_inbox, mail_state, mail_due_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8,
             coalesce($9::timestamptz, case when $8 = 'pending' then now() end))
     returning id, created_at`,
    [
      row.recipient,
      row.kind,
      row.siteKey ?? null,
      row.actor ?? null,
      JSON.stringify(row.data ?? {}),
      row.ref ?? null,
      row.inInbox ?? true,
      row.mailState ?? 'none',
      // A pending row is due on the database clock, the one `deliverDue` compares it with.
      row.mailDueAt ?? null
    ]
  )
  return { id: rows[0].id, createdAt: rows[0].created_at.toISOString() }
}

/**
 * Mark every open row with this `ref` as settled (another admin answered the same request).
 * `outcome` ('accepted' | 'declined') is written into `data.outcome`, so an answered invitation
 * reads "… · Accepted" in Team updates (04/10/2026); a cancel passes none.
 */
/** How a settled row ended: an invitation accepted or declined, a join request or a request for edit access approved or declined. */
const OUTCOMES = new Set(['accepted', 'declined', 'approved'])

export async function settleByRef(pool, ref, { except = null, outcome = null } = {}) {
  const { rowCount } = await pool.query(
    `update notification set settled_at = now(),
       data = case when $3::text is null then data else data || jsonb_build_object('outcome', $3::text) end
     where ref = $1 and settled_at is null and ($2::uuid is null or account_id <> $2::uuid)`,
    [ref, except, OUTCOMES.has(outcome) ? outcome : null]
  )
  return rowCount
}

/** The kinds that wait on their reader's answer until settled (`WAITING`, `settleBySite`). */
const ANSWERABLE = `('team.invited', 'team.join_request', 'team.edit_access_request')`

/**
 * Close every open request about a site that no longer exists (live on dev 09/10/2026: an
 * invitation to a deleted site still offered Accept, and the gone site could only refuse it).
 * No outcome is written: nobody answered it.
 */
export async function settleBySite(pool, siteKey) {
  const { rowCount } = await pool.query(
    `update notification set settled_at = now()
     where site_key = $1 and settled_at is null and kind in ${ANSWERABLE}`,
    [siteKey]
  )
  return rowCount
}

/**
 * A row still waiting on the reader: an open invitation or join request (live on cowork.tracy.site
 * 04/10: pressing Review marked the request read, and the Unread filter then hid the one thing still
 * waiting on the owner). It lists under Unread and counts in the badge until it is settled, whatever
 * its read state.
 */
const WAITING = (n) => `(${n}.settled_at is null and ${n}.kind in ${ANSWERABLE})`

/**
 * Every read of the log names the actor and the site the way they are NOW (04/10/2026): the
 * site by its current address (`site.primary_name`, set by Settings › Site URL), else the name a
 * deleted site had when its row was written (`data.siteName`), else its key. The key itself never
 * changes, so links and lookups keep using `site_key`. The actor comes with what their face needs
 * (`avatar_url`, `actorOf`).
 * @param {string} source the relation the rows come from: the table, or a CTE over it
 */
const withActor = (source) => `select n.*, a.email as actor_email, a.display_name as actor_name,
       a.avatar_url as actor_avatar_url,
       coalesce(s.primary_name, n.data->>'siteName', n.site_key) as site_name
       from ${source} n
       left join account a on a.id = n.actor_account_id
       left join site s on s.site_key = n.site_key`

export const WITH_ACTOR = withActor('notification')

/**
 * The person behind a row read through `WITH_ACTOR`, or null (a system event, or an account since
 * deleted). The one place a notification's `actor` is built: the Inbox's JSON and the letters both
 * read it. `face` is `personFace` — the same letter, colour and picture `/api/team` gives the same
 * account, so the Inbox row and the Team tab show one person the same way.
 */
export function actorOf(r) {
  if (!r.actor_account_id) return null
  return {
    id: r.actor_account_id,
    email: r.actor_email ?? null,
    name: r.actor_name ?? null,
    face: personFace({
      id: r.actor_account_id,
      email: r.actor_email ?? null,
      display_name: r.actor_name ?? null,
      avatar_url: r.actor_avatar_url ?? null
    })
  }
}

function shape(r) {
  return {
    id: r.id,
    kind: r.kind,
    siteKey: r.site_key,
    siteName: r.site_name ?? r.site_key ?? null,
    actor: actorOf(r),
    data: r.data ?? {},
    settledAt: r.settled_at ? r.settled_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    readAt: r.read_at ? r.read_at.toISOString() : null
  }
}

/**
 * One page of a person's Inbox, newest first.
 * @param {{filter?: 'unread'|'all', before?: string|null, limit?: number}} [options]
 *   `before` is the `createdAt` of the last row already shown (the next page starts after it).
 * @returns {Promise<{notifications: object[], next: string|null}>}
 */
export async function listNotifications(
  pool,
  accountId,
  { filter = 'all', before = null, limit = PAGE_LIMIT } = {}
) {
  const take = Math.min(Math.max(1, limit), PAGE_LIMIT)
  const { rows } = await pool.query(
    `${WITH_ACTOR}
      where n.account_id = $1
        and n.in_inbox
        and ($2::boolean is false or n.read_at is null or ${WAITING('n')})
        and ($3::timestamptz is null or n.created_at < $3::timestamptz)
        and n.created_at > now() - make_interval(days => $5)
      order by n.created_at desc, n.id desc
      limit $4`,
    [accountId, filter === 'unread', before, take + 1, RETENTION_DAYS]
  )
  const page = rows.slice(0, take).map(shape)
  return { notifications: page, next: rows.length > take ? page[page.length - 1].createdAt : null }
}

/** How many of a person's rows are unread, or still waiting (the count beside Inbox in the left column). */
export async function unreadCount(pool, accountId) {
  const { rows } = await pool.query(
    `select count(*)::int as n from notification
      where account_id = $1 and in_inbox and (read_at is null or ${WAITING('notification')})
        and created_at > now() - make_interval(days => $2)`,
    [accountId, RETENTION_DAYS]
  )
  return rows[0].n
}

/**
 * Mark one of the person's rows read. Returns the row as the Inbox lists it (actor and site named
 * through `WITH_ACTOR`), or null when it is not theirs.
 */
export async function markRead(pool, accountId, id) {
  const { rows } = await pool.query(
    `with marked as (
       update notification set read_at = coalesce(read_at, now())
        where id = $1 and account_id = $2
        returning *)
     ${withActor('marked')}`,
    [id, accountId]
  )
  return rows[0] ? shape(rows[0]) : null
}

/** "Mark all as read": every unread row of the person. Returns how many changed. */
export async function markAllRead(pool, accountId) {
  const { rowCount } = await pool.query(
    'update notification set read_at = now() where account_id = $1 and in_inbox and read_at is null',
    [accountId]
  )
  return rowCount
}

/** Drop every row older than the retention window (the cron's sweep). */
export async function pruneNotifications(pool, days = RETENTION_DAYS) {
  const { rowCount } = await pool.query(
    'delete from notification where created_at < now() - make_interval(days => $1)',
    [days]
  )
  return rowCount
}

/** Email address and chosen language of each account (the recipients of one event). */
export async function recipientsById(pool, ids) {
  const wanted = [...new Set(ids.filter(Boolean))]
  if (wanted.length === 0) return new Map()
  const { rows } = await pool.query(
    'select id, email, display_name, language from account where id = any($1::uuid[])',
    [wanted]
  )
  return new Map(rows.map((r) => [r.id, r]))
}

/** Rows whose email is owed now: `pending` past due, or `held` past its grouping window. */
export async function dueMail(pool, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `${WITH_ACTOR}
      where n.mail_state in ('pending', 'held') and n.mail_due_at <= now()
      order by n.mail_due_at
      limit $1`,
    [limit]
  )
  return rows
}

/** One recipient's held rows under the same `ref` (C2: several replies, one email per thread). */
export async function heldWith(pool, accountId, ref) {
  const { rows } = await pool.query(
    `${WITH_ACTOR}
      where n.account_id = $1 and n.ref = $2 and n.mail_state = 'held'
      order by n.created_at`,
    [accountId, ref]
  )
  return rows
}

/** Record a mail outcome for rows (one letter can cover several held rows). */
export async function recordMail(pool, ids, { sent, error = null, maxAttempts = 5 }) {
  if (ids.length === 0) return
  if (sent) {
    await pool.query(
      `update notification set mail_state = 'sent', mailed_at = now(), mail_error = null where id = any($1::uuid[])`,
      [ids]
    )
    return
  }
  // Back off 5, 10, 20, 40 minutes; give up after `maxAttempts`.
  await pool.query(
    `update notification
        set mail_attempts = mail_attempts + 1,
            mail_error = $2,
            mail_state = case when mail_attempts + 1 >= $3 then 'failed' else 'pending' end,
            mail_due_at = now() + make_interval(mins => (5 * power(2, mail_attempts))::int)
      where id = any($1::uuid[])`,
    [ids, String(error ?? 'unknown').slice(0, 500), maxAttempts]
  )
}
