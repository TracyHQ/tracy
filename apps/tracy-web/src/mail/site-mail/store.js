/**
 * `site_mail` and `site_mail_log` (`028-site-mail.sql`) — reads and writes, nothing else.
 *
 * The site book itself belongs to `sites/`; this file reads the four columns of `site` it needs
 * by plain SQL rather than importing that domain (`test/module-graph.test.mjs`).
 */

/** Rows the limits count: a message on its way counts like one that went. */
const COUNTED = `status in ('sending', 'sent', 'logged')`
/** Midnight UTC today, as a timestamptz. */
const TODAY = `(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`
/** Advisory lock taken around "count, then reserve" so two sends cannot both read 9 of 10. */
const LOCK_ID = 7_243_028

const SITE_COLUMNS = 'site_key, label, host, publish'

export async function siteForMail(pool, { label = null, siteKey = null }) {
  const { rows } = label
    ? await pool.query(`select ${SITE_COLUMNS} from site where label = $1`, [label])
    : await pool.query(`select ${SITE_COLUMNS} from site where site_key = $1`, [siteKey])
  return rows[0] ?? null
}

export async function mailRow(pool, siteKey) {
  const { rows } = await pool.query('select * from site_mail where site_key = $1', [siteKey])
  return rows[0] ?? null
}

const WRITABLE = [
  'mode',
  'hourly_limit',
  'daily_limit',
  'domain',
  'resend_domain_id',
  'domain_status',
  'domain_records',
  'domain_owned',
  'domain_requested_at',
  'domain_released_at',
  'smtp'
]
const JSONB = new Set(['domain_records', 'smtp'])

/**
 * Write the given columns of one site's row, creating it when absent. A column not named in
 * `patch` keeps its value; `null` clears it.
 */
