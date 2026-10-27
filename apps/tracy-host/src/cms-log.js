/**
 * `cms-log-pull` — the job behind "edited in the CMS admin, outside Tracy" (site changes plan §6,
 * P2): read the CMS's OWN admin log after a cursor, keep what a person did there, and answer
 * `{entries, cursor, enabled, reason?, reset}` for tracy-web to store (`site_cms_change`).
 *
 * A PULL, NOT A PUSH (P0 `cms-hooks.md`): two of the three CMSs already keep such a log on the site
 * — Joomla's User Actions Log (`#__action_logs`) and EmDash's audit-log plugin (`_plugin_storage`)
 * — so this host reads it through `docker exec`, the road every webroot job already takes. No
 * token reaches the site, no URL of Tracy's is configured there, no queue lives on it.
 *
 * The work is split in two on purpose:
 *   - the ADAPTER runs inside the site's container (`scripts/webroot/cms-log-<platform>.*`, started
 *     by `cms-log.sh`) and only READS: rows after the cursor, the log's on/off state, the clock.
 *     It projects every row down to ids, names and a title before anything leaves the container —
 *     an EmDash entry holds the whole record before and after the save, and those values stay put.
 *   - the MAPPING runs here: which rows are people, what the op is called, where the cursor stops.
 *     It is plain JavaScript, so `test/cms-log.test.mjs` exercises it on real adapter output.
 *
 * Who counts as "outside Tracy" — decided per CMS from what was measured, never from a header:
 *   - Joomla: Tracy's Apply door writes with raw SQL and fires no Joomla event, so its writes never
 *     reach the log (14 Apply writes on stand site e3sj0330, 0 log rows). Rows of user 0 (installs,
 *     CLI, automated updates) are the system, not a person, and are dropped.
 *   - EmDash: the agent writes through MCP as the user `tracy-agent@tracy.ai`; rows of that user id
 *     are dropped. Deletes and media uploads carry no user at all and are KEPT with a null actor
 *     ("someone"), because guessing by time is what the plan forbids.
 *     Publish and unpublish are in no log at all: they are read off each entry's state between two
 *     pulls (`emdashPublishState`), also with a null actor.
 *   - WordPress: no core log; the hook in `tracy-access.php` (P2.1) writes `<prefix>tracy_admin_log`
 *     (contract below) and itself skips Tracy's Apply requests and WP-CLI, so every row is kept.
 *     The hook creates its table on the first action it logs: no table AND no hook file is
 *     `enabled: false, hook-not-installed`; no table but the hook in place is an empty log
 *     (`enabled: true`, no entries) — nobody has edited in the admin yet (F-L4-5).
 *
 * 🔒 THE CURSOR NEVER STEPS OVER A ROW STILL BEING WRITTEN. A row stamped within `SETTLE_MS` of the
 * adapter's clock stops the read there: an insert that took its id/timestamp before ours but commits
 * after our SELECT would otherwise sit behind the cursor forever. The next pull picks it up.
 * And every row the read passes moves the cursor — skipped rows included — so a log made only of
 * logins does not get re-read on every pull.
 */
import path from 'node:path'

/** The `kind` of `POST /_host/site` this module answers. */
export const CMS_LOG_KIND = 'cms-log-pull'
export const CMS_LOG_PLATFORMS = ['joomla', 'emdash', 'wordpress']
/** Rows one pull may hand back; the adapters read at most this many. */
export const CMS_LOG_LIMIT = 500
const SETTLE_MS = 5000

const CURSOR_SHAPE = {
  joomla: /^[0-9]{1,18}$/,
  wordpress: /^[0-9]{1,18}$/,
  emdash: /^[0-9]{13}-[0-9A-Za-z_-]{1,80}$/
}

/**
 * `null` when `body` is a valid `cms-log-pull` instruction, else the refusal reason — the same
 * contract as `validateWebrootBody`, so `/_host/site` answers both the same way.
 * @param {Record<string, unknown>} body
 */
