/**
 * WHERE A CHANGE CAME FROM — the one Source classifier of Site changes V2 (plan
 * `tasks/todo-site-changes-v2.md` §2.1, contract `tasks/evidence/site-changes-v2/contract.md` §1).
 *
 * Two halves, one rule set, one fixture (`test/activity-source.test.mjs` runs both on the same rows):
 *   - {@link V2_SOURCES_SQL}: the Postgres CASE every V2 page AND every V2 count reads, so a filter
 *     is applied BEFORE `limit` and the counts are counted over exactly the rows a page can show.
 *   - the JS functions below: the same decisions for the rows Postgres does not hold (Git moments
 *     no row accounts for: a deploy before the next chat turn, a legacy restore) and, for Postgres
 *     rows, the evidence state and service names the detail shows.
 *
 * 🔒 SOURCE IS PROVEN, NEVER GUESSED (plan §2.1 invariants). What each Source needs:
 *   chat          a turn opened through the authenticated `POST /turn`, or a write through an
 *                 authenticated door that names a chat turn or chat session.
 *   design-system a press of the site browser's Design system button: a `ds-slot` write (apply or
 *                 undo) by an authenticated seat that the door itself recorded as the button's
 *                 (`target.channel = 'button'` — the call carried neither an actor grant nor a chat
 *                 session, `design-system.js` `isChatCall`). The chat route's apply stays `chat`; a
 *                 row from before the door said its channel stays what it was (`chat`).
 *   setup         a write the Apply door recorded as Tracy setting the site up from the brief the person
 *                 sent in the Add site popup (`site_write.origin = 'setup'`, the run in `origin_ref`):
 *                 written by the server for that person (`applyAs`), never over HTTP. Executor Tracy, the
 *                 person who sent the brief its initiator. A write with no session and no such record is
 *                 NOT setup — the gap is no proof (council 11/10/2026, sweep #4).
 *   api           a write the Apply door recorded as a seat key's (`origin = 'api'`, the key in
 *                 `origin_ref`) — `/v1` on the api host. A chat header that looks like a key's lease
 *                 identity (`key:<id>`) is not it.
 *   comment       a turn the host read as a comment send AND whose comment request is on record
 *                 (`comment_ns`, else the same conversation's request with the same words). A turn
 *                 that says "comment" with no request on record is `unknown` (evidence conflicting).
 *   cms-admin     a row of the CMS's OWN log carrying an authenticated CMS identity (a user id) —
 *                 {@link hasCmsIdentity}. 02/10: authenticated CMS identity suffices; channel
 *                 is not recorded and not required (admin screen, REST, app password all count).
 *   automatic     a WordPress log row with no user, under the hook's cron contract (user 0 is logged
 *                 only inside WP-Cron); Tracy's own housekeeping commit.
 *   deployment    an outside@ commit whose subject the deploy script wrote, with a valid tag; a seal
 *                 whose every file is Tracy's own Cowork package and that moved the package's
 *                 manifest ({@link isCoworkUpdateSeal}): the package updating itself.
 *   site-changes  a succeeded `site_operation` (undo/reset); a legacy restore commit proven by
 *                 author fleet@ + the ORIGINAL subject (contract D2 — never the `title_of` title).
 *   unknown       everything else, with whatever identity is known.
 */

/** The Source enum (contract §1), in the order the UI lists the filter. */
export const SOURCES = /** @type {const} */ ([
  'chat',
  'comment',
  'design-system',
  'setup',
  'api',
  'cms-admin',
  'automatic',
  'deployment',
  'site-changes',
  'unknown'
])

/** A V2 row's record kind (`kind` of a V2 item): which table or Git produced it. */
export const V2_RANK = {
  turn: 6,
  operation: 5,
  git: 4,
  writes: 3,
  'outside-files': 2,
  'cms-change': 1
}

/** `webroot-git.sh` TAG_SHAPE: a deploy tag the script accepted. */
export const DEPLOY_TAG_SHAPE = /^[A-Za-z0-9._:+-]{1,128}$/
const DEPLOY_TAG_SQL = '^[A-Za-z0-9._:+-]{1,128}$'
/** `webroot-git.sh` HOUSEKEEPING_TITLE (the reader strips "outside Tracy: "). */
export const HOUSEKEEPING_TITLE = 'housekeeping, internal files taken out of the history'

/**
 * The files of Tracy's own Cowork package on a site: the Joomla package (component, its two system
 * plugins, their media and language files, the package manifest and install script) and the
 * WordPress plugin folder. ONE pattern for the JS and the SQL half (a POSIX ERE Postgres reads as is).
 *
 * Why it exists (walkthrough 22/10/2026, `tracywalk-1792671498`): the package updates ITSELF —
 * `plg_system_claudecoworkupdate` installs the announced release on the first request after it is
 * published, and WordPress auto-updates the plugin. Nothing of Tracy takes a moment for that write,
 * so the next look sealed it as "Files changed; source unknown": 122 files on a site built 35 s
 * before, and 30 such rows across the Joomla sites on dev (26/10) — every one of them this update.
 */
const COWORK_PACKAGE_PATH =
  '^(administrator/components/com_claudecowork/|components/com_claudecowork/' +
  '|plugins/system/claudecowork(api|update)/|media/(com_claudecowork|plg_system_claudecowork(api|update))/' +
  '|administrator/manifests/packages/(pkg_claudecowork\\.xml$|claudecowork/)' +
  '|(administrator/)?language/[^/]+/([a-z]{2}-[A-Z]{2}\\.)?(com_claudecowork|plg_system_claudecowork(api|update)|pkg_claudecowork)(\\.sys)?\\.ini$' +
  '|wp-content/plugins/claude-cowork/)'
const COWORK_PACKAGE_RE = new RegExp(COWORK_PACKAGE_PATH)

/**
 * The files an INSTALL of the package always rewrites (the version lives in them). A seal that holds
 * the package's code but none of these is a hand edit of Tracy's code, not an update: it stays Unknown.
 */
const COWORK_MANIFESTS = Object.freeze([
  'administrator/manifests/packages/pkg_claudecowork.xml',
  'administrator/components/com_claudecowork/claudecowork.xml',
  'wp-content/plugins/claude-cowork/claude-cowork.php'
])

