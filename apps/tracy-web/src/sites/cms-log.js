/**
 * Edits made in the CMS admin, outside Tracy (site changes plan §5–§6, P2): pull them from the host,
 * store them once, list them.
 *
 *   pullCmsLog(pool, site, {runJob})  — one pull: tracy-host's `cms-log-pull` job reads the CMS's own
 *                                       admin log after this site's cursor (`apps/tracy-host/src/
 *                                       cms-log.js` says what each CMS's log is and who is dropped);
 *                                       the answer is inserted into `site_cms_change` and the cursor
 *                                       moves. Called by the two doors below, by the five-minute
 *                                       timer (`sweepCmsLogs`, from `cron.js`), and — exported for
 *                                       it — by the turn opening of the Q2 line, so a turn starts
 *                                       with the admin's edits already on record.
 *   readCmsLog(pool, site, …)         — the stored rows as `outside-cms` items, newest first, plus
 *                                       `coverage.cmsLog`. The `activity` reader (P1) merges these.
 *   GET  /api/sites/:key/cms-log      — that list, for a seat on the site.
 *   POST /api/sites/:key/cms-log/pull — one pull now, for a seat on the site.
 *
 * 🔒 STORED ONCE, WHATEVER RUNS TWICE. The timer, the button and a turn can pull the same site at the
 * same moment, and a pull can be retried after its answer was lost. Rows are keyed by
 * `(site_key, source, cursor_key)` and inserted `on conflict do nothing`; the cursor is written
 * only if nobody moved it since this pull read it, so a slow pull never drags it backwards.
 *
 * 🔒 A FAILED PULL INVENTS NOTHING: no row, cursor unchanged, the reason kept in `last_error` for
 * `coverage` to show. `enabled` stays what the last answer said; null means "never answered".
 */
import { json, normalizeSiteKey } from '../lib/http.js'
import { notTracyOwnCmsDelete } from './activity-source.js'

/** Which log each platform's rows come from — the `source` column, and `coverage.cmsLog.source`. */
export const CMS_LOG_SOURCES = {
  joomla: 'joomla-action-log',
  emdash: 'emdash-audit-log',
  wordpress: 'wordpress-tracy-log'
}
/**
 * What a CMS's own log does NOT record, so the tab's foot never promises more than the log holds
 * (`coverage.cmsLog.limits`). Measured on EmDash 1.0.1 (dev round 02/10): `@emdash-cms/plugin-audit-log`
 * writes no row for a menu item edit, a settings save or a media upload — only page and post edits.
 * The WordPress hook and Joomla's action log record all three.
 * @type {Record<string, string[]>}
 */
const CMS_LOG_LIMITS = { 'emdash-audit-log': ['menus', 'settings', 'media'] }
const PLATFORM_OF = Object.fromEntries(Object.entries(CMS_LOG_SOURCES).map(([p, s]) => [s, p]))

/** How long the host may take for one pull before the caller gives up. */
const PULL_DEADLINE_MS = 60_000
/** The timer: sites somebody touched within ACTIVE, not pulled within EVERY. */
export const CMS_LOG_EVERY_MS = 5 * 60 * 1000
const CMS_LOG_ACTIVE_MS = 30 * 60 * 1000
/** Sites one timer tick pulls at most; the rest wait for the next tick. */
const SWEEP_MAX_SITES = 20
const LIST_DEFAULT = 30
const LIST_MAX = 100

const text = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null)

/**
 * One pull for one site.
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, label: string, host: string, platform: string|null}} site
 * @param {{runJob: (site: any, input: object, deadlineMs: number) => Promise<{ok: boolean, output?: string, reason?: string}>}} deps
 * @returns {Promise<{pulled: number, cursor?: string, enabled: boolean|null, reason?: string, error?: string}>}
 */
