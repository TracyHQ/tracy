/**
 * The doors behind Site changes — `cowork-web`'s `/api/sites/:key/changes`, `/backups`,
 * `POST /backup`, `/activity?version=2` and `POST /restore` — and the shapes they answer with.
 *
 * The shapes of `/changes` and `/backups` are the fleet script's own (`webroot-git.sh` `changes` /
 * `history`), passed through by tracy-web, which adds what each backup holds (`database`);
 * `packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs` asserts them against the real
 * script, so a field renamed there fails a test before it fails a screen.
 *
 * Every row names who did it. `Actor` is the one vocabulary for that:
 *   agent    the machine, after an agent turn
 *   outside  the site itself — edits made in its admin, over FTP, by an extension update
 *   person   a seat holder, by name: the one who pressed Create a backup
 *
 * A person carries their `face` as tracy-web decides it (`personFace`, keyed by account): the same
 * letter, colour and photo the Team tab shows for them. Null or absent (a person the server could
 * not match to an account, an older server) → the letter on a neutral grey.
 */

/** A person's face as tracy-web sends it (`personFace`). */
export interface ActorFaceShape {
  initial: string
  color: string
  avatarUrl: string | null
}

export type Actor =
  | { kind: 'agent' }
  | { kind: 'outside' }
  | { kind: 'person'; name: string; email: string; face?: ActorFaceShape | null }

export interface Moment {
  sha: string
  /** Unix seconds. */
  at: number
  by: Actor
  kind: 'moment' | 'outside'
  title: string
  /** How many files the moment touched. */
  files: number
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  /** `null` for a binary: there are no lines to count. */
  additions: number | null
  deletions: number | null
  /** `design` · `addons` · `content` · `core` · `system` — the ADR 0070 zones. */
  zone: string
  /** Who touched it last; a file no moment names is still on the worktree, i.e. outside Tracy. */
  by: Actor
}

/** One file a single moment touched — the fleet's `webroot-git.sh --op commit` row. */
export interface MomentFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  /** `null` for a binary: there are no lines to count. */
  additions: number | null
  deletions: number | null
  /** The ADR 0070 zone, when the host's answer carries one. */
  zone?: string
  /**
   * The exclude list names this path today (a CMS cache, a Tracy working file) but the moment is
   * older than that line: the tab folds such files into one count (Q4). Absent from older hosts.
   */
  excluded?: boolean
}

export interface Changes {
  /** The backup everything here is measured against; `version` is null only before v1 exists. */
  since: { version: number | null; sha: string } | null
  moments: Moment[]
  files: ChangedFile[]
}

/**
 * What a backup point holds besides its files (ADR 0024 sub-decision 1), as the server proved it:
 *   `full`          the database dump is on the host and matches the point's hash → "Restore
 *                   everything" may be offered (`engine` `sqlite` = an EmDash content backup);
 *   `missing`       the point names a dump that is gone or does not match (`reason`: `missing`,
 *                   `mismatch`, `removed` after retention) → a file backup only, say why;
 *   `none`          a point made before backups held a database → a file backup;
 *   `unknown-host`  the site's host predates backups and cannot tell → treat as `none`.
 * No dump byte ever reaches a client: only engine, size (bytes) and hash.
 */
export interface BackupDatabase {
  state: 'full' | 'missing' | 'none' | 'unknown-host'
  engine: 'mariadb' | 'mysql' | 'sqlite' | null
  sha256: string | null
  size: number | null
  reason?: 'missing' | 'mismatch' | 'removed'
}

/** One backup point of `/backups`: the tag `tracy-release/v<version>` on the site's webroot history. */
export interface BackupRecord {
  kind: 'backup'
  version: number
  sha: string
  title: string
  notes: string | null
  at: number | null
  by: Actor
  /** Files changed since the previous backup. */
  files: number
  /** What the point holds besides files. */
  database?: BackupDatabase
  /** EmDash app snapshot availability; absent on non-EmDash points and older hosts. */
  applicationAvailable?: boolean
  /** `pre-restore`: the backup the host made by itself just before a "Restore everything". */
  auto?: 'pre-restore'
}

/** `/backups` answers the backup points and the moments between them, newest first. */
export type BackupsRow = BackupRecord | Moment

