// Read the EmDash audit-log plugin's entries after a cursor, for tracy-host's `cms-log-pull` job
// (apps/tracy-host/src/cms-log.js maps, filters and advances the cursor). SQLite opened read-only.
//
// 🔒 CONTENT VALUES NEVER LEAVE THE CONTAINER. An entry carries `changes.before/after` — the whole
// record, field by field. Only the title (a name a person reads in a list) and the slug are taken
// from it; every other value stays on the site.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

const app = process.env.TRACY_CMS_LOG_APP_DIR || '/app'
const db = new DatabaseSync(process.env.TRACY_CMS_LOG_DB || `${app}/data/data.db`, { readOnly: true })
const agentEmail = (process.env.TRACY_AGENT_EMAIL || 'tracy-agent@tracy.ai').toLowerCase()
const raw = process.env.TRACY_CMS_LOG_CURSOR || ''
let cursor = /^[0-9]{13}-[0-9A-Za-z_-]{1,80}$/.test(raw) ? raw : ''
const LIMIT = 500

// Coverage: the plugin is declared in the site's own astro config (a native plugin has no row in
// `_plugin_state`), or it has written at least once.
let declared = false
try {
  declared = /@emdash-cms\/plugin-audit-log/.test(readFileSync(`${app}/astro.config.mjs`, 'utf8'))
} catch {
  /* no config to read: coverage then rests on stored entries alone */
}
const hasTable = db
  .prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='_plugin_storage'")
  .get()
const max = hasTable
  ? (db
      .prepare(
        "SELECT MAX(id) AS m FROM _plugin_storage WHERE plugin_id='audit-log' AND collection='entries'"
      )
      .get()?.m ?? '')
  : ''
// A cursor past the newest entry means the entries were wiped: read from the start again.
const reset = Boolean(cursor) && cursor > max
if (reset) cursor = ''

const text = (v, n = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const rows = []
if (hasTable) {
  for (const r of db
    .prepare(
      "SELECT id, data FROM _plugin_storage WHERE plugin_id='audit-log' AND collection='entries' AND id > ? ORDER BY id ASC LIMIT ?"
    )
    .all(cursor, LIMIT)) {
    let d = {}
    try {
      d = JSON.parse(r.data) ?? {}
    } catch {
      /* an unreadable entry still moves the cursor */
    }
    const after = d.changes?.after ?? {}
    const before = d.changes?.before ?? {}
    rows.push({
      id: r.id,
      timestamp: text(d.timestamp, 40),
      action: text(d.action, 40),
      collection: text(d.collection, 80),
      resourceId: text(d.resourceId, 120),
      resourceType: text(d.resourceType, 40),
      userId: text(d.userId, 120),
      // A save carries the record's fields (`title`); a delete carries the whole stored record,
      // fields under `data`.
      title: text(after.title) ?? text(before.title) ?? text(before.data?.title),
      slug: text(d.metadata?.slug, 200) ?? text(after.slug) ?? text(before.slug, 200)
    })
  }
}
// ── Publish state ───────────────────────────────────────────────────────────────────────────────
// The audit-log plugin has no publish/unpublish hook and EmDash core names nobody on either
// (publish-state-measure.md), so the host derives those events by comparing each entry's state
// between two pulls. Read here, per `ec_<collection>` table:
//   - every entry that is NOT plainly live (a draft, a scheduled entry, one with a pending change):
//     the snapshot the host keeps of them is small, a plainly live entry being the default;
//   - every entry whose `updated_at` is past the host's mark (`TRACY_CMS_LOG_SINCE`): each publish,
//     unpublish and scheduled publish moves `updated_at`, an edit of a live entry and the trash do not.
// Only the title and the slug of a changed entry leave; no field value does.
const sinceRaw = process.env.TRACY_CMS_LOG_SINCE || ''
const since = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/.test(sinceRaw)
  ? sinceRaw
  : ''
const STATE_LIMIT = 2000
const STATE_COLUMNS = ['id', 'status', 'created_at', 'updated_at', 'scheduled_at', 'deleted_at']
const states = []
let statesTruncated = false
const hasRevisions = Boolean(
  db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='revisions'").get()
)
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ec\\_%' ESCAPE '\\'")
  .all()
  .map((t) => t.name)
  .filter((name) => /^ec_[a-z0-9_]{1,64}$/.test(name))
for (const table of tables) {
  const cols = new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name)
  )
  if (!STATE_COLUMNS.every((c) => cols.has(c))) continue
  const pick = (c) => (cols.has(c) ? c : `NULL AS ${c}`)
  const base = `SELECT id, status, ${pick('live_revision_id')}, ${pick('draft_revision_id')}, scheduled_at,
    created_at, updated_at, deleted_at`
  const pending = cols.has('draft_revision_id') ? 'OR draft_revision_id IS NOT NULL' : ''
  const seen = new Set()
  const push = (r, changed) => {
    if (seen.has(r.id)) return
    if (states.length >= STATE_LIMIT) {
      statesTruncated = true
      return
    }
    seen.add(r.id)
    let liveAt = null
    if (changed && r.live_revision_id && hasRevisions)
      liveAt = text(
        db.prepare('SELECT created_at FROM revisions WHERE id = ?').get(r.live_revision_id)?.created_at,
        40
      )
    states.push({
      collection: table.slice(3),
      id: text(r.id, 128),
      status: text(r.status, 40),
      live: text(r.live_revision_id, 128),
      pending: Boolean(r.draft_revision_id),
      scheduledAt: text(r.scheduled_at, 40),
      createdAt: text(r.created_at, 40),
      updatedAt: text(r.updated_at, 40),
      deleted: Boolean(r.deleted_at),
      changed,
      ...(changed
        ? {
            title: cols.has('title') ? text(r.title) : null,
            slug: cols.has('slug') ? text(r.slug, 200) : null,
            liveAt
          }
        : {})
    })
  }
  // Changed rows first, so a row that is both carries its title.
  if (since)
    for (const r of db
      .prepare(
        `${base}, ${pick('title')}, ${pick('slug')} FROM ${table} WHERE updated_at > ? ORDER BY updated_at`
      )
      .all(since))
      push(r, true)
  for (const r of db
    .prepare(`${base} FROM ${table} WHERE status <> 'published' OR scheduled_at IS NOT NULL ${pending}`)
    .all())
    push(r, false)
}

const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))]
const users = {}
let agentIds = []
const hasUsers = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='users'").get()
if (hasUsers) {
  for (const id of ids) {
    const u = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id)
    if (u) users[id] = { name: text(u.name, 120) ?? text(u.email, 200) }
  }
  agentIds = db
    .prepare('SELECT id FROM users WHERE lower(email) = ?')
    .all(agentEmail)
    .map((u) => u.id)
}
db.close()
console.log(
  JSON.stringify({
    ok: true,
    platform: 'emdash',
    now: Date.now(),
    enabled: declared || Boolean(max),
    maxId: max,
    reset,
    agentIds,
    users,
    rows,
    since,
    states,
    statesTruncated
  })
)