export function validateCmsLogBody(body) {
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'platform', 'cursor', 'state'].includes(key)) return `refused ${key}`
  }
  const platform = /** @type {string} */ (body.platform)
  if (!CMS_LOG_PLATFORMS.includes(platform)) return 'refused platform'
  const cursor = body.cursor
  if (
    cursor != null &&
    cursor !== '' &&
    (typeof cursor !== 'string' || !CURSOR_SHAPE[platform].test(cursor))
  ) {
    return 'refused cursor'
  }
  // EmDash's publish-state snapshot, as this module last answered it. Its shape is checked where it
  // is read (`emdashState`); a wrong one is taken again, never trusted.
  if (body.state != null && (typeof body.state !== 'object' || Array.isArray(body.state)))
    return 'refused state'
  return null
}

/**
 * Run one pull: the adapter inside the site's container, then the mapping. The job's `output` is
 * the mapped answer as one JSON line — never the adapter's raw rows.
 * @param {{jobId: string, body: any, config: {scriptsDir: string, privateRoot?: string, sitesRoot?: string}, jobs: any, run: Function}} input
 */
export async function runCmsLogJob({ jobId, body, config, jobs, run }) {
  const { label, platform } = body
  const cursor = typeof body.cursor === 'string' ? body.cursor : ''
  const state = platform === 'emdash' ? emdashState(body.state) : null
  const args = [path.join(config.scriptsDir, 'webroot', 'cms-log.sh'), '--label', String(label)]
  args.push('--platform', platform, '--cursor', cursor)
  if (state) args.push('--since', state.w)
  await jobs.put(jobId, { state: 'running', step: 'cms-log-pull', label })
  try {
    const { code, tail } = await run({
      script: 'bash',
      args,
      env: {
        ...process.env,
        TRACY_PRIVATE_ROOT: config.privateRoot ?? process.env.TRACY_PRIVATE_ROOT,
        TRACY_SITES_ROOT: config.sitesRoot ?? process.env.TRACY_SITES_ROOT
      }
    })
    const answer = lastJson(tail)
    if (code !== 0 || answer?.ok !== true || answer.platform !== platform) {
      // The adapter's own last lines say why; they hold no row (a failed adapter printed none).
      await jobs.put(jobId, {
        state: 'failed',
        step: 'cms-log-pull',
        exitCode: code,
        output: code !== 0 ? tail.slice(-5).join('\n').slice(0, 500) : 'adapter answered no result'
      })
      return
    }
    const mapped = mapCmsLog(platform, answer, cursor, state)
    await jobs.put(jobId, {
      state: 'done',
      step: 'cms-log-pull',
      exitCode: 0,
      output: JSON.stringify(mapped)
    })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: 'cms-log-pull',
      detail: String(error?.message ?? error).slice(0, 200)
    })
  }
}

/** The last line of `tail` that parses as a JSON object, or null. */
function lastJson(tail) {
  for (let i = tail.length - 1; i >= 0; i--) {
    try {
      const value = JSON.parse(tail[i])
      if (value && typeof value === 'object') return value
    } catch {
      /* keep looking */
    }
  }
  return null
}

/**
 * Turn one adapter answer into `{entries, cursor, enabled, reason?, reset}`.
 * @param {'joomla'|'emdash'|'wordpress'} platform
 * @param {any} answer the adapter's JSON line
 * @param {string} cursor the cursor the pull started from
 * @param {unknown} [state] EmDash only: the publish-state snapshot the last pull answered
 */
export function mapCmsLog(platform, answer, cursor, state = null) {
  if (platform === 'joomla') return mapJoomla(answer, cursor)
  if (platform === 'emdash') return mapEmdash(answer, cursor, state)
  return mapWordpress(answer, cursor)
}

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v))
const title = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
/** MySQL `Y-m-d H:i:s` in UTC → ISO 8601. */
const utc = (s) => `${String(s).replace(' ', 'T')}Z`
const settled = (iso, nowMs) => Date.parse(iso) <= nowMs - SETTLE_MS

/** Walk rows in cursor order; stop at the first unsettled one. */
function walk(rows, nowMs, when, keep, startCursor, idOf) {
  const entries = []
  let next = startCursor
  for (const row of rows) {
    const occurredAt = when(row)
    if (!Number.isFinite(Date.parse(occurredAt)) || !settled(occurredAt, nowMs)) break
    next = idOf(row)
    const entry = keep(row, occurredAt)
    if (entry) entries.push(entry)
  }
  return { entries, next }
}

// ── Joomla ──────────────────────────────────────────────────────────────────────────────────────