export interface Backups {
  latest: { version: number; sha: string } | null
  /** Newest first; a backup row sits above the moment its tag points at. */
  rows: BackupsRow[]
  /**
   * What THIS seat may put back, by the toolsets `/restore` refuses with (files: `code`, everything:
   * `site`). Absent: every verb is offered and the door decides.
   */
  may?: BackupMay
}

/** The restore verbs a seat may press on a site's backups, and whether it may download one. */
export interface BackupMay {
  restoreFiles: boolean
  restoreEverything: boolean
  /** Download a backup (the `lifecycle` toolset: an Owner). Absent from an older server: not offered. */
  export?: boolean
}

/** What `POST /backup` answers: the point just made, and what it holds. */
export interface BackupMade {
  version: number
  title: string
  sha: string | null
  database?: BackupDatabase
}

/**
 * A refusal with the door's code on it, so a screen can say which one it was. `files` is the list a
 * refused undo names (409 `CONFLICT`: the files that changed since the moment); empty otherwise.
 */
export class SiteApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly files: readonly string[] = []
  ) {
    super(code)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { accept: 'application/json', ...init.headers }
  })
  if (!res.ok) {
    let code = 'FAILED'
    let files: string[] = []
    try {
      const body = (await res.json()) as { code?: string; files?: unknown }
      code = body.code ?? code
      if (Array.isArray(body.files)) files = body.files.map(String)
    } catch {
      /* the status is the answer */
    }
    throw new SiteApiError(res.status, code, files)
  }
  // 202: the host is still at it — a first read builds the site's repo, and on a big webroot that
  // outlives the door's wait. The views ask again; nobody sees "could not reach the site".
  if (res.status === 202) throw new SiteApiError(202, 'FLEET_JOB_PENDING')
  return (await res.json()) as T
}

export const readChanges = (siteKey: string): Promise<Changes> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/changes`)

/**
 * The files one moment touched, read when its row opens: the list is per moment, so reading it
 * for every row up front would be one host job per moment for rows nobody opens.
 */
export const readMomentFiles = (
  siteKey: string,
  sha: string
): Promise<{ sha: string; files: MomentFile[]; truncated?: boolean }> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/moments/${encodeURIComponent(sha)}/files`)

export const readBackups = (siteKey: string): Promise<Backups> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/backups`)

export const createBackup = (siteKey: string, body: { title: string; notes: string }): Promise<BackupMade> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/backup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

/** Where a backup download stands (`GET /backups/:version/export/:exportId`). */
export type BackupExportState = 'queued' | 'packing' | 'uploading' | 'ready' | 'failed' | 'expired'

export interface BackupExport {
  exportId: string
  version: number
  state: BackupExportState
  bytes: number | null
  sha256: string | null
  /** When the package is deleted, ISO; null until it is ready. */
  expiresAt: string | null
  /** The host's or the store's reason code, on `failed`. */
  error?: string
  /** A five-minute download link, returned only by the code-gated download door. */
  url?: string
}

/**
 * Ask for backup `version` packed as a zip (Owner only). The door answers 202 at once — that is the
 * success here, not "still pending" as `call` reads it — and the package is made in the background.
 */
export async function requestBackupExport(
  siteKey: string,
  version: number
): Promise<{ exportId: string; state: BackupExportState }> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/backups/${version}/export`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  let body: { exportId?: string; state?: BackupExportState; code?: string } = {}
  try {
    body = await res.json()
  } catch {
    /* the status is the answer */
  }
  if (res.status !== 202 || typeof body.exportId !== 'string')
    throw new SiteApiError(res.status, body.code ?? 'FAILED')
  return { exportId: body.exportId, state: body.state ?? 'queued' }
}