/**
 * Whether a seal is Tracy's Cowork package updating itself: EVERY file it holds is the package's
 * ({@link COWORK_PACKAGE_PATH}) and one of them is a manifest the install rewrites
 * ({@link COWORK_MANIFESTS}). One file of anybody else's in the same seal and the seal stays Unknown
 * whole — a seal is one commit and cannot be split. A seal kept without its paths claims nothing.
 * @param {{cause?: string, paths?: unknown}} o a `site_outside` row
 */
export function isCoworkUpdateSeal(o) {
  if (o.cause !== 'seal' || !Array.isArray(o.paths) || o.paths.length === 0) return false
  return (
    o.paths.every((p) => typeof p === 'string' && COWORK_PACKAGE_RE.test(p)) &&
    o.paths.some((p) => COWORK_MANIFESTS.includes(p))
  )
}

/** The SQL twin of {@link isCoworkUpdateSeal} for a `site_outside` alias. */
export const coworkUpdateSealSql = (o) =>
  `(${o}.cause = 'seal' and ${o}.paths is not null and cardinality(${o}.paths) > 0
    and not exists (select 1 from unnest(${o}.paths) as cp(path) where cp.path !~ '${COWORK_PACKAGE_PATH}')
    and ${o}.paths && array[${COWORK_MANIFESTS.map((m) => `'${m}'`).join(', ')}]::text[])`

/**
 * The committer identity of `restore_undo` / `restore_reset` — a cross-file contract with
 * `webroot-git.sh` `ensure`, not a deployment address: the script writes this identity on every
 * fleet, so there is nothing to configure per deployment. The `DEFAULT_` name is this gate truth
 * said in `check-origins`' shape; changing it means changing the script in the same commit.
 */