export async function saveMailRow(pool, siteKey, patch, updatedBy) {
  const cols = WRITABLE.filter((c) => Object.hasOwn(patch, c))
  const values = cols.map((c) => (JSONB.has(c) && patch[c] !== null ? JSON.stringify(patch[c]) : patch[c]))
  const names = ['site_key', ...cols, 'updated_by']
  const params = names.map((c, i) => (JSONB.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`))
  const updates = [...cols, 'updated_by'].map((c) => `${c} = excluded.${c}`)
  const { rows } = await pool.query(
    `insert into site_mail (${names.join(', ')}) values (${params.join(', ')})
       on conflict (site_key) do update set ${updates.join(', ')}, updated_at = now()
     returning *`,
    [siteKey, ...values, updatedBy]
  )
  return rows[0]
}

/** What the limits read: this site in the last hour and today, every Tracy-paid send today. */
export async function countsFor(db, siteKey) {
  const { rows } = await db.query(
    `select
       (select count(*) from site_mail_log
         where site_key = $1 and ${COUNTED} and at > now() - interval '1 hour')::int as hour,
       (select count(*) from site_mail_log
         where site_key = $1 and ${COUNTED} and at >= ${TODAY})::int as day,
       (select count(*) from site_mail_log
         where ${COUNTED} and at >= ${TODAY} and mode in ('tracy', 'tracy-domain'))::int as global_day`,
    [siteKey]
  )
  return { hour: rows[0].hour, day: rows[0].day, globalDay: rows[0].global_day }
}

/** Every Tracy-paid message counted today, across all sites. */
export async function usedToday(pool) {
  const { rows } = await pool.query(
    `select count(*)::int as n from site_mail_log
      where ${COUNTED} and at >= ${TODAY} and mode in ('tracy', 'tracy-domain')`
  )
  return rows[0].n
}

/** The site's own `From` on the last message it handed the relay, or null before its first. */
export async function lastOriginalFrom(pool, siteKey) {
  const { rows } = await pool.query(
    `select original_from from site_mail_log
      where site_key = $1 and original_from is not null
      order by at desc, id desc limit 1`,
    [siteKey]
  )
  return rows[0]?.original_from ?? null
}

export async function sentToday(pool, siteKey) {
  const { rows } = await pool.query(
    `select count(*)::int as n from site_mail_log where site_key = $1 and ${COUNTED} and at >= ${TODAY}`,
    [siteKey]
  )
  return rows[0].n
}

/**
 * Count and reserve in one locked transaction: either a `sending` row is written (and its id
 * returned), or the limit it would cross is, as a `refused` row.
 *
 * @param {(counts: {hour: number, day: number, globalDay: number}) => string | null} crossed -
 *   `policy.limitCrossed`, bound to this site's mode and limits.
 * @returns {Promise<{id: string} | {refused: string}>}
 */
export async function reserveSend(pool, entry, crossed) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock($1)', [LOCK_ID])
    const scope = crossed(await countsFor(client, entry.siteKey))
    const { rows } = await client.query(
      `insert into site_mail_log
         (site_key, mode, status, code, recipients, to_addresses, subject, original_from, bytes,
          upstream_error)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        entry.siteKey,
        entry.mode,
        scope ? 'refused' : 'sending',
        scope ? 'SITE_MAIL_LIMIT' : null,
        entry.to.length,
        entry.to,
        entry.subject ?? null,
        entry.originalFrom ?? null,
        entry.bytes,
        scope ? `limit ${scope}` : null
      ]
    )
    await client.query('commit')
    return scope ? { refused: scope } : { id: String(rows[0].id) }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function finishSend(pool, id, { status, messageId = null, error = null, code = null }) {
  await pool.query(
    'update site_mail_log set status = $2, message_id = $3, upstream_error = $4, code = $5 where id = $1',
    [id, status, messageId, error === null ? null : String(error).slice(0, 500), code]
  )
}

/** A message refused before any reservation (draft, off, malformed): logged, never counted. */
export async function logRefusal(pool, { siteKey, mode, code, bytes = 0, error = null }) {
  await pool.query(
    `insert into site_mail_log (site_key, mode, status, code, bytes, upstream_error)
     values ($1, $2, 'refused', $3, $4, $5)`,
    [siteKey, mode, code, bytes, error === null ? null : String(error).slice(0, 500)]
  )
}

/** A reservation older than this whose send never reported back was cut off (a restart). */
const INTERRUPTED_AFTER = `interval '2 minutes'`

/**
 * The newest log lines. `status` is always one of `sent`, `logged`, `refused`, `failed`: a send
 * still in flight is left out, and one whose reservation outlived `INTERRUPTED_AFTER` reads as
 * `failed` — it counted against the limits and nobody knows whether it went.
 */
export async function recentLog(pool, { siteKey = null, limit = 100 }) {
  const { rows } = await pool.query(
    `select id, site_key, at, mode, status, code, recipients, to_addresses, subject, message_id,
            upstream_error, bytes, (status = 'sending' and at < now() - ${INTERRUPTED_AFTER}) as interrupted
       from site_mail_log
      where ($1::text is null or site_key = $1)
        and (status <> 'sending' or at < now() - ${INTERRUPTED_AFTER})
      order by at desc, id desc
      limit $2`,
    [siteKey, limit]
  )
  return rows.map((r) => ({
    id: String(r.id),
    at: r.at.toISOString(),
    siteKey: r.site_key,
    status: r.interrupted ? 'failed' : r.status,
    code: r.interrupted ? 'SITE_MAIL_UPSTREAM' : r.code,
    to: r.to_addresses ?? [],
    recipients: r.recipients,
    subject: r.subject,
    error: r.interrupted ? 'interrupted before the upstream answered' : r.upstream_error,
    mode: r.mode,
    messageId: r.message_id,
    bytes: r.bytes
  }))
}

/**
 * Every site the ops screen lists: published ones (they can send), plus any with a policy row or a
 * log line today — a draft someone configured, or one still trying. With `siteKey`, that one site
 * whatever its state.
 */
export async function sitesForOps(pool, siteKey = null) {
  const { rows } = await pool.query(
    `select s.site_key, s.label, s.publish, m.mode, m.hourly_limit, m.daily_limit, m.domain,
            m.domain_status, m.resend_domain_id, m.domain_owned, m.domain_requested_at,
            m.domain_released_at,
            (select count(*) from site_mail_log l
              where l.site_key = s.site_key and l.${COUNTED} and l.at >= ${TODAY})::int as sent_today,
            (select concat_ws(': ', l.code, l.upstream_error) from site_mail_log l
              where l.site_key = s.site_key and l.status in ('failed', 'refused')
                and l.at > now() - interval '1 day'
              order by l.at desc, l.id desc limit 1) as last_error
       from site s
       left join site_mail m on m.site_key = s.site_key
      where ($1::text is not null and s.site_key = $1)
         or ($1::text is null and (s.publish = 'published' or m.site_key is not null
             or exists (select 1 from site_mail_log l where l.site_key = s.site_key and l.at >= ${TODAY})))
      order by s.label`,
    [siteKey]
  )
  return rows
}

/**
 * The site whose row holds `domain` (a live claim, not a released one), other than `siteKey` — the
 * answer to "may this site ask for that domain" (`029-site-mail-domain-lifecycle.sql`'s index says
 * the same thing, and catches the race this read cannot).
 */
export async function domainHolder(pool, domain, siteKey) {
  const { rows } = await pool.query(
    `select site_key from site_mail
      where domain = $1 and site_key <> $2 and domain_status is distinct from 'expired'
      limit 1`,
    [domain, siteKey]
  )
  return rows[0]?.site_key ?? null
}

/** Whether a row other than `siteKey`'s points at this Resend domain id. */
export async function resendIdShared(pool, resendDomainId, siteKey) {
  const { rows } = await pool.query(
    'select 1 from site_mail where resend_domain_id = $1 and site_key <> $2 limit 1',
    [resendDomainId, siteKey]
  )
  return rows.length > 0
}

/**
 * Tracy-created domains still not verified `days` after they were asked for: what the release clock
 * looks at. A verified one is never on this list, however old.
 */
export async function abandonedDomains(pool, days) {
  const { rows } = await pool.query(
    `select * from site_mail
      where domain_owned and resend_domain_id is not null
        and domain_status is distinct from 'verified'
        and domain_requested_at < now() - make_interval(days => $1)
      order by domain_requested_at`,
    [days]
  )
  return rows
}

/** One line in `audit`, the table every other door writes to (`sites/store.js`'s `audit`). */
export async function audit(pool, { actor, action, siteKey, detail }) {
  await pool.query('insert into audit (actor, action, site_key, detail) values ($1, $2, $3, $4::jsonb)', [
    actor,
    action,
    siteKey,
    JSON.stringify(detail)
  ])
}