/** One backup download now; while `ready`, with a fresh link. */
export const readBackupExport = (siteKey: string, version: number, exportId: string): Promise<BackupExport> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/backups/${version}/export/${encodeURIComponent(exportId)}`)

export async function requestBackupDownloadCode(
  siteKey: string,
  version: number,
  exportId: string
): Promise<{ challengeId: string; expiresAt: string }> {
  const path = `/api/sites/${encodeURIComponent(siteKey)}/backups/${version}/export/${encodeURIComponent(exportId)}/code`
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  const body = (await res.json().catch(() => ({}))) as {
    challengeId?: string
    expiresAt?: string
    code?: string
  }
  if (!res.ok || typeof body.challengeId !== 'string')
    throw new SiteApiError(res.status, body.code ?? 'FAILED')
  return { challengeId: body.challengeId, expiresAt: body.expiresAt ?? '' }
}

export async function downloadBackupWithCode(
  siteKey: string,
  version: number,
  exportId: string,
  challengeId: string,
  code: string
): Promise<{ url: string }> {
  return call(
    `/api/sites/${encodeURIComponent(siteKey)}/backups/${version}/export/${encodeURIComponent(exportId)}/download`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code })
    }
  )
}

/**
 * One file's unified diff against the baseline, uncommitted work included. Text, not rows: the
 * side card's own `DiffView` parses a unified diff, so this is handed over as it comes off git.
 * A configuration file (`wp-config.php`, `configuration.php`, `.env`, …) answers `blocked` instead:
 * the door names it but never reads it out.
 */
export type FileDiff =
  | { path: string; diff: string; truncated: boolean; blocked?: false }
  | { path: string; blocked: true; reason: string }

/**
 * `sha` asks for the file's diff IN that one moment (`SHA^ → SHA`), what a Site changes row opens;
 * without it, the file against the latest backup.
 */
export const readFileDiff = (siteKey: string, path: string, sha?: string): Promise<FileDiff> =>
  call(
    `/api/sites/${encodeURIComponent(siteKey)}/file-diff?path=${encodeURIComponent(path)}${
      sha ? `&sha=${encodeURIComponent(sha)}` : ''
    }`
  )

/** Zone order of a moment's files: what a person edits most is first, what they should not is last. */
export const ZONE_ORDER = ['design', 'function', 'addons', 'content', 'core', 'system'] as const

// ── What the list can and cannot see on a site (`coverage` of the `/activity` answer) ──────────

export interface ActivityCoverage {
  /** Whether the site's Git moments could be read for this page. */
  git: 'read' | 'failed'
  /** The Git history stopped at its cap: older moments exist but are not listed. */
  gitTruncated: boolean | null
  /** When this site's first chat turn was recorded; moments before it carry no typed words. */
  since: string | null
  /** False where the site keeps no file history (EmDash); absent from an older tracy-web. */
  fileHistory?: boolean
  cmsLog: {
    source: string
    /** What this CMS's own log does not record (`menus`, `settings`, `media`); absent from an older tracy-web. */
    limits?: string[]
    /** `null` until a read has answered. */
    enabled: boolean | null
    reason: string | null
    lastPulledAt: string | null
    lastError: string | null
  } | null
}

// ── Site changes V2 (`GET /api/sites/:key/activity?version=2`) ─────────────────────────────────
//
// Shapes of `apps/tracy-web/src/sites/activity-v2.js`, asserted there by
// `test/site-activity-v2.test.mjs`; contract `tasks/evidence/site-changes-v2/contract.md` §3.
// tracy-web and this client ship in one release, so the list always asks `version=2`.

/**
 * Where a change came from — the path, not the person (plan §2.1). `cms-admin`: a change the CMS's
 * own log records under a signed-in CMS account — its admin screen or its API alike (Brian 02/10:
 * authenticated CMS identity suffices; the channel is not recorded and not required). A CMS row
 * with no account is `unknown`; a WordPress row with no user under the hook's cron contract is
 * `automatic`. `design-system`: a press of the site browser's Design system button (apply or undo),
 * made by the person themselves — the chat route's apply stays `chat`. `setup`: Tracy writing the
 * site's words and pictures from the brief its person sent in the Add site popup ("Tracy setup").
 * `api`: a write made with one of the person's API keys through `/v1`.
 */
export type ActivitySource =
  | 'chat'
  | 'comment'
  | 'design-system'
  | 'setup'
  | 'api'
  | 'cms-admin'
  | 'automatic'
  | 'deployment'
  | 'site-changes'
  | 'unknown'

/**
 * `people`: every Source but `automatic` — the changes people made, themselves or through Tracy;
 * the tab's default view. `all`: every Source. Both are read under the server's own filter, so a
 * page holds `limit` rows of what is shown and its cursor walks only those.
 */
export type ActivityFilterV2 = 'all' | 'people' | ActivitySource

/**
 * Which record a V2 row was read from. Not a Source: a `turn` can be `chat`, `comment` or `unknown`.
 * `outside-files` is a commit made outside a chat (seal, deploy, housekeeping), whether Postgres
 * already holds it or only Git does — its `kind:id` stays the same when it is recorded. `git` is
 * any other commit no record accounts for.
 */
export type ActivityKindV2 = 'turn' | 'writes' | 'outside-files' | 'cms-change' | 'operation' | 'git'

/** How well the record proves its Source: `conflicting` = the records disagree, so it reads Unknown. */
export type ActivityEvidence = 'confirmed' | 'unknown' | 'conflicting'

export interface ActivityOrigin {
  source: ActivitySource
  evidence: ActivityEvidence
  /** The CMS of a CMS log row. */
  cms?: 'wordpress' | 'joomla' | 'emdash'
  /** The CMS log a row came from (`joomla-action-log`, `wordpress-tracy-log`, `emdash-audit-log`). */
  log?: string
  /** The service that made it: `tracy-deploy`, `tracy-housekeeping`, `wordpress-cron`. */
  service?: string
  /** For WordPress automatic rows: `producer` (the row says so) or `hook-history` (legacy row). */
  basis?: 'producer' | 'hook-history'
}

/**
 * Who — a Tracy seat (`id: "tracy:<email>"`), a CMS account (`id: "<cms>:<user id>"`), a service
 * (`id: "service:…"`), or unknown. `role` says whether they asked for it or carried it out.
 */
export interface ActivityActorV2 {
  type: 'person' | 'system' | 'unknown'
  id?: string
  /** A name as recorded or read now through the account; absent when unknown. */
  name?: string | null
  role: 'requester' | 'executor'
  /** A Tracy seat's face (`personFace`); null or absent for anyone else, or from an older server. */
  face?: ActorFaceShape | null
}

/**
 * Description as a message key plus parameters; the client words it (plan §2.3). Keys:
 *   `resource.op`                  {op, type, id, title, owner?}  title only when the source stored one;
 *                                   `owner: 'tracy'` when the resource is one of Tracy's own components
 *                                   on the site (the Claude Cowork plugin/package, Tracy's Joomla
 *                                   sign-in plugins) — word it as "Tracy's …" / a "Tracy update"
 *   `effects.summary`              {contentResources, contentOperations, settingsResources,
 *                                   settingsOperations, files, otherOperations}
 *   `files.changed`                {files}
 *   `files.changed-source-unknown` {files}
 *   `files.look-edited`            {}  only look edits by a file tool (technical)
 *   `change.recorded`              {op?, operations?, owner?}  a content operation with no resource named
 *   `settings.recorded`            {op?, operations?, owner?}  the same for settings only ("Settings change recorded")
 *   `other.recorded`               {op?, operations?, owner?}  the same for accounts/access only (not content)
 *   `request`                      {}  nothing confirmed: show `request.text` labelled Request
 *   `deploy.updated`               {component, files, tag, owner: 'tracy'}  a Tracy deploy that updated
 *                                   one of Tracy's components; `component`: `connector` (the WordPress
 *                                   sign-in plugin, `tracy-access.php`) or `cowork` (the Cowork package
 *                                   updating itself, read off a seal of its own files; `tag` null)
 *   `deploy.files`                 {files, tag}  a Tracy deploy whose file names no known component
 *   `deployment`                   {tag, files}  the same, from a server before `deploy.*` (keep reading it)
 *   `housekeeping`                 {files}
 *   `site-changes.undo` / `.reset` {target (short sha), files (null = unknown)}; `.reset` also
 *                                   {version}: the backup it went back to, null for a plain moment
 *   `site-changes.restore-everything` {target (short sha), version (the backup's number, null if
 *                                   unknown), files (0 when only the database moved)} — ADR 0024
 *   `site-changes.sync-to-live` / `.sync-to-live-undo` {count (changes pushed / put back, null if
 *                                   unknown), conflicts (left as the live site had them)} — the Owner's
 *                                   Sync to live wrote the LIVE site, not this copy
 *   `apply.revert`                 {applyId (null if unknown)}  one revert of an earlier change by its
 *                                   apply id, on its own row (a seat key's `/v1` revert)
 */
export type ActivityDescriptionKey =
  | 'resource.op'
  | 'effects.summary'
  | 'files.changed'
  | 'files.changed-source-unknown'
  | 'files.look-edited'
  | 'change.recorded'
  | 'settings.recorded'
  | 'other.recorded'
  | 'request'
  | 'deploy.updated'
  | 'deploy.files'
  | 'deployment'
  | 'housekeeping'
  | 'site-changes.undo'
  | 'site-changes.reset'
  | 'site-changes.restore-everything'
  | 'site-changes.sync-to-live'
  | 'site-changes.sync-to-live-undo'
  | 'design-system.apply'
  | 'design-system.switch'
  | 'design-system.undo'
  | 'design-system.unsure'
  | 'apply.revert'

export interface ActivityDescription {
  key: ActivityDescriptionKey
  params: Record<string, string | number | boolean | null>
  /** True when no result is confirmed and the row stands on the request alone. */
  isRequestOnly: boolean
}

/** One resource of an event: type + id, the title its source stored (null for a Tracy write). */
export interface ActivityEffectResource {
  type: string | null
  id: string
  title: string | null
  ops: string[]
}

/** Resources by type + id; `operations` counts operations that named no id. Never summed with files. */
export interface ActivityEffectGroup {
  resources: ActivityEffectResource[]
  operations: number
}

/**
 * `recorded`: counted; `not-tracked`: the site keeps no file history (EmDash) — never "0 files";
 * `unread`: Git could not be read; `not-linked`: the record has no commit (a CMS log row).
 */
export type ActivityFilesState = 'recorded' | 'not-tracked' | 'unread' | 'not-linked'

export interface ActivityEffects {
  content: ActivityEffectGroup
  settings: ActivityEffectGroup
  /** `count` is null unless `state` is `recorded`. */
  files: { count: number | null; sha: string | null; state: ActivityFilesState }
  other: { operations: number; actions: string[] }
  coverage: { files: ActivityFilesState; content: 'recorded' | 'not-recorded' }
}

/** A write that is not a change of content: a look edit by a file tool, its revert, a read (D4). */
export interface ActivityTechnicalWrite {
  action: string
  via: string
  outcome: string
}

/**
 * The stored request: `full` / `truncated` as the turn door recorded; `unknown` for a row recorded
 * before that (show "Full original request unavailable"); `none` for a row with no request.
 */
export interface ActivityRequest {
  text?: string
  state: 'full' | 'truncated' | 'unknown' | 'none'
}

export interface ActivityReversal {
  /** `not-applicable`: the row is itself an undo/reset. */
  state: 'none' | 'undone' | 'partially-undone' | 'not-applicable'
  /** Who pressed the undo (unknown for a legacy restore commit). */
  undoneBy?: ActivityActorV2
  /** The undo event: an operation id, or the restore commit's sha. */
  link?: { kind: 'operation' | 'git'; id: string }
  /**
   * What that undo did NOT take back: `content`/`settings`/`other` (Undo reverts files only),
   * `other-moments` (the turn's other commits), `unknown-moments` (Git's window did not hold them all).
   */
  partsNotReversed?: ('content' | 'settings' | 'other' | 'other-moments' | 'unknown-moments')[]
}

export interface ActivityCapabilities {
  canDiff: boolean
  canUndoFiles: boolean
  /** Why not: `no-files`, `no-file-history`, `outside`, `restore`, `undone`, `forbidden`. */
  reasons: string[]
}

/** Filtered references to the records behind a row — ids only, never a raw record. */
export interface ActivityEvidenceRefs {
  turnId?: string
  commitSha?: string
  /** For an undo/reset: the moment or backup it targeted. */
  targetSha?: string
  operationId?: string
  jobRef?: string
  cmsRecordRef?: string
  /** A Tracy setup row: the setup run (one brief) its writes were made under. */
  setupRun?: string
}

export interface ActivityItemV2 {
  /** Stable within its kind: turn id, commit sha, operation id, `<log>:<cursor key>`, write group id. */
  id: string
  kind: ActivityKindV2
  origin: ActivityOrigin
  actor: ActivityActorV2
  executor?: ActivityActorV2
  description: ActivityDescription
  occurredAt: string | null
  detectedAt: string | null
  /** `detected`: a seal — when Tracy noticed the files; when they changed is not known. */
  timeBasis: 'occurred' | 'detected'
  /**
   * When Tracy RECORDED the event (a turn's close, a write, a CMS row's pull, a seal's insert, an
   * operation's finish) — what the start card's badge and the tab's "new since you last looked" are
   * measured against, never `occurredAt` (a CMS row is pulled minutes after it happened). Null on a
   * Git-only moment no row accounts for; absent from an older server.
   */
  recordedAt?: string | null
  /**
   * The badge counted this row for the reader (the server's `unseenOf`: a badge Source, recorded after
   * their watermark, not their own work through Tracy). The tab lights exactly these. Absent from an
   * older server.
   */
  unseen?: boolean
  /**
   * The badge's grouping unit of a software CMS row (a plugin, theme, core or Joomla extension part
   * installed, updated or removed): rows of one unit within two seconds are one thing to the badge.
   * Null on every other row; absent on an older server.
   */
  unit?: string | null
  effects: ActivityEffects
  technical?: ActivityTechnicalWrite[]
  request: ActivityRequest
  reversal: ActivityReversal
  /**
   * A `turn` the undo engine took back (`POST …/turns/undo`, `site_turn.undone_at`): when, and
   * whether all of it (files and content) went back. Null when never, and on every other kind;
   * absent from an older server. The row says "Undone" / "Partly undone" from it.
   */
  undone?: { at: string; complete: boolean } | null
  /**
   * A `writes` row of a design system put on with the Design system button: the apply, what it
   * replaced, and whether the row may undo it (`POST …/design-system/undo`: only the site's newest
   * apply, not undone yet, a seat that may write). Absent on every other row and from an older server.
   */
  designSystem?: {
    applyId: string
    name: string
    previous: { id: string; name: string | null } | null
    state: 'available' | 'not-latest' | 'undone'
    canUndo: boolean
  } | null
  capabilities: ActivityCapabilities
  evidence: ActivityEvidenceRefs
  /** `turn` only. */
  endedAt?: string | null
  state?: 'closed' | 'stale'
  flags?: { unsealedStart: boolean; concurrent: boolean; steered: boolean }
  /**
   * Tracy's answer for a `turn` event as its close kept it — the text of the turn's last assistant
   * message, without tool output or reasoning, code blocks as `[code]`, at most 2000 characters
   * (`truncated` when cut, `interrupted` when the turn was cancelled mid-answer). Null for a turn
   * recorded before answers were kept (show nothing, not "no answer") and on every other kind.
   * The agent's own account — not evidence of what changed (description and effects are).
   */
  reply: { text: string; state: 'full' | 'truncated' | 'interrupted' } | null
  /**
   * The chat a `turn` event came from (null on every other kind): the dsh session and turn number
   * of its id, the prompt's message id (null on rows recorded before it was kept), and `mine` —
   * whether the reader typed it. A dsh session opens only for its creator, so offer "Open
   * conversation" only when `mine`; opening is still checked by the session itself.
   */
  conversation: {
    sessionId: string
    turn: number
    promptMessageId: string | null
    mine: boolean
  } | null
  /** `comment` turns: the request, and its author when another person than the sender. */
  comment?: {
    n: number
    url: string
    /** The comment the request was made from (`site_comment.id`); null when the request names none. */
    id: string | null
    /** The comment was deleted since: `url` and `author` stay, as history — do not link it as live. */
    deleted: boolean
    author?: { type: 'person'; id: string; name: string }
  }
}

/**
 * Events per Source over the whole list (filter- and page-independent), `all` their sum.
 * `complete: false` → show "At least N"; `reasons`: `git-truncated`, `git-unread`,
 * `no-file-history`, `collector-gap`, `cms-log-limits`.
 */
export type ActivityCountsV2 = Record<'all' | ActivitySource, number> & {
  complete: boolean
  reasons: string[]
}

export interface ActivityV2 {
  schemaVersion: 2
  items: ActivityItemV2[]
  /** Bound to the filter it was cut under; another filter or a V1 cursor is a 400 INVALID_CURSOR. */
  nextCursor: string | null
  counts: ActivityCountsV2
  coverage: ActivityCoverage
  /** The server's clock as it read this page: what the tab marks seen (`markChangesSeen`). Absent from an older server. */
  readAt?: string
  /**
   * The caller's watermark BEFORE this read — rows recorded after it are "new since you last looked"
   * (`isUnread`); null when the caller had none yet. Absent from an older server.
   */
  seenBefore?: string | null
  /**
   * The badge's number for the reader over the whole site at `readAt` — rows recorded after
   * `seenBefore`, software islands counted once — so the list's "N new since you last looked" says
   * what the start card said. Null until the badge was first asked for them; absent on an older server.
   */
  unseenCount?: number | null
}

/**
 * The start card's badge: how many of the site's changes this person has not looked at — recorded
 * after their watermark, not made by them through Tracy, under a Source the badge counts (chat, comment,
 * cms-admin, site-changes, unknown — never automatic, deployment or housekeeping). `since`: the
 * watermark; `readAt`: the server's clock; `complete`: false while the CMS log collector is in error.
 */
export interface UnseenChanges {
  count: number
  since: string
  readAt: string
  complete: boolean
}

// ── Site changes V2: the client's doors (the shapes above are P2's; these only call them) ──────

/**
 * One page of the list with `version=2`, under a Source `filter`; a `cursor` goes back only to the
 * filter that cut it. The caller still checks the answer's shape (`isActivityV2`) before reading it.
 */
export const readActivityV2 = (
  siteKey: string,
  { cursor, filter = 'all' }: { cursor?: string | null; filter?: ActivityFilterV2 } = {}
): Promise<ActivityV2> => {
  const query = new URLSearchParams({ version: '2', filter })
  if (cursor) query.set('cursor', cursor)
  return call(`/api/sites/${encodeURIComponent(siteKey)}/activity?${query.toString()}`)
}

/** The badge's count (`UnseenChanges`): Postgres only, no Git read, cheap enough for every start screen. */
export const readUnseenChanges = (siteKey: string): Promise<UnseenChanges> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/activity/unseen`)