// Noise in a "what changed" list: sessions, consent, password and registration flows, the log's
// own housekeeping, guided tours, cache and check-in, and API request lines (a request, not a change).
const JOOMLA_SKIP = [
  /_USER_LOGGED_IN$/,
  /_USER_LOGGED_OUT$/,
  /_USER_LOGIN_FAILED$/,
  /^PLG_USER_TERMS_/,
  /^PLG_PRIVACY_/,
  /^PLG_ACTIONLOG_PRIVACY_/,
  /_USER_(REMIND|RESET_REQUEST|RESET_COMPLETE|REGISTERED|REGISTRATION_ACTIVATE|LOG|LOGEXPORT|CHECKIN|CACHE)$/,
  /_GUIDEDTOURS_/,
  /^PLG_ACTIONLOG_JOOMLA_API$/
]
const JOOMLA_OPS = [
  [/_UNINSTALLED$/, 'uninstall'],
  [/_INSTALLED$/, 'install'],
  [/_UNPUBLISHED$/, 'unpublish'],
  [/_PUBLISHED$/, 'publish'],
  [/_ADDED$/, 'create'],
  [/_DELETED$/, 'delete'],
  [/_TRASHED$/, 'trash'],
  [/_ARCHIVED$/, 'archive'],
  [/_UNBLOCK$/, 'unblock'],
  [/_BLOCK$/, 'block'],
  [/_USER_UPDATE$/, 'update'],
  [/_UPDATED$/, 'update']
]

function mapJoomla(answer, cursor) {
  const nowMs = Date.parse(utc(answer.now))
  const on = answer.enabled ?? {}
  const enabled = on.component === true && on.systemPlugin === true && on.joomlaPlugin === true
  const start = answer.reset ? '0' : cursor || '0'
  // Joomla writes some saves twice (a module save logs two identical rows in the same second,
  // measured on scjo1002, ids 127/128): one admin action is one entry.
  let previous = ''
  const { entries, next } = walk(
    Array.isArray(answer.rows) ? answer.rows : [],
    nowMs,
    (row) => utc(row.logDate),
    (row, occurredAt) => {
      const key = String(row.key ?? '')
      if (!row.userId || JOOMLA_SKIP.some((re) => re.test(key))) return null
      const same = [row.userId, key, row.extension, row.itemId, row.logDate].join('|')
      if (same === previous) return null
      previous = same
      const m = row.message ?? {}
      const type =
        typeof m.type === 'string' && m.type.startsWith('PLG_ACTIONLOG_JOOMLA_TYPE_')
          ? m.type.slice('PLG_ACTIONLOG_JOOMLA_TYPE_'.length).toLowerCase()
          : (str(row.typeTitle) ?? str(row.extension))
      const op = JOOMLA_OPS.find(([re]) => re.test(key))?.[1] ?? str(m.action) ?? 'change'
      // Global configuration has no item: its log line names the component, not a resource.
      const configLike = type === 'application_config'
      return {
        cursorKey: `${row.id}@${occurredAt}`,
        occurredAt,
        actor: { id: String(row.userId), name: title(row.userName) ?? title(m.username) },
        resourceType: type,
        resourceId: configLike ? null : str(m.id ?? (row.itemId || null)),
        resourceTitle: configLike ? null : (title(m.title) ?? title(m.name) ?? title(m.extension_name)),
        op,
        // The log's own message key, verbatim: kept as evidence for the detail. The Source no longer
        // depends on it (02/10: an authenticated CMS identity suffices for cms-admin).
        changeType: str(key),
        producer: null
      }
    },
    start,
    (row) => String(row.id)
  )
  return {
    entries,
    cursor: next,
    enabled,
    ...(enabled ? {} : { reason: 'log-disabled' }),
    reset: answer.reset === true
  }
}

// ── EmDash ──────────────────────────────────────────────────────────────────────────────────────

const EMDASH_OPS = { create: 'create', update: 'update', delete: 'delete', 'media:upload': 'upload' }