export async function pullCmsLog(pool, site, { runJob }) {
  const source = CMS_LOG_SOURCES[/** @type {keyof typeof CMS_LOG_SOURCES} */ (site.platform)]
  if (!source) return { pulled: 0, enabled: false, reason: 'unsupported' }
  const { rows } = await pool.query(
    'select cursor, enabled, state from site_cms_log_cursor where site_key = $1 and source = $2',
    [site.site_key, source]
  )
  const start = rows[0]?.cursor ?? ''
  // EmDash's publish-state snapshot (060): the host's own last answer, handed back untouched.
  const startState = rows[0]?.state ?? null
  const job = await runJob(
    site,
    {
      kind: 'cms-log-pull',
      platform: site.platform,
      cursor: start,
      ...(site.platform === 'emdash' ? { state: startState } : {})
    },
    PULL_DEADLINE_MS
  )
  const answer = job.ok ? lastJson(job.output) : null
  if (!answer || !Array.isArray(answer.entries) || typeof answer.cursor !== 'string') {
    const error = job.ok ? 'BAD_ANSWER' : String(job.reason ?? 'FAILED').slice(0, 200)
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, last_error, last_error_at) values ($1, $2, $3, now())
       on conflict (site_key, source) do update set last_error = excluded.last_error, last_error_at = now()`,
      [site.site_key, source, error]
    )
    return { pulled: 0, cursor: start, enabled: rows[0]?.enabled ?? null, error }
  }

  const entries = answer.entries.map(cleanEntry).filter(Boolean)
  const client = await pool.connect()
  let pulled = 0
  try {
    await client.query('begin')
    if (entries.length) {
      const inserted = await client.query(
        `insert into site_cms_change
           (site_key, source, cms_actor, resource_type, resource_id, resource_title, op, occurred_at, cursor_key,
            change_type, producer, files)
         select $1, $2, e.actor, e.resource_type, e.resource_id, e.resource_title, e.op, e.occurred_at, e.cursor_key,
                e.change_type, e.producer, e.files
           from jsonb_to_recordset($3::jsonb) as e(actor jsonb, resource_type text, resource_id text,
                resource_title text, op text, occurred_at timestamptz, cursor_key text, change_type text,
                producer jsonb, files text[])
         on conflict (site_key, source, cursor_key) do nothing
         returning id`,
        [site.site_key, source, JSON.stringify(entries)]
      )
      pulled = inserted.rowCount ?? 0
    }
    // Compare-and-set on the cursor — and the snapshot — this pull started from: a newer pull that
    // finished first wins. An answer with no snapshot (an older host) leaves the stored one alone.
    const nextState =
      answer.state && typeof answer.state === 'object' && !Array.isArray(answer.state)
        ? JSON.stringify(answer.state)
        : null
    await client.query(
      `insert into site_cms_log_cursor (site_key, source, cursor, enabled, reason, last_pulled_at, last_error, last_error_at, state)
       values ($1, $2, $3, $4, $5, now(), null, null, $7::jsonb)
       on conflict (site_key, source) do update set
         cursor = case when site_cms_log_cursor.cursor = $6 then excluded.cursor else site_cms_log_cursor.cursor end,
         state = case when $7::jsonb is not null and site_cms_log_cursor.state is not distinct from $8::jsonb
                      then excluded.state else site_cms_log_cursor.state end,
         enabled = excluded.enabled, reason = excluded.reason, last_pulled_at = now(),
         last_error = null, last_error_at = null`,
      [
        site.site_key,
        source,
        answer.cursor,
        answer.enabled === true,
        text(answer.reason, 60),
        start,
        nextState,
        startState === null ? null : JSON.stringify(startState)
      ]
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  const enabled = answer.enabled === true
  return {
    pulled,
    cursor: answer.cursor,
    enabled,
    ...(enabled || !answer.reason ? {} : { reason: text(answer.reason, 60) })
  }
}

/** The host's entry, re-checked: the database is ours even when the host is. */
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null
  const cursorKey = text(e.cursorKey, 200)
  const at = typeof e.occurredAt === 'string' ? Date.parse(e.occurredAt) : NaN
  if (!cursorKey || !Number.isFinite(at)) return null
  const actor =
    e.actor && typeof e.actor === 'object'
      ? { name: text(e.actor.name, 200), id: text(e.actor.id == null ? null : String(e.actor.id), 120) }
      : null
  return {
    cursor_key: cursorKey,
    occurred_at: new Date(at).toISOString(),
    actor,
    resource_type: text(e.resourceType, 80),
    resource_id: text(e.resourceId == null ? null : String(e.resourceId), 120),
    resource_title: text(e.resourceTitle, 200),
    op: text(e.op, 40) ?? 'change',
    // V2 evidence (048): the log's own event type, verbatim, and what produced the row when the
    // producer says so. A host that predates them sends neither: both stay null ("legacy").
    change_type: text(e.changeType, 120),
    producer: producerOf(e.producer),
    // E5.1c (062): the webroot files an upload wrote, so the seal of them folds into this row.
    files: filesOf(e.files)
  }
}

/** Up to 50 relative webroot paths, or null — a list with anything else in it is not kept. */
function filesOf(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 50) return null
  const ok = (f) =>
    typeof f === 'string' &&
    f.length > 0 &&
    f.length <= 512 &&
    !f.startsWith('/') &&
    !f.split('/').includes('..')
  return files.every(ok) ? files.map(String) : null
}

/** `{schema, version, hash, context?}` from the host, each a short plain string, or null. */
function producerOf(p) {
  if (!p || typeof p !== 'object') return null
  const field = (v, n, shape) => (typeof v === 'string' && shape.test(v) ? v.slice(0, n) : null)
  const out = {
    schema: field(p.schema, 16, /^[0-9A-Za-z._-]{1,16}$/),
    version: field(p.version, 32, /^[0-9A-Za-z._+-]{1,32}$/),
    hash: field(p.hash, 64, /^[0-9a-f]{8,64}$/),
    context: field(p.context, 16, /^[a-z-]{1,16}$/)
  }
  if (!out.schema || !out.version) return null
  if (!out.context) delete out.context
  if (!out.hash) delete out.hash
  return out
}

function lastJson(output) {
  const lines = String(output ?? '')
    .trim()
    .split('\n')
  try {
    const value = JSON.parse(lines[lines.length - 1] ?? '')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

/**
 * The site's stored CMS rows as `outside-cms` items, newest first, and `coverage.cmsLog`. Reading
 * stamps `last_read_at`, which makes the timer keep this site's rows fresh while someone looks.
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, platform: string|null}} site
 * @param {{cursor?: string|null, limit?: number}} [page]
 */
export async function readCmsLog(pool, site, { cursor = null, limit = LIST_DEFAULT } = {}) {
  const after = cursor ? decodeCursor(cursor) : null
  const { rows } = await pool.query(
    `select id, source, cms_actor, resource_type, resource_id, resource_title, op, occurred_at, cursor_key
       from site_cms_change c
      where site_key = $1 and ($2::timestamptz is null or (occurred_at, id) < ($2::timestamptz, $3::bigint))
        and ${notTracyOwnCmsDelete('c')}
      order by occurred_at desc, id desc
      limit $4`,
    [site.site_key, after?.at ?? null, after?.id ?? null, limit + 1]
  )
  const more = rows.length > limit
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const coverage = await cmsLogCoverage(pool, site)
  return {
    items: page.map(cmsChangeItem),
    nextCursor: more && last ? encodeCursor(last.occurred_at, last.id) : null,
    coverage
  }
}

/**
 * One `site_cms_change` row as the `outside-cms` item both this door and `activity.js` serve: the
 * CMS's own user (never a Tracy seat), the resource by name, the op, the CMS's time.
 */
export function cmsChangeItem(r) {
  return {
    kind: 'outside-cms',
    id: `${r.source}:${r.cursor_key}`,
    at: r.occurred_at.toISOString(),
    cms: PLATFORM_OF[r.source] ?? null,
    cmsActor: r.cms_actor ? { name: r.cms_actor.name ?? null, id: r.cms_actor.id ?? null } : null,
    resource: { type: r.resource_type, id: r.resource_id, title: r.resource_title },
    op: r.op
  }
}

/**
 * `coverage.cmsLog` of a site: which log its CMS keeps, whether it is on, and what the last pull
 * said — or null for a platform with no log adapter. Reading stamps `last_read_at`, which makes the
 * timer keep this site's rows fresh while someone looks (the Site changes tab reads this through
 * `activity.js`).
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, platform: string|null}} site
 */
export async function cmsLogCoverage(pool, site) {
  const source = CMS_LOG_SOURCES[/** @type {keyof typeof CMS_LOG_SOURCES} */ (site.platform)] ?? null
  if (!source) return { cmsLog: null }
  const stamped = await pool.query(
    `insert into site_cms_log_cursor (site_key, source, last_read_at) values ($1, $2, now())
     on conflict (site_key, source) do update set last_read_at = now()
     returning enabled, reason, last_pulled_at, last_error`,
    [site.site_key, source]
  )
  const state = stamped.rows[0]
  return {
    cmsLog: {
      source,
      limits: CMS_LOG_LIMITS[source] ?? [],
      enabled: state?.enabled ?? null,
      reason: state?.reason ?? null,
      lastPulledAt: state?.last_pulled_at ? state.last_pulled_at.toISOString() : null,
      lastError: state?.last_error ?? null
    }
  }
}

function encodeCursor(at, id) {
  return Buffer.from(JSON.stringify([at.toISOString(), String(id)])).toString('base64url')
}

/** `[iso, id]` from a list cursor, or null when it is not one this door wrote. */
function decodeCursor(cursor) {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || !/^[0-9]{1,18}$/.test(String(id)))
      return null
    return { at, id: String(id) }
  } catch {
    return null
  }
}

/**
 * Sites the timer should pull now: someone worked on the site within the last 30 minutes — an
 * Apply call (`site_presence`), a write of any kind (`site.last_write_at`, which EmDash's MCP writes
 * reach through `/changed` where `site_presence` does not), or a read of its CMS rows
 * (`last_read_at`) — and it has not been pulled within the last five.
 * @param {import('pg').Pool} pool
 */
export async function sitesDueForCmsLog(pool, { limit = SWEEP_MAX_SITES } = {}) {
  const { rows } = await pool.query(
    `select s.site_key, s.label, s.host, s.platform
       from site s
       left join site_cms_log_cursor c
         on c.site_key = s.site_key
        and c.source = case s.platform when 'joomla' then 'joomla-action-log'
                                       when 'emdash' then 'emdash-audit-log'
                                       when 'wordpress' then 'wordpress-tracy-log' end
      where s.platform in ('joomla', 'emdash', 'wordpress')
        and (c.last_pulled_at is null or c.last_pulled_at < now() - ($1::int * interval '1 millisecond'))
        and (exists (select 1 from site_presence p
                      where p.site_key = s.site_key and p.seen_at > now() - ($2::int * interval '1 millisecond'))
             or s.last_write_at > now() - ($2::int * interval '1 millisecond')
             or c.last_read_at > now() - ($2::int * interval '1 millisecond'))
      order by c.last_pulled_at asc nulls first, s.site_key
      limit $3`,
    [CMS_LOG_EVERY_MS - 30_000, CMS_LOG_ACTIVE_MS, limit]
  )
  return rows
}

/**
 * One timer tick: pull every due site in turn. One site's failure is recorded on that site and
 * never stops the others.
 */
export async function sweepCmsLogs(pool, { runJob, log = console }) {
  const due = await sitesDueForCmsLog(pool)
  let pulled = 0
  let failed = 0
  for (const site of due) {
    try {
      const result = await pullCmsLog(pool, site, { runJob })
      pulled += result.pulled
      if (result.error) failed++
    } catch (error) {
      failed++
      log.warn?.(
        `[cms-log] pull failed for ${site.site_key}: ${String(error?.message ?? error).slice(0, 200)}`
      )
    }
  }
  return { pulled, sites: due.length, failed }
}

/**
 * The two doors. Mounted from `route.js` with its `requireGrant` (a live seat on the site; a
 * Bearer key on the api host) and its `runSiteJob`.
 */
export function mountCmsLog(app, { pool, requireGrant, siteByKey, runJob }) {
  app.get('/api/sites/:key/cms-log', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const rawCursor = c.req.query('cursor')
    const cursor = rawCursor ? decodeCursor(rawCursor) : null
    if (rawCursor && !cursor) return json(c, { code: 'INVALID_CURSOR' }, 400)
    const rawLimit = c.req.query('limit')
    const limit = rawLimit === undefined ? LIST_DEFAULT : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX)
      return json(c, { code: 'INVALID_LIMIT' }, 400)
    return json(c, await readCmsLog(pool, site, { cursor: rawCursor ?? null, limit }))
  })

  app.post('/api/sites/:key/cms-log/pull', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const result = await pullCmsLog(pool, site, { runJob })
    if (result.error) return json(c, { code: 'CMS_LOG_PULL_FAILED', reason: result.error }, 502)
    return json(c, result)
  })
}