const DEFAULT_RESTORE_AUTHOR = 'fleet@tracy.ai'
export const RESTORE_AUTHOR = DEFAULT_RESTORE_AUTHOR
/** `restore: undo <short> (<subject>)` and `restore: back to <short>`, as the script writes them. */
const RESTORE_UNDO_SUBJECT = /^restore: undo ([0-9a-f]{7,64}) \(/
const RESTORE_RESET_SUBJECT = /^restore: back to ([0-9a-f]{7,64})$/

/**
 * Whether a CMS log row names an authenticated CMS account: a user id the CMS itself wrote.
 *
 * 02/10 (reversing contract D1 in part, after testing on dev): authenticated CMS identity
 * suffices for `cms-admin`; channel is not recorded and not required. None of the three logs says
 * whether a change came from the admin screen, REST, an application password or the Web Services
 * API, so the Source no longer asks. What still holds:
 *   - the row comes from the CMS's own log (`site_cms_change`), never from Tracy's doors: Tracy's
 *     own writes are left out by each collector (the Apply door skipped by the WordPress hook and
 *     absent from Joomla's log, EmDash's agent user dropped — `apps/tracy-host/src/cms-log.js`);
 *   - no id, no claim: a row with no account (EmDash deletes and uploads) stays `unknown`, and a
 *     WordPress row with no user is `automatic` only under the hook's cron contract;
 *   - user 0 is nobody (Joomla's collector drops it; WordPress logs it only from WP-Cron).
 * The SQL CASE in {@link V2_SOURCES_SQL} asks the same: `cms_actor->>'id'` present and not 0.
 * @param {unknown} actor `site_cms_change.cms_actor`
 */
export function hasCmsIdentity(actor) {
  if (!actor || typeof actor !== 'object') return false
  const id = /** @type {{id?: unknown}} */ (actor).id
  const text = typeof id === 'number' ? String(id) : typeof id === 'string' ? id.trim() : ''
  return text !== '' && text !== '0'
}

/**
 * WordPress hook versions whose contract logs user 0 ONLY inside WP-Cron (`tracy-access.php`
 * `tracy_admin_log`: `DOING_CRON` gate, WP-CLI and `wp_installing()` skipped). A row whose
 * producer names another version proves nothing about a missing user.
 *
 * Legacy rows (no producer, written before the hook reported one) rest on the hook's history:
 * every version of `tracy-access.php` that ever wrote `tracy_admin_log` (`cbf67c878`, `e43ff4a56`,
 * both `Version: 0.2.0`) has the cron gate and skips WP-CLI (P0 report §3).
 *
 * 0.3.1 (03/10) changed only the op of an upgrader row (`update` vs `install`); the cron gate is
 * the same bytes. A new hook version joins this list only after its gate has been read.
 * 0.4.0 (26/10, #1768) changed how the hook trusts the proxy (signed assertion); `tracy_admin_log`
 * and its cron gate are untouched, read in that diff.
 */
export const WP_CRON_PRODUCERS = Object.freeze(['0.3.0', '0.3.1', '0.4.0'])

/**
 * The `tracy_emdash` tools whose success EmDash logs as a `delete` row: a move to the trash and a
 * permanent delete both fire `content:afterDelete` (EmDash 1.0.1 `runAfterDeleteHooks`).
 */
export const TRACY_EMDASH_DELETE_TOOLS = Object.freeze(['content_delete', 'content_permanent_delete'])

/**
 * C1 media (04/10/2026): each anonymous EmDash CMS op this rule may hand to Tracy, with the
 * `tracy_emdash` writes that make it. `upload`: the audit-log plugin's `media:upload` row (resource
 * type `media`, the item id; core 1.0.1 `MediaAfterUploadEvent` has no actor), made by `media_upload`
 * — `tracy_emdash` itself or `tracy_site` `media.upload` / `media.draw`, which run it. `delete` also
 * takes `media_delete`: no release logs a media delete today (core fires no hook for it, audit-log
 * 0.2.3 has none), so it only keeps a later audit-log's media delete row from turning into Unknown.
 * The kind keeps the pairs apart: a content row's type is its collection, a media row's `media`.
 */
export const TRACY_EMDASH_TOOLS_OF_OP = Object.freeze({
  delete: Object.freeze([...TRACY_EMDASH_DELETE_TOOLS, 'media_delete']),
  upload: Object.freeze(['media_upload']),
  // EmDash publish state (04/10/2026): the collector reads publish/unpublish off the entry, with no
  // account (nothing on the site records one — `publish-state-measure.md`). Only the tool that IS
  // the publish: a `content_update {status: 'published'}` also publishes, but its `site_write` does
  // not say so, and letting every update stand for a publish would hand a person's publish of the
  // same entry to Tracy.
  publish: Object.freeze(['content_publish']),
  unpublish: Object.freeze(['content_unpublish'])
})

/**
 * Dev e2e 04/10/2026 (E5.e5): a `content_update` that MOVED the entry's live state stands for the
 * publish (or unpublish) the collector reads off it — but only when Tracy's own report says it did
 * (`site_write.target.state`, set by `tracy-site-tools` `writeFacts` from the read before the write
 * and the write's answer, by the collector's own rule). An update whose report says nothing moved is
 * never counted: it would hand a person's publish of the same entry to Tracy.
 */
export const TRACY_EMDASH_STATE_OF_OP = Object.freeze({ publish: 'published', unpublish: 'draft' })

/**
 * The `change_type` the collector gives a publish that EmDash's own scheduler made: the entry was
 * scheduled for S, and went live at or after S with its schedule gone (`apps/tracy-host/src/cms-log.js`
 * `emdashPublishState`). It is `automatic`, and it is never one of Tracy's writes — Tracy's
 * `content_schedule` is its own row; the publish is the scheduler's.
 */
export const EMDASH_SCHEDULED_PUBLISH = 'entry-state:scheduled-publish'

/**
 * C1 (04/10/2026): A CMS `delete` ROW THAT ONE OF TRACY'S OWN DELETES NAMES IS TRACY'S, AND IS
 * DROPPED LIKE EVERY OTHER ROW OF TRACY'S AGENT. EmDash core passes no actor to `content:afterDelete`
 * (1.0.1, `plugins/types.ts` `ContentDeleteEvent`), so the audit-log plugin writes every delete with no
 * user and the collector cannot drop the agent's as it drops its creates and updates
 * (`apps/tracy-host/src/cms-log.js`). Tracy's half of the same delete is on record: `tracy-site-tools`
 * reports each `tracy_emdash` delete to `POST /changed` with the collection and every row id it
 * removed (`site_write`, `via = 'emdash-mcp'`). That write is the Site changes row; the CMS row repeats
 * it, so it is left out of every read — the V2 list and counts, the V1 list and the CMS log door —
 * exactly as the collector leaves out the agent's other rows.
 *
 * 🔒 BY ID, NEVER BY TIME (plan V2 §2.1 rule 4). The match is site + collection + row id + a delete
 * action, on a write that succeeded. And it must be unambiguous: the anonymous delete rows of one row
 * id are Tracy's only when Tracy's successful deletes of that id are at least as many. One more CMS
 * row than Tracy deletes means somebody else deleted it too, and which row is whose is not known — so
 * every one of them stays `unknown`. A row carrying a CMS account is never touched.
 *
 * C1 media (04/10/2026): the same rule, op for op, for Tracy's own media uploads (and media deletes,
 * should a later audit-log log them) — `TRACY_EMDASH_TOOLS_OF_OP`. Every EmDash upload is logged with
 * no user, and Tracy's report names the uploaded item's id (`target {kind: 'media', id}`).
 *
 * C1 publish (04/10/2026): and for EmDash's publish and unpublish, which the collector reads off the
 * entry's state with no account (EmDash records none, `publish-state-measure.md`). Tracy's
 * `content_publish` / `content_unpublish` report the entry's row id (`target {kind: <collection>,
 * id}`). A publish EmDash's scheduler made ({@link EMDASH_SCHEDULED_PUBLISH}) is neither matched nor
 * counted: it is `automatic`. Since the dev e2e of 04/10 a `content_update` whose report says it moved
 * the live state counts too ({@link TRACY_EMDASH_STATE_OF_OP}): "Published home" was an Unknown row
 * after Tracy's own `content_update {status: "published"}`.
 *
 * A SQL predicate on the `site_cms_change` row aliased `alias`; true for a row to keep.
 * @param {string} alias
 */
export function notTracyOwnCmsDelete(alias) {
  const c = alias
  const anonymous = (r) => `(${r}.cms_actor is null or ${r}.cms_actor = 'null'::jsonb)`
  const list = (tools) => tools.map((t) => `'${t}'`).join(', ')
  const ops = Object.keys(TRACY_EMDASH_TOOLS_OF_OP)
  const stateOf = /** @type {Record<string, string>} */ (TRACY_EMDASH_STATE_OF_OP)
  const toolsOfOp = ops
    .map((op) => {
      const tools = `w.action in (${list(TRACY_EMDASH_TOOLS_OF_OP[op])})`
      const state = stateOf[op]
      return `when '${op}' then ${
        state ? `(${tools} or (w.action = 'content_update' and w.target->>'state' = '${state}'))` : tools
      }`
    })
    .join(' ')
  // The scheduler's publish is never Tracy's, and is not counted against Tracy's publishes. Read
  // through `to_jsonb`: the V1 reads run this predicate on a database from before 048 too, which has
  // no `change_type` column (and no scheduler row).
  const notScheduler = (r) =>
    `(to_jsonb(${r}) ->> 'change_type') is distinct from '${EMDASH_SCHEDULED_PUBLISH}'`
  return `not (${c}.source = 'emdash-audit-log' and ${c}.op in (${list(ops)}) and ${anonymous(c)}
          and ${notScheduler(c)}
          and ${c}.resource_id is not null and ${c}.resource_type is not null
          and (select count(*) from site_cms_change d
                where d.site_key = ${c}.site_key and d.source = ${c}.source and d.op = ${c}.op
                  and ${anonymous('d')} and ${notScheduler('d')}
                  and d.resource_type = ${c}.resource_type and d.resource_id = ${c}.resource_id)
              <= (select count(*) from site_write w
                   where w.site_key = ${c}.site_key and w.via = 'emdash-mcp' and w.outcome = 'ok'
                     and (case ${c}.op ${toolsOfOp} else false end)
                     and w.target->>'kind' = ${c}.resource_type
                     and (w.target->>'id' = ${c}.resource_id
                          or (jsonb_typeof(w.target->'ids') = 'array' and w.target->'ids' ? ${c}.resource_id))))`
}

/** Platform of each CMS log source (`site_cms_change.source`). */
export const CMS_OF = {
  'wordpress-tracy-log': 'wordpress',
  'joomla-action-log': 'joomla',
  'emdash-audit-log': 'emdash'
}

/**
 * The Sources the start screen's badge counts whole (plan `tasks/todo-site-changes-badge-count.md`
 * §1, §5): what a person did through Tracy, what a CMS account did, what the tab did, what nobody
 * can explain, and a Tracy deploy of its own plugin (`deployment` — software of the site changed, the
 * same thing a plugin update is, so it is not left out while those count; decided 04/10 with Codex).
 * `automatic` is NOT here: it counts only for its SOFTWARE rows, see {@link softwareUnitOf} — a cron
 * that publishes posts or syncs a catalogue (24,220 `catalog_item` rows on one site in two days,
 * measured 04/10 on dev) would light the badge every morning and teach people to ignore it; a cron
 * that installs or updates a plugin, a theme or core (1–4 rows per site-day on dev) is the site's
 * software changing under them, which they want to know. Housekeeping is `automatic` content-less
 * and never counts. The ledger keeps every row; only the badge chooses.
 */
export const BADGE_SOURCES = /** @type {const} */ ([
  'chat',
  'comment',
  'design-system',
  'setup',
  'api',
  'cms-admin',
  'site-changes',
  'unknown',
  'deployment'
])

/**
 * A CMS row that changed the SITE'S SOFTWARE: a plugin, theme, core, or a Joomla extension part
 * (package, language, template, module, component, library) installed, updated or removed. The WP
 * hook logs these on `upgrader_process_complete`; Joomla's action log on install/update/uninstall.
 */
export const SOFTWARE_RESOURCE_TYPES = /** @type {const} */ ([
  'plugin',
  'theme',
  'core',
  'package',
  'language',
  'template',
  'module',
  'component',
  'library'
])
export const SOFTWARE_OPS = /** @type {const} */ (['install', 'update', 'delete', 'uninstall'])
const sqlList = (xs) => xs.map((x) => `'${x}'`).join(', ')

/**
 * The badge's grouping unit of a CMS row, or null when the row is counted on its own. One upgrade
 * run writes several software rows within a second or two (`update plugin → update theme → update
 * core` for a WP auto-update, `install package → language → template` for one Joomla extension; both
 * measured 04/10 on dev), and a person reads them as ONE thing happening: rows of one unit — the same
 * CMS log and the same CMS account (or no account: `auto`) — that follow each other within two
 * seconds of `occurred_at` count as one (an island). Content rows are never grouped: two Saves a
 * second apart are two things the person did. Same rule as the SQL column `unit` of
 * {@link V2_SOURCES_SQL}; keep the two together.
 * @param {{resource_type?: string|null, op?: string|null, source?: string|null, cms_actor?: {id?: unknown}|null}} c
 * @returns {string|null}
 */
export function softwareUnitOf(c) {
  if (!SOFTWARE_RESOURCE_TYPES.includes(c.resource_type) || !SOFTWARE_OPS.includes(c.op)) return null
  const id = c.cms_actor && typeof c.cms_actor === 'object' ? String(c.cms_actor.id ?? '').trim() : ''
  return `${c.source ?? 'cms'}:${id === '' || id === '0' ? 'auto' : id}`
}

/** The SQL twin of {@link softwareUnitOf} for the CMS branch of {@link V2_SOURCES_SQL} (alias `c`). */
const SOFTWARE_UNIT_SQL = `case when c.resource_type in (${sqlList(SOFTWARE_RESOURCE_TYPES)})
                     and c.op in (${sqlList(SOFTWARE_OPS)})
                then c.source || ':' || (case when btrim(coalesce(c.cms_actor->>'id', '')) in ('', '0') then 'auto'
                                               else btrim(c.cms_actor->>'id') end)
                else null end`

/**
 * The Source of a `site_cms_change` row aliased `c`, as SQL: the CASE {@link V2_SOURCES_SQL} lists the
 * row under, and the one the seal fold asks (only a row with a Source explains a seal). `producers`
 * is the parameter holding {@link WP_CRON_PRODUCERS} as `text[]`. JS twin: {@link classifyCmsChange}.
 * @param {string} c
 * @param {string} producers e.g. `$4`
 */
export function cmsSourceSql(c, producers) {
  return `case when (${c}.cms_actor is null or ${c}.cms_actor = 'null'::jsonb)
                   and ${c}.source = 'wordpress-tracy-log'
                   and (${c}.producer is null
                        or (${c}.producer->>'context' = 'cron' and ${c}.producer->>'version' = any(${producers}::text[])))
                then 'automatic'
              -- EmDash's scheduler publishing on time (EMDASH_SCHEDULED_PUBLISH): the CMS itself.
              when (${c}.cms_actor is null or ${c}.cms_actor = 'null'::jsonb)
                   and ${c}.source = 'emdash-audit-log' and ${c}.change_type = '${EMDASH_SCHEDULED_PUBLISH}'
                then 'automatic'
              -- An authenticated CMS identity (hasCmsIdentity): 02/10, the channel is not asked.
              when btrim(coalesce(${c}.cms_actor->>'id', '')) not in ('', '0')
                then 'cms-admin'
              else 'unknown' end`
}

/**
 * The WordPress core files an update of core writes: everything under `wp-admin/` and `wp-includes/`,
 * and the loose files at the root that ship with it — never `wp-config.php` or `.htaccess`, which are
 * the site's own.
 */
const WP_CORE_ROOT_FILES = Object.freeze(['index.php', 'xmlrpc.php', 'license.txt', 'readme.html'])

/**
 * A WordPress translation file: directly in `wp-content/languages/` (core's), or in its `plugins/` or
 * `themes/` folder — `<domain>-<locale>.po|.mo|.l10n.php`, a script's `<domain>-<locale>-<md5>.json`.
 */
const WP_TRANSLATION_FILE = '^wp-content/languages/((plugins|themes)/)?[^/]+\\.(po|mo|json|l10n\\.php)$'

/**
 * How far the CMS clock and Git's may disagree: both run on the site's host, but Git keeps whole
 * seconds.
 */
const FOLD_SLACK = "interval '5 seconds'"
/**
 * How long ONE upgrade run of WordPress goes on writing around the row it logs: the row is written
 * at `upgrader_process_complete`, after the item's own files — so a seal taken while the upgrade ran
 * holds files of a row logged after it — and the translations the run brings come after the row
 * (measured 04/10 on scv2, reg97wp02: a WP-Cron core update logged at 20:43:23, then language packs
 * for 40 locales written until 20:45:05, sealed in nine looks). An upload's row comes first too: its
 * sizes are made after `add_attachment`.
 */
const FOLD_RUN = "interval '5 minutes'"

/**
 * Whether the CMS row `c` WROTE the path `p` sealed by the seal `o` (SQL expressions) — by what the
 * row names, and only near the seal's window (after its parent commit, by the seal), never by a time
 * alone (plan V2 §2.1 rule 4):
 *   - a WordPress plugin `<dir>/<file>.php` installed, updated or removed: `wp-content/plugins/<dir>/…`
 *     (a single-file plugin: that one file); a theme `<slug>`: `wp-content/themes/<slug>/…`; core:
 *     `wp-admin/…`, `wp-includes/…` and core's loose root files ({@link WP_CORE_ROOT_FILES},
 *     `wp-*.php` but `wp-config.php`) — logged when the upgrade completes, so up to {@link FOLD_RUN}
 *     after the seal;
 *   - any translation file ({@link WP_TRANSLATION_FILE}) for any of those rows logged up to
 *     {@link FOLD_RUN} before the window opened: after every upgrade WordPress installs every pending
 *     translation in the same run (`Language_Pack_Upgrader::async_upgrade` on
 *     `upgrader_process_complete`), core's, plugins' and themes' alike — and logs none of them;
 *   - an upload: exactly the files the collector read off the attachment (`site_cms_change.files`),
 *     logged up to {@link FOLD_RUN} before the window opened (its sizes come after the row).
 * Joomla and EmDash rows explain no path: Joomla's log names extensions, not folders, and EmDash
 * keeps no file history.
 * @param {string} c
 * @param {string} p
 * @param {string} o
 */
export function cmsExplainsPathSql(c, p, o) {
  const software = `${c}.op in (${sqlList(SOFTWARE_OPS)})`
  const dir = `split_part(${c}.resource_id, '/', 1)`
  const window = (lead, lag) =>
    `(${c}.occurred_at > ${o}.parent_at - ${lead} and ${c}.occurred_at <= ${o}.at + ${lag})`
  const own = window(FOLD_SLACK, FOLD_RUN)
  return `(${c}.source = 'wordpress-tracy-log' and (
            (${c}.resource_type = 'plugin' and ${software} and ${own} and coalesce(${c}.resource_id, '') <> ''
             and (case when position('/' in ${c}.resource_id) > 0
                       then ${dir} <> '' and starts_with(${p}, 'wp-content/plugins/' || ${dir} || '/')
                       else ${p} = 'wp-content/plugins/' || ${c}.resource_id end))
         or (${c}.resource_type = 'theme' and ${software} and ${own} and coalesce(${c}.resource_id, '') <> ''
             and position('/' in ${c}.resource_id) = 0
             and starts_with(${p}, 'wp-content/themes/' || ${c}.resource_id || '/'))
         or (${c}.resource_type = 'core' and ${software} and ${own}
             and (starts_with(${p}, 'wp-admin/') or starts_with(${p}, 'wp-includes/')
                  or ${p} in (${sqlList(WP_CORE_ROOT_FILES)})
                  or (${p} ~ '^wp-[^/]*\\.php$' and ${p} <> 'wp-config.php')))
         or (${c}.resource_type in ('plugin', 'theme', 'core') and ${software} and ${window(FOLD_RUN, FOLD_RUN)}
             and ${p} ~ '${WP_TRANSLATION_FILE}')
         or (${c}.resource_type = 'attachment' and ${c}.op = 'upload' and ${c}.files is not null
             and ${window(FOLD_RUN, FOLD_SLACK)} and ${p} = any(${c}.files))))`
}

/**
 * How long after the seal a design system write may be recorded and still explain its files: the
 * door records the `site_write` row when it hears the job's answer (polled every 0.7 s, at most
 * `DOOR_WAIT_MS.apply` = 130 s after the press), so a look that sealed the files in between comes a
 * little BEFORE the row that wrote them.
 */
const DS_FOLD_LAG = "interval '3 minutes'"

/**
 * Whether the design system write `w` WROTE the path `p` sealed by the seal `o` (SQL expressions):
 * the path is one the write's own job named (`target.files`, the webroot-relative files the
 * `site-ds-slot` job wrote — on WordPress the variation `uploads/tracy/styles/<slug>.json` and the
 * catalogue `uploads/tracy/inspirations.json`; EmDash's `data/ds-slot.css` and Joomla's module row
 * are not under the webroot's history), the write landed, and it was recorded inside the seal's
 * window (after its parent commit, by the seal + {@link DS_FOLD_LAG}). By the path the job named,
 * never by a time alone.
 * @param {string} w
 * @param {string} p
 * @param {string} o
 */
export function dsWriteExplainsPathSql(w, p, o) {
  return `(${w}.site_key = ${o}.site_key and ${w}.via = 'ds-slot' and ${w}.outcome = 'ok'
           and ${w}.at > ${o}.parent_at - ${FOLD_SLACK} and ${w}.at <= ${o}.at + ${DS_FOLD_LAG}
           and jsonb_typeof(${w}.target->'files') = 'array' and ${w}.target->'files' ? ${p})`
}

/** A sourced CMS row `c` (`cms-admin` or `automatic`, never `unknown`) of the seal `o`'s site. */
const foldCandidate = (o, c, producers) => `${c}.site_key = ${o}.site_key
                     and ${c}.occurred_at > ${o}.parent_at - ${FOLD_RUN}
                     and ${c}.occurred_at <= ${o}.at + ${FOLD_RUN}
                     and (${cmsSourceSql(c, producers)}) <> 'unknown'`

/**
 * Dev e2e 04/10/2026 (E5.1c): AN OUTSIDE SEAL WHOSE EVERY FILE A SOURCED CMS ROW WROTE IS THAT ROW'S
 * CHANGE, NOT A SECOND ONE. A WordPress plugin auto-update was an Automatic row AND "Files changed;
 * source unknown · 35 files"; an upload in wp-admin a CMS admin row AND "… · 5 files". One change,
 * two rows, and the second one Unknown although its Source is proven.
 *
 * A seal (`site_outside`, cause `seal`) is folded — left out of every V2 read, page, count and badge,
 * as `notTracyOwnCmsDelete` leaves out a CMS row — when:
 *   - it says which files it holds (`paths`) and when its window opened (`parent_at`): a seal recorded
 *     before 062, or from a host that did not say, is never folded;
 *   - EVERY path is one a CMS row WROTE ({@link cmsExplainsPathSql}: by the plugin, theme, core or
 *     upload the row names, near the seal's window), and that row has a Source of its own
 *     (`cms-admin` or `automatic`, never `unknown`). One file nobody explains keeps the whole seal
 *     Unknown — it may be somebody's own edit.
 * The files then ride on the CMS rows ({@link FOLDED_SEALS_SQL}): each counts the files it wrote and
 * names the seal's commit, so nothing recorded is lost.
 *
 * Walkthrough 11/10/2026 (`tasks/evidence/ds-walkthrough-2026-10-11`, bug 3): a WordPress design
 * system apply was its Design system row AND "Files changed; source unknown · 2 files" — the two files
 * its own job wrote under `uploads/tracy/`. A path is explained by such a write too
 * ({@link dsWriteExplainsPathSql}), and those files ride on the write's row
 * ({@link FOLDED_SEALS_OF_WRITES_SQL}): one press, one row. The two never name the same file — a design
 * system write names only `uploads/tracy/` files, which no CMS row explains.
 * A SQL predicate on the `site_outside` row aliased `o`; true for a row to keep.
 * @param {string} o
 * @param {string} producers the parameter holding {@link WP_CRON_PRODUCERS}, e.g. `$4`
 */
export function notFoldedSeal(o, producers) {
  return `not (${o}.cause = 'seal' and ${o}.paths is not null and cardinality(${o}.paths) > 0
               and ${o}.parent_at is not null
               and not exists (select 1 from unnest(${o}.paths) as fp(path)
                                where not exists (select 1 from site_cms_change fc
                                                   where ${foldCandidate(o, 'fc', producers)}
                                                     and ${cmsExplainsPathSql('fc', 'fp.path', o)})
                                  and not exists (select 1 from site_write fw
                                                   where ${dsWriteExplainsPathSql('fw', 'fp.path', o)})))`
}

/**
 * The files of the folded seals of a site, by the CMS row that wrote each: for every path, the
 * LATEST sourced row that explains it — so a seal that holds an upload and the translations of an
 * update is counted on both rows, each its own files, and no file twice. Parameters: $1 site key ·
 * $2 {@link WP_CRON_PRODUCERS} · $3 the row ids wanted (`<source>:<cursor_key>`).
 * Answers `(row_key, files, sha)`: `sha` the newest seal the row's files are in.
 */
export const FOLDED_SEALS_SQL = `
  select x.row_key, count(*)::int as files, (array_agg(x.sha order by x.at desc, x.sha))[1] as sha
    from (select o.sha, o.at,
                 (select fc.source || ':' || fc.cursor_key
                    from site_cms_change fc
                   where ${foldCandidate('o', 'fc', '$2')}
                     and ${cmsExplainsPathSql('fc', 'fp.path', 'o')}
                   order by fc.occurred_at desc, fc.id desc
                   limit 1) as row_key
            from site_outside o
            cross join unnest(o.paths) as fp(path)
           where o.site_key = $1 and not (${notFoldedSeal('o', '$2')})) x
   where x.row_key = any($3::text[])
   group by x.row_key`

/**
 * The V2 `writes` row a `site_write` (alias `w`) belongs to — ONE expression for every query that
 * groups writes, so a page, its counts and its hydration can never disagree on a row's id:
 *   - a chat turn's writes: `turn:<turn>`;
 *   - one Tracy setup run's writes (sweep #4): `setup:<run>` — one row per brief, not one per write;
 *   - a revert a seat key asked for (`/v1 …/applies/:id/revert`, sweep #2): `write:<id>`, its own row,
 *     never folded into the key's writes it takes back;
 *   - a session's writes: `session:<session>`; anything else: `write:<id>`.
 * @param {string} w the `site_write` alias
 */
export const writeGroupSql = (w) =>
  `coalesce('turn:' || ${w}.turn_id,
            case when ${w}.origin = 'setup' and ${w}.origin_ref is not null then 'setup:' || ${w}.origin_ref end,
            case when ${w}.origin = 'api' and ${w}.action = 'apply.revert' then 'write:' || ${w}.id::text end,
            'session:' || ${w}.session_id, 'write:' || ${w}.id::text)`

/**
 * The files of the folded seals of a site that a design system write wrote, by the write group they
 * ride on (the V2 `writes` row id) — the {@link FOLDED_SEALS_SQL} of {@link dsWriteExplainsPathSql}:
 * each path counted on the LATEST write that names it. Parameters: $1 site key · $2
 * {@link WP_CRON_PRODUCERS} · $3 the write group ids wanted. Answers `(row_key, files, sha)`.
 */
export const FOLDED_SEALS_OF_WRITES_SQL = `
  select x.row_key, count(*)::int as files, (array_agg(x.sha order by x.at desc, x.sha))[1] as sha
    from (select o.sha, o.at,
                 (select ${writeGroupSql('fw')}
                    from site_write fw
                   where ${dsWriteExplainsPathSql('fw', 'fp.path', 'o')}
                   order by fw.at desc, fw.id desc
                   limit 1) as row_key
            from site_outside o
            cross join unnest(o.paths) as fp(path)
           where o.site_key = $1 and not (${notFoldedSeal('o', '$2')})) x
   where x.row_key = any($3::text[])
   group by x.row_key`

/**
 * The SQL that says whether a row of {@link V2_SOURCES_SQL} (alias `s`) is on the badge: a source
 * counted whole, or an `automatic` software row (its `unit` is set). The parameter is
 * {@link BADGE_SOURCES} as `text[]`.
 * @param {string} param e.g. `$5`
 */
export const badgeRowSql = (param) =>
  `(s.source = any(${param}::text[]) or (s.source = 'automatic' and s.unit is not null))`

/**
 * The V2 rows Postgres holds, as `(kind, rank, id, at, source, recorded_at, actors, unit)`. Parameters:
 *   $1 site key · $2 cache-only turn ids · $3 cache-only shas (Q4, as V1) ·
 *   $4 {@link WP_CRON_PRODUCERS}.
 * The row sets are V1's (a turn that changed something, writes with no turn record, outside seals
 * not hidden as cache, every CMS log row) plus every SUCCEEDED operation. Pending, unknown, failed
 * and no-op operations are not change events (contract D3).
 *
 * `at` is when the change happened (what the list sorts and pages by); `recorded_at` is when TRACY
 * WROTE the row — a turn's close, a write group's last write, a seal's `recorded_at` (058), a CMS
 * row's `pulled_at`, an operation's finish. The badge compares its watermark with `recorded_at`,
 * never `at`: a row pulled or sealed after the person looked would otherwise be swallowed (plan
 * §0, measured 04/10). `actors` are the Tracy seats the row is the work of (a turn's typer, a write
 * group's writers, an operation's presser; empty for a CMS row and a seal), so the badge can leave a
 * person's own work out. `unit` is the badge's grouping key of a software CMS row
 * ({@link softwareUnitOf}); null on every other row.
 */
export const V2_SOURCES_SQL = `
  select 'turn'::text as kind, ${V2_RANK.turn} as rank, t.turn_id as id, t.opened_at as at,
         case when t.source <> 'comment' then 'chat'
              when exists (select 1 from site_request r
                            where r.site_key = t.site_key and r.session_id = t.session_id
                              and (case when t.comment_ns is null then r.text = t.title
                                        else r.n = any(t.comment_ns) end)) then 'comment'
              else 'unknown' end as source,
         coalesce(t.closed_at, t.opened_at) as recorded_at,
         array[t.actor] as actors,
         null::text as unit
    from site_turn t
   where t.site_key = $1
     and (t.state in ('closed', 'stale') or (t.state = 'open' and t.opened_at < now() - interval '30 minutes'))
     and ((t.files > 0 and not t.turn_id = any($2::text[])) or exists (select 1 from site_write w
                                  where w.site_key = t.site_key and w.turn_id = t.turn_id and w.outcome <> 'refused'))
  union all
  select 'writes', ${V2_RANK.writes}, g.id, min(g.at),
         case when bool_and(g.press) then 'design-system'
              when bool_and(g.setup) then 'setup'
              when bool_and(g.api) then 'api'
              when bool_and(g.chatty) then 'chat' else 'unknown' end,
         max(g.at),
         array_remove(array_agg(distinct g.actor), null),
         null::text
    from (select ${writeGroupSql('w')} as id, w.at,
                 w.actor,
                 (w.actor is not null and (w.turn_id is not null
                   or (w.session_id is not null and w.session_id not like 'key:%'))) as chatty,
                 -- The Design system button's own press, as its door recorded it (classifyWrites).
                 (w.actor is not null and w.via = 'ds-slot'
                   and coalesce(w.target->>'channel', '') = 'button') as press,
                 -- Tracy setting the site up from the person's brief, as the door recorded it (classifyWrites).
                 (w.actor is not null and w.origin = 'setup' and w.origin_ref is not null) as setup,
                 -- A seat key's write through \`/v1\`, as the door recorded it (classifyWrites).
                 (w.actor is not null and w.origin = 'api' and w.origin_ref is not null) as api
            from site_write w
           where w.site_key = $1 and w.outcome <> 'refused'
             and (w.turn_id is null or not exists (select 1 from site_turn t where t.turn_id = w.turn_id))) g
   group by g.id
  union all
  select 'outside-files', ${V2_RANK['outside-files']}, o.sha, o.at,
         case when o.cause = 'deploy' and o.deploy_tag ~ '${DEPLOY_TAG_SQL}' then 'deployment'
              when ${coworkUpdateSealSql('o')} then 'deployment'
              when o.cause = 'housekeeping' then 'automatic'
              else 'unknown' end,
         o.recorded_at,
         '{}'::text[],
         null::text
    from site_outside o
   where o.site_key = $1 and (o.cause = 'housekeeping' or not o.sha = any($3::text[]))
     and ${notFoldedSeal('o', '$4')}
  union all
  select 'cms-change', ${V2_RANK['cms-change']}, c.source || ':' || c.cursor_key, c.occurred_at,
         ${cmsSourceSql('c', '$4')},
         c.pulled_at,
         '{}'::text[],
         ${SOFTWARE_UNIT_SQL}
    from site_cms_change c
   where c.site_key = $1 and ${notTracyOwnCmsDelete('c')}
  union all
  select 'operation', ${V2_RANK.operation}, op.id::text, op.created_at, 'site-changes',
         coalesce(op.finished_at, op.created_at),
         array_remove(array[op.actor_email], null),
         null::text
    from site_operation op
   where op.site_key = $1 and op.status = 'succeeded'
     -- A file verb is an event only with the commit it made; "restore everything" (ADR 0024) moved
     -- the database too, so it is one even when the files were already the backup's.
     and (op.resulting_sha is not null or op.action = 'restore-everything'
          -- Sync to live and its undo (live-push.js) wrote the LIVE site, not the copy: no commit.
          or op.action in ('sync-to-live', 'sync-to-live-undo'))`

/** The fixed tail of {@link V2_SOURCES_SQL}'s parameters, after the site and the Q4 cache lists. */
export const V2_SOURCE_PARAMS = () => [[...WP_CRON_PRODUCERS]]

// ── The JS half ─────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'confirmed'|'unknown'|'conflicting'} Evidence
 * @typedef {{source: string, evidence: Evidence, service?: string, basis?: string}} Origin
 */

/**
 * A chat turn's Source. `hasRef`: its comment request is on record (the SQL `exists`).
 * @param {{source: string}} turn
 * @param {boolean} hasRef
 * @returns {Origin}
 */
export function classifyTurn(turn, hasRef) {
  if (turn.source !== 'comment') return { source: 'chat', evidence: 'confirmed' }
  if (hasRef) return { source: 'comment', evidence: 'confirmed' }
  // The host read a comment block in the prompt, but no comment request matches it.
  return { source: 'unknown', evidence: 'conflicting' }
}

/**
 * A group of writes with no turn record. `design-system` when every write is the Design system
 * button's press as its door recorded it (a `ds-slot` write by a seat, `target.channel = 'button'`).
 * `setup` / `api` when every write carries that provenance as the Apply door recorded it
 * (`origin`, with its run or key in `origin_ref`) and the person it was for.
 * Chat only when every write names a chat turn or a chat session and an authenticated actor; an API
 * key's writes (`key:<id>` session) are not chat.
 * @param {{actor: string|null, turn_id: string|null, session_id: string|null, via?: string|null,
 *   target?: any, origin?: string|null, origin_ref?: string|null}[]} writes
 * @returns {Origin}
 */
export function classifyWrites(writes) {
  const all = (fn) => writes.length > 0 && writes.every(fn)
  const press = (w) => Boolean(w.actor) && w.via === 'ds-slot' && w.target?.channel === 'button'
  if (all(press)) return { source: 'design-system', evidence: 'confirmed' }
  const recorded = (origin) => (w) => Boolean(w.actor) && w.origin === origin && w.origin_ref != null
  if (all(recorded('setup'))) return { source: 'setup', evidence: 'confirmed' }
  if (all(recorded('api'))) return { source: 'api', evidence: 'confirmed' }
  const chatty = (w) =>
    Boolean(w.actor) &&
    (w.turn_id != null || (w.session_id != null && !String(w.session_id).startsWith('key:')))
  return writes.length > 0 && writes.every(chatty)
    ? { source: 'chat', evidence: 'confirmed' }
    : { source: 'unknown', evidence: 'unknown' }
}

/**
 * A `site_outside` row.
 * @param {{cause: string, deploy_tag: string|null, paths?: string[]|null}} o
 * @returns {Origin}
 */
export function classifyOutside(o) {
  if (o.cause === 'deploy' && typeof o.deploy_tag === 'string' && DEPLOY_TAG_SHAPE.test(o.deploy_tag))
    return { source: 'deployment', evidence: 'confirmed', service: 'tracy-deploy' }
  // Tracy's Cowork package updating itself, read off the files the seal holds.
  if (isCoworkUpdateSeal(o)) return { source: 'deployment', evidence: 'confirmed', service: 'tracy-deploy' }
  if (o.cause === 'housekeeping')
    return { source: 'automatic', evidence: 'confirmed', service: 'tracy-housekeeping' }
  return { source: 'unknown', evidence: 'unknown' }
}

/**
 * A `site_cms_change` row.
 * @param {{source: string, cms_actor: any, change_type?: string|null, producer?: any}} c
 * @returns {Origin}
 */
export function classifyCmsChange(c) {
  const anonymous = c.cms_actor === null || c.cms_actor === undefined
  if (anonymous && c.source === 'wordpress-tracy-log') {
    const p = c.producer
    if (p === null || p === undefined)
      return { source: 'automatic', evidence: 'confirmed', service: 'wordpress-cron', basis: 'hook-history' }
    if (p.context === 'cron' && WP_CRON_PRODUCERS.includes(p.version))
      return { source: 'automatic', evidence: 'confirmed', service: 'wordpress-cron', basis: 'producer' }
    // A producer that does not vouch for the cron gate: keep the row, claim nothing.
    return { source: 'unknown', evidence: 'conflicting' }
  }
  if (anonymous && c.source === 'emdash-audit-log' && c.change_type === EMDASH_SCHEDULED_PUBLISH)
    return { source: 'automatic', evidence: 'confirmed', service: 'emdash-scheduler' }
  // 02/10: authenticated CMS identity suffices; channel is not recorded and not required.
  if (hasCmsIdentity(c.cms_actor)) return { source: 'cms-admin', evidence: 'confirmed' }
  // No account at all (EmDash deletes and uploads), or one with no id: nothing is claimed.
  return { source: 'unknown', evidence: 'unknown' }
}

/** A succeeded `site_operation` row. @returns {Origin} */
export function classifyOperation() {
  return { source: 'site-changes', evidence: 'confirmed' }
}

/**
 * The restore a Git commit proves under contract D2, or null. Needs the ORIGINAL subject and the
 * author email from the host (`subject`, `author` on a history row); a host that sends only the
 * `title_of` title proves nothing — "agent: restore: undo abc1234" reads as that title too.
 * @param {{subject?: unknown, author?: unknown}} row
 * @returns {{mode: 'undo'|'reset', target: string} | null}
 */
export function restoreOf(row) {
  if (typeof row.subject !== 'string' || row.author !== RESTORE_AUTHOR) return null
  const undo = RESTORE_UNDO_SUBJECT.exec(row.subject)
  if (undo?.[1]) return { mode: 'undo', target: undo[1] }
  const reset = RESTORE_RESET_SUBJECT.exec(row.subject)
  if (reset?.[1]) return { mode: 'reset', target: reset[1] }
  return null
}

/** `deploy <tag> updated <file>`: the deploy script's subject, after the reader stripped its prefix. */
const DEPLOY_TITLE = /^deploy (\S+) updated (.+)$/

/**
 * A Git moment no Postgres row accounts for (`webroot-history` row).
 * @param {{by?: any, kind?: string, title?: unknown, subject?: unknown, author?: unknown}} row
 * @returns {Origin & {cause?: 'deploy'|'housekeeping'|'seal', deployTag?: string, deployFile?: string,
 *   restore?: {mode: 'undo'|'reset', target: string}}}
 */
export function classifyGitRow(row) {
  const title = String(row.title ?? '')
  if (row.by?.kind === 'outside' || row.kind === 'outside') {
    // outside@ commits are written only by `webroot-git.sh`; the reader filters by author first.
    const deploy = DEPLOY_TITLE.exec(title)
    if (deploy?.[1] && DEPLOY_TAG_SHAPE.test(deploy[1]))
      return {
        source: 'deployment',
        evidence: 'confirmed',
        service: 'tracy-deploy',
        cause: 'deploy',
        deployTag: deploy[1],
        deployFile: deploy[2]
      }
    if (title === HOUSEKEEPING_TITLE)
      return {
        source: 'automatic',
        evidence: 'confirmed',
        service: 'tracy-housekeeping',
        cause: 'housekeeping'
      }
    return { source: 'unknown', evidence: 'unknown', cause: 'seal' }
  }
  const restore = restoreOf(row)
  if (restore) return { source: 'site-changes', evidence: 'confirmed', restore }
  return { source: 'unknown', evidence: 'unknown' }
}