function mapEmdash(answer, cursor, previousState) {
  const nowMs = Number(answer.now)
  const agents = new Set(Array.isArray(answer.agentIds) ? answer.agentIds : [])
  const users = answer.users ?? {}
  const enabled = answer.enabled === true
  const start = answer.reset ? '' : cursor
  const { entries, next } = walk(
    Array.isArray(answer.rows) ? answer.rows : [],
    nowMs,
    (row) => {
      // The storage id starts with the write's own Date.now(); it is what orders the cursor.
      const ms = Number(String(row.id).slice(0, 13))
      return Number.isFinite(ms) ? new Date(ms).toISOString() : String(row.timestamp)
    },
    (row, occurredAt) => {
      if (row.userId && agents.has(row.userId)) return null
      const media = row.resourceType === 'media'
      return {
        cursorKey: String(row.id),
        occurredAt,
        actor: row.userId ? { id: String(row.userId), name: title(users[row.userId]?.name) } : null,
        resourceType: media ? 'media' : (str(row.collection) ?? str(row.resourceType)),
        resourceId: str(row.resourceId),
        resourceTitle: media ? null : (title(row.title) ?? title(row.slug)),
        op: EMDASH_OPS[row.action] ?? str(row.action) ?? 'change',
        changeType: str(row.action),
        producer: null
      }
    },
    start,
    (row) => String(row.id)
  )
  const published = emdashPublishState(answer, emdashState(previousState))
  return {
    entries: published ? [...entries, ...published.entries] : entries,
    cursor: next,
    enabled,
    ...(enabled ? {} : { reason: 'log-disabled' }),
    reset: answer.reset === true,
    // An adapter that predates the publish state reads none: the snapshot is left as it was.
    ...(published ? { state: published.state } : {})
  }
}

// ── EmDash publish state ────────────────────────────────────────────────────────────────────────

/**
 * 🔒 PUBLISH AND UNPUBLISH ARE READ OFF THE ENTRY, BECAUSE NOTHING ON THE SITE LOGS THEM (
 * 04/10/2026; measured on c1em1004, `tasks/evidence/emdash-attribution/publish-state-measure.md`).
 * EmDash 1.0.1's audit-log plugin has no publish/unpublish hook, core's hooks for them carry no
 * actor, and neither writes who did it anywhere: a person's publish in the admin, the scheduler's
 * and Tracy's `content_publish` leave the same bytes. So the collector compares each entry's state
 * with the previous pull's and emits `publish` / `unpublish` rows with NO actor — Tracy's own are
 * matched to its `site_write` by id in tracy-web (C1), the scheduler's are told by their schedule.
 *
 * The snapshot (`state`, kept by tracy-web beside the cursor) is small on purpose:
 *   w — the `updated_at` mark already read (the adapter's clock minus SETTLE_MS, like the cursor);
 *   e — only the entries that are NOT plainly live (draft, scheduled, a pending change), each
 *       `[status, live_revision_id, scheduled_at]`. An entry absent from `e` is live, as most are.
 * Measured: every publish, unpublish and scheduled publish moves `updated_at`; an edit of a live
 * entry stages a draft revision and moves nothing; the trash moves nothing. So an entry is looked at
 * only when its `updated_at` passed `w`, and then:
 *   - live now, not live before (or created after `w`)          → publish;
 *   - live before and now, `live_revision_id` changed           → publish (a pending change went
 *     live). For an entry absent from `e` the old id is not kept: the new one was minted after `w`
 *     (its ULID time, or the revision's `created_at`) — a draft saved before `w` would have put the
 *     entry in `e`;
 *   - live before, not now                                      → unpublish;
 *   - in the trash                                              → nothing (the audit log has the delete);
 *   - a publish of an entry that was scheduled for S, with `updated_at` ≥ S and no schedule left →
 *     `entry-state:scheduled-publish`: EmDash's own scheduler (it sweeps every ≤ 60 s; a person
 *     publishing early is before S).
 * The first pull, or a snapshot this module did not write, takes the snapshot and emits nothing.
 * KNOWN LIMIT: two flips between pulls are one comparison — unpublished and published again shows
 * as the publish, published and unpublished again shows nothing.
 */
const STATE_KEY = /^[a-z0-9_]{1,64}\/[^\s/]{1,128}$/
const ISO_MS = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/
const STATE_MAX = 5000
const short = (v, n) => v === null || (typeof v === 'string' && v.length <= n)

/** The snapshot `{w, e}` when it is one this module wrote, else null. */
export function emdashState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const { w, e } = /** @type {{w?: unknown, e?: unknown}} */ (state)
  if (typeof w !== 'string' || !ISO_MS.test(w) || !Number.isFinite(Date.parse(w))) return null
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null
  const keys = Object.keys(e)
  if (keys.length > STATE_MAX) return null
  for (const key of keys) {
    const v = e[key]
    if (!STATE_KEY.test(key) || !Array.isArray(v) || v.length !== 3) return null
    if (typeof v[0] !== 'string' || !short(v[0], 40) || !short(v[1], 128) || !short(v[2], 40)) return null
  }
  return { w, e: /** @type {Record<string, [string, string|null, string|null]>} */ (e) }
}