/**
 * The person looked at the list: move their watermark to `readAt`, the clock the page was read under
 * (never the browser's — a row recorded while the page was loading would be swallowed, plan §2.4).
 */
export const markChangesSeen = (siteKey: string, readAt: string): Promise<{ seenAt: string }> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/activity/seen`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ readAt })
  })

/**
 * What an Undo of ONE commit reverts, counted on the server from the same list the undo walks
 * (every file of the commit, past the 500 the files door lists). `complete: false`: a floor.
 */
export const readUndoScope = (
  siteKey: string,
  sha: string
): Promise<{ files: number; complete: boolean; truncatedList: boolean }> =>
  call(`/api/sites/${encodeURIComponent(siteKey)}/moments/${encodeURIComponent(sha)}/undo-scope`)

/**
 * Undo one commit, with a key naming this press: a retry with the same key answers the operation
 * already made and never runs the undo twice. Returns the raw answer — `httpStatus: null` when no
 * answer came at all, which is NOT "nothing happened" — for `undoOutcomeOf` to read.
 */
export const undoMoment = (
  siteKey: string,
  body: { sha: string; idemKey: string }
): Promise<{ httpStatus: number | null; body: unknown }> => restoreMoment(siteKey, { ...body, mode: 'undo' })

/** `POST /restore` in either verb, raw, with a key naming the press (see `undoMoment`). */
export async function restoreMoment(
  siteKey: string,
  body: { sha: string; mode: 'undo' | 'reset'; idemKey: string }
): Promise<{ httpStatus: number | null; body: unknown }> {
  let res: Response
  try {
    res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/restore`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sha: body.sha, mode: body.mode, idemKey: body.idemKey })
    })
  } catch {
    return { httpStatus: null, body: null }
  }
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    /* the status is the answer */
  }
  return { httpStatus: res.status, body: parsed }
}

/**
 * Restore everything — files AND database — to backup `version` (ADR 0024 sub-decision 2). The
 * server asks the `site` toolset and the word "restore" the person typed (`confirm`), takes a
 * "Before restore" backup first, and records one operation per `idemKey`. Raw answer, like
 * `restoreMoment`: `httpStatus: null` = no answer came, which is NOT "nothing happened".
 */
export async function restoreEverything(
  siteKey: string,
  body: { version: number; confirm: 'restore'; idemKey: string }
): Promise<{ httpStatus: number | null; body: unknown }> {
  let res: Response
  try {
    res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/restore`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'everything', ...body })
    })
  } catch {
    return { httpStatus: null, body: null }
  }
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    /* the status is the answer */
  }
  return { httpStatus: res.status, body: parsed }
}