const ULID_TIME = /^[0-9A-HJKMNP-TV-Z]{10}[0-9A-HJKMNP-TV-Z]{16}$/
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** When a revision was minted: its ULID's time, else its `created_at` (SQLite `Y-m-d H:i:s`, UTC). */
function mintedAt(id, createdAt) {
  if (typeof id === 'string' && ULID_TIME.test(id)) {
    let ms = 0
    for (const ch of id.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(ch)
    return ms
  }
  if (typeof createdAt !== 'string') return NaN
  return Date.parse(createdAt.endsWith('Z') ? createdAt : `${createdAt.replace(' ', 'T')}Z`)
}

/**
 * The publish rows and the next snapshot, or null when the adapter read no state (an older one).
 * @param {any} answer the adapter's JSON line
 * @param {{w: string, e: Record<string, [string, string|null, string|null]>} | null} previous
 */
function emdashPublishState(answer, previous) {
  if (!Array.isArray(answer.states)) return null
  const mark = Number(answer.now) - SETTLE_MS
  if (!Number.isFinite(mark)) return null
  const w = previous && Date.parse(previous.w) > mark ? previous.w : new Date(mark).toISOString()
  // The mark the adapter read from must be the snapshot's, or "changed" means something else.
  const comparable = previous !== null && answer.since === previous.w
  const settled = (r) => Number.isFinite(Date.parse(r.updatedAt)) && Date.parse(r.updatedAt) <= mark
  const notPlain = (r) => r.status !== 'published' || Boolean(r.scheduledAt) || r.pending === true
  /** @type {Record<string, [string, string|null, string|null]>} */
  const e = {}
  const found = []
  for (const r of answer.states) {
    if (!r || typeof r.collection !== 'string' || typeof r.id !== 'string') continue
    const key = `${r.collection}/${r.id}`
    if (!STATE_KEY.test(key)) continue
    // An entry still being written keeps its old state, so the next pull compares it again.
    if (comparable && !settled(r)) {
      if (Object.hasOwn(previous.e, key)) e[key] = previous.e[key]
      continue
    }
    if (notPlain(r)) e[key] = [String(r.status), str(r.live), str(r.scheduledAt)]
    if (!comparable || r.changed !== true || r.deleted === true) continue
    const since = Date.parse(previous.w)
    const before = Object.hasOwn(previous.e, key)
      ? previous.e[key]
      : Date.parse(r.createdAt) > since
        ? null // created after the last pull
        : ['published', undefined, null] // plainly live: the default
    const live = r.status === 'published'
    const wasLive = before !== null && before[0] === 'published'
    let op = null
    if (live && !wasLive) op = 'publish'
    else if (live && wasLive) {
      const moved =
        before[1] !== undefined
          ? before[1] !== str(r.live)
          : r.live
            ? mintedAt(r.live, r.liveAt) > since
            : false
      if (moved) op = 'publish'
    } else if (!live && wasLive) op = 'unpublish'
    if (!op) continue
    const scheduledFor = before?.[2] ? Date.parse(before[2]) : NaN
    const scheduler =
      op === 'publish' &&
      Number.isFinite(scheduledFor) &&
      !r.scheduledAt &&
      Date.parse(r.updatedAt) >= scheduledFor
    const occurredAt = new Date(Date.parse(r.updatedAt)).toISOString()
    found.push({
      cursorKey: `state:${occurredAt}:${key}:${op}`,
      occurredAt,
      actor: null,
      resourceType: r.collection,
      resourceId: r.id,
      resourceTitle: title(r.title) ?? title(r.slug),
      op,
      changeType: scheduler ? 'entry-state:scheduled-publish' : `entry-state:${op}`,
      producer: null
    })
  }
  found.sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.cursorKey < b.cursorKey
        ? -1
        : 1
      : a.occurredAt < b.occurredAt
        ? -1
        : 1
  )
  return { entries: found, state: { w, e } }
}

// ── WordPress ───────────────────────────────────────────────────────────────────────────────────

/**
 * 🔒 THE CONTRACT P2.1 WRITES TO. `<prefix>tracy_admin_log`, one row per admin action, written by
 * the hook in `tracy-access.php` — which skips Tracy's own Apply requests itself (by the Apply URL,
 * `admin-ajax.php?action=claude_cowork`, never by `x-tracy-email`) and WP-CLI:
 *
 *   id             bigint auto-increment — the cursor
 *   at             datetime, UTC
 *   user_id        bigint — 0 only from WP-Cron (an automatic update, a scheduled post going live):
 *                  a real change nobody typed, kept with a null actor. The hook logs no visitor.
 *   user_name      display name of that user ('' for 0)
 *   type           the hook that wrote the row (`wp_after_insert_post`, `updated_option`, …)
 *   resource_type  a post type (`page`, `post`, `wp_template`, …), `attachment`, `nav_menu`,
 *                  `theme`, `plugin`, `core`, `option`, `theme_mods`
 *   resource_id    the resource's id, as text (option name, plugin file, theme stylesheet)
 *   resource_title its title or name, as text ('' when it has none)
 *   op             `create` · `update` · `delete` · `trash` · `restore` · `upload` · `install` ·
 *                  `activate` · `deactivate` · `switch`
 *
 * Schema 2 (hook 0.3.0, Site changes V2) adds who WROTE each row, for the cron contract to be read
 * off the row itself instead of the hook's history:
 *
 *   producer_version  the hook's version (`TRACY_ADMIN_LOG_PRODUCER`); '' on rows of schema 1
 *   producer_hash     sha256 of the hook file that wrote the row; '' when it could not be read
 *   context           `cron` when the row was written inside WP-Cron (`DOING_CRON`) — the only
 *                     request context the hook has ever checked; '' otherwise
 *
 * The adapter (`cms-log-wordpress.php`) answers `installed: false` until the table exists, and
 * selects the schema-2 columns only when the table has them.
 */
/**
 * `{schema, version, hash?, context?}` of a row written by a schema-2 hook, or null for a legacy row
 * (schema 1 wrote no producer; tracy-web then falls back on the hook's history, contract D1).
 */
function wordpressProducer(row) {
  const version = str(row.producer_version)
  if (!version) return null
  const hash = str(row.producer_hash)
  const context = str(row.context)
  return { schema: '2', version, ...(hash ? { hash } : {}), ...(context ? { context } : {}) }
}

/**
 * The webroot paths an adapter row names in `files` (a WordPress upload), at most 50, or null: a
 * list holding anything that is not a relative path is not kept at all.
 * @param {unknown} files
 * @returns {string[] | null}
 */
function uploadFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 50) return null
  const ok = (f) =>
    typeof f === 'string' &&
    f.length > 0 &&
    f.length <= 512 &&
    !f.startsWith('/') &&
    !f.split('/').includes('..')
  return files.every(ok) ? files.map(String) : null
}

function mapWordpress(answer, cursor) {
  if (answer.installed !== true) {
    // The hook is in place but has logged nothing yet, so it has not created its table: an empty
    // log, read in full — not a missing collector.
    if (answer.hook?.present === true)
      return { entries: [], cursor: cursor || '0', enabled: true, reset: false }
    return { entries: [], cursor: cursor || '0', enabled: false, reason: 'hook-not-installed', reset: false }
  }
  const nowMs = Date.parse(utc(answer.now))
  const start = answer.reset ? '0' : cursor || '0'
  const { entries, next } = walk(
    Array.isArray(answer.rows) ? answer.rows : [],
    nowMs,
    (row) => utc(row.at),
    (row, occurredAt) => {
      const userId = Number(row.user_id)
      return {
        cursorKey: `${row.id}@${occurredAt}`,
        occurredAt,
        actor: userId ? { id: String(userId), name: title(row.user_name) } : null,
        resourceType: str(row.resource_type),
        resourceId: str(row.resource_id),
        resourceTitle: title(row.resource_title),
        op: str(row.op) ?? 'change',
        changeType: str(row.type),
        producer: wordpressProducer(row),
        // E5.1c: the files an upload wrote (the adapter reads them off the attachment); no key otherwise.
        ...(uploadFiles(row.files) ? { files: uploadFiles(row.files) } : {})
      }
    },
    start,
    (row) => String(row.id)
  )
  return { entries, cursor: next, enabled: true, reset: answer.reset === true }
}
