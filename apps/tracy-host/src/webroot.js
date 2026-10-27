import { publicOriginEnv } from './public-origin.js'
/**
 * The webroot jobs (`POST /_host/site`), the agent token (`POST /_host/agent-token`), and the two
 * Cloudflare-gated doors (`POST /_host/address`, `POST /_host/go-live`) — everything `app.js`
 * wires behind those four routes. Ported from `tracy-hooks.contabo.py`:
 *
 *   WEBROOT_JOBS                py:122-141, since grown and pruned (the backup kinds, 03/10/2026:
 *                                `webroot-backup` only — nothing ever sent the other two)
 *   validate_webroot_push       py:162-188
 *   validate_webroot_release    py:193-223 (`validateWebrootBackup`, without the GitHub repo)
 *   validate_webroot_moment     py:225-234
 *   validate_webroot_payload    py:236-268 (the generic path/ref/sha/contentBase64 dispatch;
 *                                merged with the three validators above into one
 *                                `validateWebrootBody`, matching the brief's single function name)
 *   run_webroot_job             py:270-365 (365 for the `finally` block the brief's own warning
 *                                calls out — cleanup must run on every path, not just success)
 *   _agent_token                py:598-622 (plus `mintAgentToken`, which Python never had: the
 *                                door used to be read-only, so a site whose provision predates
 *                                token collection could never pair — see that function)
 *   _go_live                    py:624-479 header + `go_live()` py:450-479
 *   core-manifest-write         py:744-777 — the 17th kind `POST /site` answers, NOT in
 *                                `WEBROOT_JOBS` and not run through `run_webroot_job` (it writes a
 *                                JSON file directly, no script). Task-4 fix round 1: this was first
 *                                left out because it falls outside every line range that task's
 *                                brief cited — but dropping it is fail-open, exactly the thing this
 *                                repo refuses everywhere: `webroot-edit.sh`'s Core-area gate
 *                                (ADR 0070) reads the file this writes, and a MISSING file drops
 *                                the gate to its default list, silently making a CMS core file
 *                                writable (py's own docstring, py:729-732). Ruled: build it.
 *
 * `run` and `jobs` are always the caller's, matching `provision.js`'s own injection — this module
 * never imports `run.js`/`jobs.js` directly, so a test never spawns a real process or touches a
 * real filesystem for a job record it didn't ask for.
 */
import { constants as fsConstants } from 'node:fs'
import { lstat, mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Which script + fixed `--op` each `kind` runs — first ported from py:122-141. Order kept for a
 * human reading a log, same as `PROVISION_FLAGS` — `run_webroot_job` looks kinds up by key, never
 * by position. */
export const WEBROOT_JOBS = {
  'site-settings': ['site-settings.sh', 'read'],
  'site-demo-contact': ['site-demo-contact.sh', 'install'],
  'site-address': ['site-address.sh', 'change'],
  'webroot-ensure': ['webroot-git.sh', 'ensure'],
  'webroot-changes': ['webroot-git.sh', 'changes'],
  'webroot-commit': ['webroot-git.sh', 'commit'],
  'webroot-file-diff': ['webroot-git.sh', 'file-diff'],
  'webroot-file-show': ['webroot-git.sh', 'file-show'],
  'webroot-pack': ['webroot-pack.sh', 'pack'],
  'webroot-push': ['webroot-push.sh', 'push'],
  'webroot-write': ['webroot-edit.sh', 'write'],
  'webroot-delete': ['webroot-edit.sh', 'delete'],
  'webroot-restore-undo': ['webroot-git.sh', 'restore-undo'],
  'webroot-restore-reset': ['webroot-git.sh', 'restore-reset'],
  'webroot-moment': ['webroot-git.sh', 'moment'],
  'webroot-seal-outside': ['webroot-git.sh', 'seal-outside'],
  'webroot-turn-moments': ['webroot-git.sh', 'turn-moments'],
  // Read-only preflight of undoing several moments in a row, newest first (undo a chat turn).
  'webroot-undo-check': ['webroot-git.sh', 'undo-check'],
  'webroot-history': ['webroot-git.sh', 'history'],
  // ADR 0024: a backup point — the site's files and its database — numbered by this host.
  'webroot-backup': ['webroot-backup.sh', 'create'],
  // ADR 0024: files AND database back to one backup point, a Before-restore backup taken first.
  'webroot-restore-everything': ['webroot-backup.sh', 'restore-everything'],
  // A backup point packed as one zip and PUT to the store address tracy-web signed (plan
  // todo-backup-export): what an Owner downloads.
  'webroot-export': ['webroot-backup.sh', 'export'],
  // "Sync from live" for an imported site (plan tasks/ke-hoach-dong-bo-tu-live.md): read the live
  // site, merge it with the copy, and put the result in place through Restore everything — in one go
  // (`sync`), or merge only (`merge`, after decisions) and apply the merge it left (`apply`).
  'webroot-sync': ['webroot-sync.sh', 'sync'],
  'webroot-sync-merge': ['webroot-sync.sh', 'merge'],
  'webroot-sync-apply': ['webroot-sync.sh', 'apply'],
  'webroot-sync-copy-token': ['webroot-sync.sh', 'copy-token'],
  'webroot-sync-forget': ['webroot-sync.sh', 'forget'],
  // "Sync to live" phase 1 (plan tasks/ke-hoach-sync-to-live.md, contract
  // scripts/webroot/LIVE-PUSH-CONTRACT.md): what Tracy changed on the copy, written on the live site
  // through its engine's content actions — previewed (after a Sync from live), applied with a check of
  // every value first, and taken back.
  'webroot-live-push-preview': ['webroot-live-push.sh', 'preview'],
  'webroot-live-push-apply': ['webroot-live-push.sh', 'apply'],
  'webroot-live-push-undo': ['webroot-live-push.sh', 'undo']
}

/** The kinds of "Sync from live"; they share one body shape and one folder per sync. */
export const SYNC_KINDS = [
  'webroot-sync',
  'webroot-sync-merge',
  'webroot-sync-apply',
  'webroot-sync-copy-token',
  'webroot-sync-forget'
]
/** The kinds of "Sync to live"; each names its preview or its push, and the live site's door. */
export const LIVE_PUSH_KINDS = [
  'webroot-live-push-preview',
  'webroot-live-push-apply',
  'webroot-live-push-undo'
]
/** The jobs whose timed steps are kept as their progress while they run (`syncProgressLine`). */
const PROGRESS_KINDS = [...SYNC_KINDS, ...LIVE_PUSH_KINDS]
/** How many progress lines a sync's job keeps (webroot-sync.sh prints about twenty). */
export const MAX_SYNC_PROGRESS = 60
/**
 * The line of a sync's output its job keeps as progress, cut short, or null: a timed step
 * (`==> [12s] reading the live site`, webroot-sync.sh) or the live read's own answer line, which
 * carries the read's timing (`{"ok":true,"liveReadAt":…,"timing":…}`, no `state`). tracy-web reads
 * the step and the timing from these (`sites/live-sync.js` `timingOf`); nothing else of the output
 * is kept before the job ends.
 * @param {string} line
 */
export function syncProgressLine(line) {
  if (/^==> \[\d+s\] /.test(line)) return line.slice(0, 200)
  if (line.startsWith('{"ok":true,') && line.includes('"liveReadAt"') && !line.includes('"state"'))
    return line.length <= 2048 ? line : null
  return null
}
/** One sync's folder name, chosen by tracy-web (a row id); it becomes a path, so it is fenced here. */
export const SYNC_ID = /^[a-f0-9-]{8,64}$/
/** Decisions a person or the resolver took: `{<conflict id>: 'ours' | 'theirs'}`, at most this many. */
export const MAX_SYNC_DECISIONS = 5000

// Same charsets as py:147-156, ported verbatim — the fence between a caller and a filesystem or a
// domain name lives in these patterns, not in the script they get handed to.
export const SAFE_WEBROOT_PATH = /^[^\0\n]{1,512}$/
export const SAFE_SHA = /^[0-9a-f]{7,64}$/
export const SAFE_DOMAIN = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-)){1,10}$/
export const MAX_WEBROOT_CONTENT = 8 * 1024 * 1024 // same 8 MiB ceiling as component media.upload
export const MAX_WEBROOT_BATCH = 32 * 1024 * 1024 // a template edit, not a whole site
export const MAX_BACKUP_NOTES = 256 * 1024 // notes a person reads, not a dump
// py:754 — checked against the base64 STRING length, not the decoded byte count (unlike
// MAX_WEBROOT_CONTENT's own base64Bound() check above); carried exactly as Python has it, error
// text included ("~1.5MB" is Python's own approximation of what 2 MiB of base64 decodes to).
export const MAX_CORE_MANIFEST = 2 * 1024 * 1024

/** `MAX * 4 // 3 + 4` (py) — the base64 length a decoded buffer of `maxBytes` can reach, floored
 * the same way Python's `//` floors. Used to refuse an oversized payload BEFORE ever decoding it —
 * decoding first would mean holding the whole (possibly enormous) buffer just to reject it. */
function base64Bound(maxBytes) {
  return Math.floor((maxBytes * 4) / 3) + 4
}

/** `base64.b64decode(x, validate=True)` (py) raises on anything that isn't strict base64 —
 * `Buffer.from(x, 'base64')` in Node is lenient and silently drops bad characters instead. This
 * checks the alphabet and padding shape first, so a malformed payload is refused the same way
 * Python refuses it, not silently truncated into something that "worked". */
function strictBase64Decode(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('not base64')
  }
  return Buffer.from(value, 'base64')
}

/**
 * Whether a webroot-relative path names a configuration file whose bytes the two READING jobs
 * (`webroot-file-diff`, `webroot-file-show`) never hand out — plan `tasks/todo-site-changes.md` Q1,
 * invariant 10. Refused here, at tracy-web's diff door (`apps/tracy-web/src/sites/file-visibility.js`)
 * and inside `webroot-git.sh` (`scripts/lib/webroot-sensitive.sh`): three runtimes that cannot
 * import one another, so the list is written three times and
 * `apps/tracy-web/test/file-visibility.test.mjs` fails when any two disagree. Its source is the agent
 * file fence's `WEBROOT_SECRETS` + `.env` (`packages/tools/tracy-subprocess-docker/src/site-guards.mjs`),
 * widened to copies, backups and EmDash's SQLite database. Change all three in one commit.
 * @param {string} path
 * @returns {boolean}
 */
export function isSensitiveWebrootPath(path) {
  const name = String(path).split('/').at(-1)?.toLowerCase() ?? ''
  const bare = name.replace(/^\.+/, '')
  if (bare.startsWith('wp-config') && bare !== 'wp-config-sample.php') return true
  if (bare.startsWith('configuration.') && bare.includes('php')) return true
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return true
  if (/\.(db|sqlite3?)(-wal|-shm|-journal)?$/.test(name)) return true
  return name === 'tracy-agent.token'
}

/** py:162-188. A batch push: a tarball, a list of deletes, or both. */
function validateWebrootPush(body) {
  const tarball = body.tarballBase64
  const deletes = body.deletes
  const hasDeletes = Array.isArray(deletes) ? deletes.length > 0 : Boolean(deletes)
  if (tarball == null && !hasDeletes) return 'need tarballBase64 or deletes'
  if (tarball != null) {
    if (typeof tarball !== 'string' || !tarball) return 'refused tarballBase64'
    if (tarball.length > base64Bound(MAX_WEBROOT_BATCH)) return 'refused tarballBase64: too large'
  }
  if (deletes != null) {
    if (!Array.isArray(deletes)) return 'refused deletes'
    for (const rel of deletes) {
      if (typeof rel !== 'string' || !SAFE_WEBROOT_PATH.test(rel)) return 'refused deletes'
      if (rel.startsWith('/') || rel.split('/').includes('..')) return 'refused deletes'
    }
  }
  const message = body.message
  if (message != null && (typeof message !== 'string' || message.length > 200)) return 'refused message'
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'tarballBase64', 'deletes', 'message'].includes(key)) return `refused ${key}`
  }
  return null
}

/** py:193-223. Making a backup: title, who pressed, and notes. */
function validateWebrootBackup(body) {
  for (const [key, cap] of [
    ['byName', 120],
    ['byEmail', 200]
  ]) {
    const value = body[key]
    if (
      value != null &&
      (typeof value !== 'string' || !value.trim() || value.length > cap || value.includes('\n'))
    ) {
      return `refused ${key}`
    }
  }
  const title = body.title
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || title.includes('\n')) {
    return 'refused title'
  }
  const notes = body.notesBase64
  if (notes != null && (typeof notes !== 'string' || notes.length > base64Bound(MAX_BACKUP_NOTES))) {
    return 'refused notesBase64'
  }
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'title', 'notesBase64', 'byName', 'byEmail', 'includeLarge'].includes(key)) {
      return `refused ${key}`
    }
  }
  if (body.includeLarge !== undefined && typeof body.includeLarge !== 'boolean') return 'refused includeLarge'
  return null
}

/** ADR 0024 — Restore everything: which backup (`version`, the N of `tracy-release/vN`, and `sha`,
 * the commit the caller saw it on — the script refuses a point that moved) and who pressed (the
 * tagger of the Before-restore backup it takes first). */
function validateWebrootRestoreEverything(body) {
  if (!Number.isInteger(body.version) || body.version < 1 || body.version > 999999) return 'refused version'
  if (body.sha !== undefined && (typeof body.sha !== 'string' || !SAFE_SHA.test(body.sha)))
    return 'refused sha'
  for (const [key, cap] of [
    ['byName', 120],
    ['byEmail', 200]
  ]) {
    const value = body[key]
    if (
      value != null &&
      (typeof value !== 'string' || !value.trim() || value.length > cap || value.includes('\n'))
    ) {
      return `refused ${key}`
    }
  }
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'version', 'sha', 'byName', 'byEmail'].includes(key)) return `refused ${key}`
  }
  return null
}

/** The largest package a caller may ask for: a tebibyte, far past the 1 GiB tracy-web sends. */
export const MAX_EXPORT_BYTES = 2 ** 40

/**
 * Whether `value` is an address this host may PUT a site's whole backup to: https (plain http only
 * where `overHttp`, a development host's MinIO), no credentials in it, one line, and no character
 * that could end the `url = "…"` line curl reads it from (`webroot-backup.sh` `export_backup`).
 */
function isUploadUrl(value, overHttp) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s"\\]/.test(value)) return false
  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const schemes = overHttp ? ['https:', 'http:'] : ['https:']
  return schemes.includes(url.protocol) && !url.username && !url.password
}

/**
 * A backup point packed for download (plan todo-backup-export): which point, where to PUT the zip,
 * and its ceiling. The address is a bearer secret for as long as it lives: it reaches the script
 * through the environment only (`runWebrootJob`), never argv, never the job record. So does
 * `installCode`, the six digits the package's installer asks for before it sends the site to a
 * database on another server (WordPress and Joomla; the package keeps only its hash).
 * @param {object} body
 * @param {{exportOverHttp?: boolean}} options
 */
function validateWebrootExport(body, { exportOverHttp = false } = {}) {
  if (!Number.isInteger(body.version) || body.version < 1 || body.version > 999999) return 'refused version'
  if (!isUploadUrl(body.uploadUrl, exportOverHttp)) return 'refused uploadUrl'
  if (
    body.maxBytes !== undefined &&
    (!Number.isInteger(body.maxBytes) || body.maxBytes < 1 || body.maxBytes > MAX_EXPORT_BYTES)
  )
    return 'refused maxBytes'
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'version', 'uploadUrl', 'maxBytes', 'includeLarge', 'installCode'].includes(key))
      return `refused ${key}`
  }
  if (body.includeLarge !== undefined && typeof body.includeLarge !== 'boolean') return 'refused includeLarge'
  if (
    body.installCode !== undefined &&
    (typeof body.installCode !== 'string' || !/^\d{6}$/.test(body.installCode))
  )
    return 'refused installCode'
  return null
}

/**
 * "Sync from live": which sync (its folder), and for a read the live site's Claude Cowork door and
 * token, plus the import archive's signed addresses when tracy-web found them. Token and addresses
 * are secrets for as long as they live: they reach the script through the environment only
 * (`runWebrootJob`), never argv, never the job record.
 * @param {object} body
 * @param {{exportOverHttp?: boolean}} options
 */
function validateWebrootSync(body, { exportOverHttp = false } = {}) {
  if (typeof body.syncId !== 'string' || !SYNC_ID.test(body.syncId)) return 'refused syncId'
  if (body.endpoint !== undefined) {
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048 || /[\s"\\]/.test(body.endpoint))
      return 'refused endpoint'
    try {
      const url = new URL(body.endpoint)
      if (
        !['https:', ...(exportOverHttp ? ['http:'] : [])].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return 'refused endpoint'
    } catch {
      return 'refused endpoint'
    }
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9._~+/=-]{8,512}$/.test(body.token))
      return 'refused token'
  } else if (body.token !== undefined) return 'refused token'
  for (const key of ['baseWebrootUrl', 'baseDbUrl']) {
    if (body[key] !== undefined && !isUploadUrl(body[key], exportOverHttp)) return `refused ${key}`
  }
  if (body.decisions !== undefined) {
    const d = body.decisions
    if (typeof d !== 'object' || d === null || Array.isArray(d)) return 'refused decisions'
    const entries = Object.entries(d)
    if (entries.length > MAX_SYNC_DECISIONS) return 'refused decisions'
    for (const [id, pick] of entries) {
      if (id.length > 1024 || !['ours', 'theirs'].includes(pick)) return 'refused decisions'
    }
  }
  if (body.allowHeld !== undefined && typeof body.allowHeld !== 'boolean') return 'refused allowHeld'
  // A Sync anyway names the held sync whose read and merge it may take (#1649): another run folder
  // of the same site, never this one.
  if (
    body.resumeSyncId !== undefined &&
    (typeof body.resumeSyncId !== 'string' ||
      !SYNC_ID.test(body.resumeSyncId) ||
      body.resumeSyncId === body.syncId ||
      body.allowHeld !== true)
  )
    return 'refused resumeSyncId'
  // The live site's fingerprint as its import found it (tracy-web `importFingerprint`): an object,
  // at most 512 KB, written beside the run for webroot-sync.sh — never into the environment.
  if (
    body.baseFingerprint !== undefined &&
    (typeof body.baseFingerprint !== 'object' ||
      body.baseFingerprint === null ||
      Array.isArray(body.baseFingerprint) ||
      JSON.stringify(body.baseFingerprint).length > 512 * 1024)
  )
    return 'refused baseFingerprint'
  if (body.byEmail !== undefined && (typeof body.byEmail !== 'string' || body.byEmail.length > 254))
    return 'refused byEmail'
  if (body.byName !== undefined && (typeof body.byName !== 'string' || body.byName.length > 200))
    return 'refused byName'
  for (const key of Object.keys(body)) {
    if (
      ![
        'kind',
        'label',
        'syncId',
        'endpoint',
        'token',
        'baseWebrootUrl',
        'baseDbUrl',
        'decisions',
        'byName',
        'byEmail',
        'copyToken',
        'allowHeld',
        'resumeSyncId',
        'baseFingerprint'
      ].includes(key)
    )
      return `refused ${key}`
  }
  if (
    body.kind === 'webroot-sync-copy-token'
      ? !/^[A-Za-z0-9_.-]{20,512}$/.test(String(body.copyToken ?? ''))
      : body.copyToken !== undefined
  )
    return 'refused copyToken'
  return null
}

/**
 * "Sync to live": which preview or push (folders under `<private>/<label>/push/`), the live site's door
 * and token (both required: every op reads or writes the live site), the import archive's addresses
 * for a preview's first Sync from live, and the owner's word on deletes for an apply. Token and
 * addresses reach the script through the environment only, as a sync's.
 * @param {object} body
 * @param {{exportOverHttp?: boolean}} options
 */
function validateLivePush(body, { exportOverHttp = false } = {}) {
  const kind = body.kind
  const allowed = {
    'webroot-live-push-preview': ['previewId', 'baseWebrootUrl', 'baseDbUrl', 'baseFingerprint'],
    'webroot-live-push-apply': ['previewId', 'pushId', 'confirm'],
    'webroot-live-push-undo': ['pushId']
  }[kind]
  for (const key of ['previewId', 'pushId']) {
    if (!allowed.includes(key)) continue
    if (typeof body[key] !== 'string' || !SYNC_ID.test(body[key])) return `refused ${key}`
  }
  if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048 || /[\s"\\]/.test(body.endpoint))
    return 'refused endpoint'
  try {
    const url = new URL(body.endpoint)
    if (
      !['https:', ...(exportOverHttp ? ['http:'] : [])].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return 'refused endpoint'
  } catch {
    return 'refused endpoint'
  }
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9._~+/=-]{8,512}$/.test(body.token))
    return 'refused token'
  for (const key of ['baseWebrootUrl', 'baseDbUrl']) {
    if (body[key] !== undefined && !isUploadUrl(body[key], exportOverHttp)) return `refused ${key}`
  }
  // The import's fingerprint of the live site, for a site never synced (as `webroot-sync`'s).
  if (
    body.baseFingerprint !== undefined &&
    (typeof body.baseFingerprint !== 'object' ||
      body.baseFingerprint === null ||
      Array.isArray(body.baseFingerprint) ||
      JSON.stringify(body.baseFingerprint).length > 512 * 1024)
  )
    return 'refused baseFingerprint'
  if (allowed.includes('confirm')) {
    const c = body.confirm
    if (
      typeof c !== 'object' ||
      c === null ||
      Array.isArray(c) ||
      typeof c.deletes !== 'boolean' ||
      (c.php !== undefined && typeof c.php !== 'boolean') ||
      Object.keys(c).some((k) => k !== 'deletes' && k !== 'php')
    )
      return 'refused confirm'
  }
  if (body.byEmail !== undefined && (typeof body.byEmail !== 'string' || body.byEmail.length > 254))
    return 'refused byEmail'
  if (body.byName !== undefined && (typeof body.byName !== 'string' || body.byName.length > 200))
    return 'refused byName'
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'endpoint', 'token', 'byName', 'byEmail', ...allowed].includes(key))
      return `refused ${key}`
  }
  return null
}

/** py:225-234. One agent turn, sealed under the request the person typed. */
function validateWebrootMoment(body) {
  const title = body.title
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || title.includes('\n')) {
    return 'refused title'
  }
  if (body.turn !== undefined && !isTurnId(body.turn)) return 'refused turn'
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'title', 'turn'].includes(key)) return `refused ${key}`
  }
  return null
}

/**
 * A chat turn's id, `<dsh session id>:<turn number>` (plan todo-site-changes §5) — the same shape
 * `webroot-git.sh` checks before it becomes a file name and a commit trailer.
 */
export const TURN_ID = /^[A-Za-z0-9_-]{1,128}:[0-9]{1,9}$/
const isTurnId = (value) => typeof value === 'string' && TURN_ID.test(value)

/** A chat turn opens: seal what was dirty before it, mark it open. `turn` optional. */
function validateWebrootSealOutside(body) {
  if (body.turn !== undefined && !isTurnId(body.turn)) return 'refused turn'
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'turn'].includes(key)) return `refused ${key}`
  }
  return null
}

/** The commits of up to 100 named turns, read in one walk. */
function validateWebrootTurnMoments(body) {
  const turns = body.turns
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > 100 || !turns.every(isTurnId)) {
    return 'refused turns'
  }
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'turns'].includes(key)) return `refused ${key}`
  }
  return null
}

/** The moments of an undo run, newest first: 1 to 200 shas, read-only (`webroot-git.sh undo-check`). */
function validateWebrootUndoCheck(body) {
  const shas = body.shas
  if (
    !Array.isArray(shas) ||
    shas.length === 0 ||
    shas.length > 200 ||
    !shas.every((sha) => typeof sha === 'string' && SAFE_SHA.test(sha))
  ) {
    return 'refused shas'
  }
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'shas'].includes(key)) return `refused ${key}`
  }
  return null
}

/**
 * `null` when `body` is a valid instruction for `body.kind`, otherwise the refusal reason —
 * matches py's `validate_webroot_payload(kind, body)` (py:236-268) with `kind` read off `body`
 * itself rather than passed apart, since `body.kind` is already what a caller sent.
 *
 * @param {object} body - `{kind, label, ...}`, one of `WEBROOT_JOBS`' keys.
 * @param {{exportOverHttp?: boolean}} [options] - the host's own config (`config.exportOverHttp`).
 * @returns {string|null}
 */
export function validateWebrootBody(body, options = {}) {
  const kind = body.kind
  if (kind === 'site-demo-contact') {
    for (const key of Object.keys(body)) if (!['kind', 'label'].includes(key)) return `refused ${key}`
    return null
  }
  if (kind === 'site-address') {
    for (const key of Object.keys(body)) {
      if (!['kind', 'label', 'oldUrl', 'newUrl', 'operation', 'changeId'].includes(key))
        return `refused ${key}`
    }
    if (!['apply', 'rollback'].includes(body.operation)) return 'refused operation'
    if (
      typeof body.changeId !== 'string' ||
      !/^(?:[a-f0-9]{16,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
        body.changeId
      )
    )
      return 'refused changeId'
    for (const key of ['oldUrl', 'newUrl']) {
      if (typeof body[key] !== 'string' || body[key].length > 2048 || /[\\\s]/.test(body[key]))
        return `refused ${key}`
      try {
        const url = new URL(body[key])
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          return `refused ${key}`
      } catch {
        return `refused ${key}`
      }
    }
    return null
  }
  if (kind === 'webroot-push') return validateWebrootPush(body)
  if (kind === 'webroot-backup') return validateWebrootBackup(body)
  if (kind === 'webroot-restore-everything') return validateWebrootRestoreEverything(body)
  if (kind === 'webroot-export') return validateWebrootExport(body, options)
  if (SYNC_KINDS.includes(kind)) return validateWebrootSync(body, options)
  if (LIVE_PUSH_KINDS.includes(kind)) return validateLivePush(body, options)
  if (kind === 'webroot-moment') return validateWebrootMoment(body)
  if (kind === 'webroot-seal-outside') return validateWebrootSealOutside(body)
  if (kind === 'webroot-turn-moments') return validateWebrootTurnMoments(body)
  if (kind === 'webroot-undo-check') return validateWebrootUndoCheck(body)

  const needsPath = ['webroot-file-diff', 'webroot-file-show', 'webroot-write', 'webroot-delete'].includes(
    kind
  )
  if (needsPath) {
    const p = body.path
    if (typeof p !== 'string' || !SAFE_WEBROOT_PATH.test(p)) return 'refused path'
    if (p.startsWith('/') || p.split('/').includes('..')) return 'refused path'
    if ((kind === 'webroot-file-diff' || kind === 'webroot-file-show') && isSensitiveWebrootPath(p))
      return 'refused path: CONFIG_FILE_BLOCKED'
  }
  if (kind === 'webroot-file-show') {
    if (!['baseline', 'worktree'].includes(body.ref)) return 'need ref: baseline or worktree'
  }
  if (['webroot-commit', 'webroot-restore-undo', 'webroot-restore-reset'].includes(kind)) {
    const sha = body.sha
    if (typeof sha !== 'string' || !SAFE_SHA.test(sha)) return 'refused sha'
  }
  // A file diff may name ONE moment: then it is that moment's own change (SHA^ → SHA).
  if (kind === 'webroot-file-diff' && body.sha !== undefined) {
    if (typeof body.sha !== 'string' || !SAFE_SHA.test(body.sha)) return 'refused sha'
  }
  if (kind === 'webroot-write') {
    const content = body.contentBase64
    if (typeof content !== 'string' || !content) return 'need contentBase64'
    if (content.length > base64Bound(MAX_WEBROOT_CONTENT)) return 'refused contentBase64: too large'
  }
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'path', 'contentBase64', 'ref', 'sha'].includes(key)) return `refused ${key}`
  }
  return null
}

/** `/tmp/<name>` (py) — `os.tmpdir()` resolves to the same `/tmp` on the fleet host (Linux) and
 * lets this run unmodified on a developer's Mac too. */
function tempPath(name) {
  return path.join(tmpdir(), name)
}

/**
 * Run one webroot job — the counterpart to Python's `run_webroot_job` (py:270-365), called from
 * `app.js`'s `/_host/site` handler without being awaited (the route has already answered
 * `202 {jobId}`).
 *
 * Every temp file this writes (backup notes, a push's tarball/deletes list, a write's content) is
 * removed in a `finally` — on a failed job exactly as much as a successful one, because every one
 * of them can hold customer text or a customer's own file content.
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {object} input.body - the validated request body (kind, label, and whatever
 *   `validateWebrootBody` accepted for that kind).
 * @param {object} input.config - needs `scriptsDir`.
 * @param {{put: Function, get: Function}} input.jobs
 * @param {Function} input.run - `run.js`'s `runScript` (or a test fake with the same shape).
 */
export async function runWebrootJob({ jobId, body, config, jobs, run }) {
  const label = body.label
  const kind = body.kind
  const [script, op] = WEBROOT_JOBS[kind]
  const args = [path.join(config.scriptsDir, 'webroot', script), '--label', String(label)]
  // webroot-pack.sh takes no --op (it does one thing); webroot-push.sh routes on which flags are
  // present, not on --op — py:275-276.
  if (kind !== 'webroot-pack' && kind !== 'webroot-push') args.push('--op', op)
  if (body.path) args.push('--path', String(body.path))
  if (body.ref) args.push('--ref', String(body.ref))
  if (body.sha) args.push('--sha', String(body.sha))

  if (kind === 'site-address') {
    args.push(
      '--operation',
      body.operation,
      '--change-id',
      body.changeId,
      '--old-url',
      body.oldUrl,
      '--new-url',
      body.newUrl
    )
  }
  const tempFiles = []

  async function failed(detail) {
    await jobs.put(jobId, { state: 'failed', step: kind, detail })
  }

  if (kind === 'webroot-backup') {
    args.push('--title', String(body.title))
    if (body.includeLarge === true) args.push('--include-large')
    if (body.byEmail) {
      args.push('--by-email', String(body.byEmail), '--by-name', String(body.byName || body.byEmail))
    }
    if (body.notesBase64) {
      const notesPath = tempPath(`webroot-backup-${jobId}.md`)
      let raw
      try {
        raw = strictBase64Decode(body.notesBase64)
      } catch {
        return failed('notesBase64 is not base64')
      }
      if (raw.length > MAX_BACKUP_NOTES) return failed('notes too large')
      await writeFile(notesPath, raw)
      tempFiles.push(notesPath)
      args.push('--notes-file', notesPath)
    }
  }

  if (kind === 'webroot-restore-everything') {
    args.push('--version', String(body.version))
    if (body.byEmail) {
      args.push('--by-email', String(body.byEmail), '--by-name', String(body.byName || body.byEmail))
    }
  }

  /** @type {Record<string, string>} */
  const jobEnv = {}
  if (kind === 'webroot-export') {
    args.push('--version', String(body.version))
    if (body.maxBytes) args.push('--max-bytes', String(body.maxBytes))
    if (body.includeLarge === true) args.push('--include-large')
    jobEnv.TRACY_EXPORT_UPLOAD_URL = String(body.uploadUrl)
    if (body.installCode) jobEnv.TRACY_EXPORT_INSTALL_CODE = body.installCode
  }

  if (SYNC_KINDS.includes(kind)) {
    const dir = path.join(config.privateRoot, String(label), 'sync', 'runs', String(body.syncId))
    await mkdir(dir, { recursive: true, mode: 0o700 })
    args.push('--dir', dir)
    if (body.decisions) {
      const decisionsPath = path.join(dir, 'decisions.json')
      await writeFile(decisionsPath, JSON.stringify(body.decisions), { mode: 0o600 })
      args.push('--decisions', decisionsPath)
    }
    if (body.baseFingerprint)
      await writeFile(path.join(dir, 'base-fingerprint.json'), JSON.stringify(body.baseFingerprint), {
        mode: 0o600
      })
    if (body.byEmail)
      args.push('--by-email', String(body.byEmail), '--by-name', String(body.byName || body.byEmail))
    if (body.endpoint) {
      jobEnv.TRACY_SYNC_ENDPOINT = String(body.endpoint)
      jobEnv.TRACY_SYNC_TOKEN = String(body.token)
    }
    if (body.copyToken) jobEnv.TRACY_COPY_COWORK_TOKEN = String(body.copyToken)
    // A person said to go on without the live records the merge cannot keep (`held`).
    if (body.allowHeld === true) jobEnv.TRACY_SYNC_ALLOW_HELD = '1'
    // The held sync's run folder, which webroot-sync.sh takes its read and merge from when they stand.
    if (body.resumeSyncId)
      jobEnv.TRACY_SYNC_RESUME_DIR = path.join(
        config.privateRoot,
        String(label),
        'sync',
        'runs',
        String(body.resumeSyncId)
      )
    if (body.baseWebrootUrl && body.baseDbUrl) {
      jobEnv.TRACY_SYNC_BASE_WEBROOT_URL = String(body.baseWebrootUrl)
      jobEnv.TRACY_SYNC_BASE_DB_URL = String(body.baseDbUrl)
    }
  }

  if (LIVE_PUSH_KINDS.includes(kind)) {
    if (body.previewId) args.push('--preview-id', String(body.previewId))
    if (body.pushId) args.push('--push-id', String(body.pushId))
    if (body.confirm?.deletes === true) args.push('--confirm-deletes')
    // The owner's own OK for the preview's PHP files (each linted for the live site's PHP first).
    if (body.confirm?.php === true) args.push('--confirm-php')
    if (body.byEmail)
      args.push('--by-email', String(body.byEmail), '--by-name', String(body.byName || body.byEmail))
    jobEnv.TRACY_SYNC_ENDPOINT = String(body.endpoint)
    jobEnv.TRACY_SYNC_TOKEN = String(body.token)
    if (body.baseWebrootUrl && body.baseDbUrl) {
      jobEnv.TRACY_SYNC_BASE_WEBROOT_URL = String(body.baseWebrootUrl)
      jobEnv.TRACY_SYNC_BASE_DB_URL = String(body.baseDbUrl)
    }
    // Beside the preview's own Sync from live run (webroot-live-push.sh `forward_sync`), where
    // webroot-sync.sh reads it — never in the environment.
    if (body.baseFingerprint) {
      const runDir = path.join(
        config.privateRoot,
        String(label),
        'push',
        'previews',
        String(body.previewId),
        'sync'
      )
      await mkdir(runDir, { recursive: true, mode: 0o700 })
      await writeFile(path.join(runDir, 'base-fingerprint.json'), JSON.stringify(body.baseFingerprint), {
        mode: 0o600
      })
    }
  }

  if (kind === 'webroot-moment') {
    args.push('--title', String(body.title))
  }
  if ((kind === 'webroot-moment' || kind === 'webroot-seal-outside') && body.turn) {
    args.push('--turn', String(body.turn))
  }
  if (kind === 'webroot-turn-moments') {
    args.push('--turns', body.turns.join(','))
  }
  if (kind === 'webroot-undo-check') {
    args.push('--shas', body.shas.join(','))
  }

  if (kind === 'webroot-push') {
    if (body.tarballBase64) {
      const tarPath = tempPath(`webroot-push-${jobId}.tar.gz`)
      let raw
      try {
        raw = strictBase64Decode(body.tarballBase64)
      } catch {
        return failed('tarballBase64 is not base64')
      }
      await writeFile(tarPath, raw)
      tempFiles.push(tarPath)
      args.push('--tarball', tarPath)
    }
    if (body.deletes && body.deletes.length) {
      const delPath = tempPath(`webroot-push-${jobId}.deletes`)
      // A trailing newline: the reader is bash `while read`, which drops a final line lacking one
      // — a single-entry list read as empty, measured (py's own comment, py:329-330).
      await writeFile(delPath, `${body.deletes.join('\n')}\n`)
      tempFiles.push(delPath)
      args.push('--deletes-file', delPath)
    }
    if (body.message) args.push('--message', String(body.message))
  }

  let contentPath = null
  if (kind === 'webroot-write') {
    contentPath = tempPath(`webroot-write-${jobId}`)
    let raw
    try {
      raw = strictBase64Decode(body.contentBase64)
    } catch {
      return failed('contentBase64 is not base64')
    }
    if (raw.length > MAX_WEBROOT_CONTENT) return failed('content too large')
    await writeFile(contentPath, raw)
    args.push('--content-file', contentPath)
  }

  await jobs.put(jobId, { state: 'running', step: kind, label })
  /** @type {string[]} */
  const progress = []
  try {
    const { code, tail } = await run({
      script: 'bash',
      args,
      env: {
        ...process.env,
        TRACY_PRIVATE_ROOT: config.privateRoot ?? process.env.TRACY_PRIVATE_ROOT,
        TRACY_SITES_ROOT: config.sitesRoot ?? process.env.TRACY_SITES_ROOT,
        ...jobEnv
      },
      // A sync's progress while it runs: every timed step line and the live read's own line, kept in
      // the job as they come (`syncProgressLine`), so tracy-web reads the step and the time so far
      // from the job while it runs, not only from its last 200 lines once it ends (#1649).
      ...(PROGRESS_KINDS.includes(kind)
        ? {
            onLine: async (line) => {
              const kept = syncProgressLine(line)
              if (!kept || progress.length >= MAX_SYNC_PROGRESS) return
              progress.push(kept)
              await jobs.put(jobId, { progress })
            }
          }
        : {}),
      // An export says when packing ended and the upload began, so tracy-web can show which.
      ...(kind === 'webroot-export'
        ? {
            onLine: async (line) => {
              if (line.startsWith('==> export: uploading'))
                await jobs.put(jobId, { step: 'webroot-export:uploading' })
            }
          }
        : {})
    })
    await jobs.put(jobId, {
      state: code === 0 ? 'done' : 'failed',
      step: kind,
      exitCode: code,
      output: tail.join('\n')
    })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: kind,
      detail: String(error?.message ?? error).slice(0, 200)
    })
  } finally {
    // Whether the job above succeeded, failed, or threw — every temp file this job wrote gets
    // removed. `unlink`'s own failure (already gone, permissions) is swallowed exactly like
    // Python's `except OSError: pass` (py:361-363): there is nobody left to tell.
    const all = contentPath ? [contentPath, ...tempFiles] : tempFiles
    for (const file of all) {
      await unlink(file).catch(() => {})
    }
  }
}

/**
 * `POST /_host/agent-token`'s read — the counterpart to Python's `_agent_token` (py:598-622).
 * Token minted by provision and written `${privateRoot}/<label>/tracy-agent.token` (0600); this
 * door only ever reads it back for the relay to forward to desk (ADR 0049).
 *
 * @param {object} input
 * @param {string} input.label - already validated by the caller (`SAFE_ARG`).
 * @param {object} input.config - needs `privateRoot`.
 * @returns {Promise<string|null>} the token, trimmed, or `null` when there is no such file.
 */
export async function readAgentToken({ label, config }) {
  return (await readTokenFile(path.join(config.privateRoot, label, 'tracy-agent.token'))) ?? null
}

/**
 * A token file's trimmed text, WITHOUT waiting on it. `readFile` on a FIFO with no writer never
 * returns, so the door opened `tracy-agent.token` and hung instead of answering (Astra review,
 * 23/09/2026). `O_NONBLOCK` makes the open return at once, and the open descriptor must be a
 * regular file before a byte is read. Links are still followed, as `readFile` followed them: this
 * is the Joomla/WordPress read, whose behaviour on the files the fleet writes does not change.
 *
 * @param {string} tokenPath
 * @returns {Promise<string|null|undefined>} the token; `null` when there is no such file;
 *   `undefined` when something is there that is not one readable regular file.
 */
async function readTokenFile(tokenPath) {
  let handle
  try {
    handle = await open(tokenPath, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
  } catch (err) {
    return err?.code === 'ENOENT' ? null : undefined
  }
  try {
    if (!(await handle.stat()).isFile()) return undefined
    return (await handle.readFile('utf8')).trim()
  } catch {
    return undefined
  } finally {
    await handle.close().catch(() => {})
  }
}

/** The fixed container path of the protected token bind (`render-compose.sh`). */
const CONTAINER_TOKEN_PATH = '/run/tracy-agent.token'

/**
 * Which custody does this site's own compose file put its agent token under?
 *
 *   `'protected'` — the file is, line for line, the compose `render-compose.sh` writes for an EmDash
 *                   site WITH the read-only token bind `- ./tracy-agent.token:/run/tracy-agent.token:ro`,
 *                   exactly once: where the generator puts it (after `./uploads:/app/uploads`), or
 *                   where `emdash/migrate-token-mount.mjs` inserts it into a pre-#155 file — first in
 *                   `services.web.volumes` when a comment follows `volumes:` (the generator's own
 *                   file: `findWebVolumes` stops at the comment), last when none does.
 *   `'none'`      — the file is, line for line, the pre-#155 generator output: the same shape with no
 *                   token bind at all. Only this answer can lead to the legacy repair, and only when
 *                   the host token file is proven absent too (`readAgentTokenCustody`).
 *   `'unknown'`   — anything else: another shape, extra or missing structure, malformed YAML, a
 *                   hand-edited but valid compose, a missing, unreadable or empty file.
 *
 * 🔒 AN EXACT-FORM MATCHER, NOT A YAML PARSER (23/09/2026). Three reviews in a row found a new
 * malformed shape a line parser read as `none` (`image: {]`, two scalars on one value, `services:
 * invalid` above an indented `web:`), and `none` beside an absent host token authorises the legacy
 * mint — revoke, `mv` a new inode over the bound file, write the agent-readable `data/` copy back.
 * The fleet writes these files itself, so the fleet's own output is the whole vocabulary: a file is
 * compared with `EMDASH_COMPOSE_FORM` after dropping blank lines and whole-line comments (the
 * generator's own comments change between versions; with every other line fixed, no line can open
 * a block scalar or a multi-line quote, so a `#` line is always a comment). Every other byte is
 * compared literally or against a tight value class — a tab, a CR, a trailing space, a reordered
 * key or an extra service reads `'unknown'`, and the door refuses it instead of repairing it.
 * `mint-agent-token.sh`'s `token_mount_custody` is the same table in awk, and
 * `test/token-custody-cases.mjs` holds both to one list of expected answers.
 *
 * ⚠ The cost is deliberate: a site whose compose was edited by hand, or written by a generator
 * older than the pre-#155 shape, is `'unknown'` until it is re-rendered (`render-compose.sh
 * <label>`) and, if pre-#155, migrated (`emdash/README.md`).
 *
 * @param {string} siteDir - `<privateRoot>/<label>`, already label-validated by the caller.
 * @returns {Promise<'protected'|'unknown'|'none'>}
 */
export async function tokenMountCustody(siteDir) {
  const text = await readComposeFile(path.join(siteDir, 'docker-compose.yml'))
  if (text === undefined) return 'unknown'
  return classifyTokenMount(text, path.resolve(siteDir))
}

/**
 * The compose file's text (or `.env`'s, for `siteShape`), only when it is a regular file the fleet
 * could have written.
 *
 * 🔒 A SYMLINK IS `'unknown'` EVEN WHEN ITS TARGET MATCHES (Astra review, 23/09/2026). The fleet
 * writes `docker-compose.yml` as a plain file; a link means someone else chose what this door
 * reads, and the file Docker Compose later reads can differ. `lstat` first, then open with
 * `O_NOFOLLOW | O_NONBLOCK` (a link or FIFO swapped in afterwards is neither followed nor waited
 * on) and read only if the descriptor is still that regular file.
 *
 * @param {string} composePath
 * @returns {Promise<string|undefined>} the text, or `undefined` for anything else.
 */
async function readComposeFile(composePath) {
  const seen = await lstat(composePath).catch(() => null)
  if (!seen?.isFile()) return undefined
  let handle
  try {
    handle = await open(composePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
    const held = await handle.stat()
    if (!held.isFile() || held.dev !== seen.dev || held.ino !== seen.ino) return undefined
    return await handle.readFile('utf8')
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** The one token bind the fleet writes, in both places it writes it (render-compose, migration). */
const TOKEN_BIND_LINE = `      - ./tracy-agent.token:${CONTAINER_TOKEN_PATH}:ro`
/** An image reference, a network name, a DNS list and a path segment — the generator's variables. */
const IMAGE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/
const NETWORK_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
// A comma-separated list of IPv4 addresses, one optional space after each comma — the only shape
// `TRACY_SITE_DNS` has ever held. Anything else (`[,]`, a trailing comma, IPv6) is `unknown`.
const DNS_OCTET = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
const DNS_IPV4 = `${DNS_OCTET}(\\.${DNS_OCTET}){3}`
const DNS_VALUE = new RegExp(`^${DNS_IPV4}(, ?${DNS_IPV4})*$`)
const ABS_PATH_CHARS = /^(\/[A-Za-z0-9._-]+)+$/
/** An absolute path with no `.`/`..` segment — the same two tests as awk's `abspath`. */
const isAbsPath = (p) => ABS_PATH_CHARS.test(p) && !/\/\.\.?(\/|$)/.test(p)
const SAFE_SITE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * The web service's `networks:` stanza, in every form `tracy_web_networks` (render-compose.sh) has
 * written for this label: the `[default, tracy]` shorthand, and — only for a label whose
 * `<label>-web-1` exceeds a 63-octet DNS label (#165) — the map form carrying the bounded
 * `tracy-web-<first 32 hex of sha256(label)>` alias. A long label keeps the shorthand too: that is
 * what the generator wrote before #165, and what `migrate-web-dns-alias.sh` patches from. The alias
 * is derived here from the label, never read from the file, so an alias naming another site is not
 * this form. A short label with an alias block was never written by the fleet and matches nothing.
 * @param {string} label
 * @returns {string[][]} each an exact run of lines.
 */
function webNetworkForms(label) {
  const shorthand = ['    networks: [default, tracy]']
  if (`${label}-web-1`.length <= 63) return [shorthand]
  const alias = `tracy-web-${createHash('sha256').update(label).digest('hex').slice(0, 32)}`
  return [shorthand, ['    networks:', '      default: {}', '      tracy:', `        aliases: ["${alias}"]`]]
}

/** The length of the `webNetworkForms` run starting at `lines[at]`, or 0 when none matches. */
function matchWebNetworks(lines, at, label) {
  for (const form of webNetworkForms(label)) {
    if (form.every((want, i) => lines[at + i] === want)) return form.length
  }
  return 0
}

// `TRACY_MAIL_URL` as `tracy_mail_url` writes it: tracy-web's default `http://<prefix>.10:8080/_site-mail`,
// or a host's own `TRACY_MAIL_URL`. Scheme, host, optional port and a plain path; nothing that could
// close the quote, interpolate (`$`) or start a comment.
const MAIL_URL_VALUE = /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9._~%/-]*)?$/

/**
 * The length of the site-mail run `tracy_web_mail_env` (render-compose.sh, #289) writes, starting at
 * `lines[at]`, or 0 when it is not there whole: `TRACY_MAIL_URL`, `TRACY_MAIL_LABEL` naming THIS
 * label, and the `TRACY_MAIL_TOKEN` interpolation, in that order. With `header`, an `environment:`
 * line first — the clone form has no other environment. All or nothing: a partial or reordered run
 * matches 0, and the literal line after it then fails the form.
 * @param {string[]} lines
 * @param {number} at
 * @param {string} label
 * @param {boolean} [header]
 * @returns {number}
 */
function matchMailEnv(lines, at, label, header = false) {
  const head = header ? ['    environment:'] : []
  const run = [
    ...head,
    null,
    `      TRACY_MAIL_LABEL: "${label}"`,
    '      TRACY_MAIL_TOKEN: "${TRACY_MAIL_TOKEN:-}"'
  ]
  const url = head.length
  const ok = run.every((want, i) => {
    const line = lines[at + i]
    if (line === undefined) return false
    if (i !== url) return line === want
    const prefix = '      TRACY_MAIL_URL: "'
    return line.startsWith(prefix) && line.endsWith('"') && MAIL_URL_VALUE.test(line.slice(prefix.length, -1))
  })
  return ok ? run.length : 0
}

// The values `tracy_site_limits` (render-compose.sh) writes: memory in whole mebibytes or gibibytes,
// cores as a positive number (`2`, `1.5`, `0.5`), a process count. Nothing that could close a
// scalar, interpolate or start a comment.
const MEMORY_VALUE = /^[1-9][0-9]*[mg]$/
const CPUS_VALUE = /^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/
const PIDS_VALUE = /^[1-9][0-9]*$/

/**
 * The length of the resource-cap run `tracy_limits_run` (render-compose.sh, 28/09/2026) writes on a
 * site's web and db services, starting at `lines[at]`, or 0 when it is not there whole:
 * `mem_limit`, `memswap_limit` EQUAL to it, `cpus`, `pids_limit`, in that order. All or nothing, like
 * the mail run: a partial, reordered or unequal run matches 0, and the literal line after it then
 * fails the form.
 * @param {string[]} lines
 * @param {number} at
 * @returns {number}
 */
function matchLimits(lines, at) {
  const value = (line, key, re) => {
    const prefix = `    ${key}: `
    if (line === undefined || !line.startsWith(prefix)) return null
    const v = line.slice(prefix.length)
    return re.test(v) ? v : null
  }
  const memory = value(lines[at], 'mem_limit', MEMORY_VALUE)
  if (memory === null || lines[at + 1] !== `    memswap_limit: ${memory}`) return 0
  if (value(lines[at + 2], 'cpus', CPUS_VALUE) === null) return 0
  return value(lines[at + 3], 'pids_limit', PIDS_VALUE) === null ? 0 : 4
}

/**
 * `tracy_compose_emdash` in `render-compose.sh`, one entry per non-comment line it emits. A string is
 * a literal line; `{ opt: 'token' }` is the token bind in one of its three permitted places (`slot`
 * names which); `{ opt: 'mail' }` is the site-mail run (`matchMailEnv`), absent from every file
 * written before #289; `{ opt: 'limits' }` is the resource-cap run (`matchLimits`), absent from every
 * file written before 28/09/2026; `{ opt: 'networks' }` is the required `networks:` stanza
 * (`webNetworkForms`, one line or four); `{ opt: 'dns' }` is the local-dev-only `dns:` line
 * (`TRACY_SITE_DNS`); a function judges a line whose value the generator fills in. `s` is the
 * absolute site directory, `l` its label.
 * @type {Array<string | {opt: 'token', slot: 'first'|'generator'|'last'} | {opt: 'mail'|'limits'|'networks'|'dns'} | ((line: string, s: string, l: string) => boolean)>}
 */
const EMDASH_COMPOSE_FORM = [
  'services:',
  '  web:',
  (line) => line.startsWith('    image: ') && IMAGE_VALUE.test(line.slice('    image: '.length)),
  '    restart: unless-stopped',
  '    security_opt: ["no-new-privileges:true"]',
  '    shm_size: 512m',
  { opt: 'limits' },
  '    environment:',
  '      EMDASH_ENCRYPTION_KEY: "${EMDASH_ENCRYPTION_KEY}"',
  '      EMDASH_SITE_URL: "${EMDASH_SITE_URL}"',
  '      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"',
  { opt: 'mail' },
  '    volumes:',
  { opt: 'token', slot: 'first' },
  '      - app:/app',
  '      - ./data:/app/data',
  '      - ./uploads:/app/uploads',
  { opt: 'token', slot: 'generator' },
  (line, _s, l) => {
    const tail = `/${l}:/site/${l}`
    if (!line.startsWith('      - ') || !line.endsWith(tail)) return false
    return isAbsPath(line.slice('      - '.length, line.length - tail.length))
  },
  (line, s, l) => line === `      - ${s}/data:/site/${l}/.webroot/data`,
  (line, s, l) => line === `      - ${s}/uploads:/site/${l}/.webroot/uploads`,
  { opt: 'token', slot: 'last' },
  { opt: 'networks' },
  { opt: 'dns' },
  '    ports:',
  '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:4321"',
  'volumes:',
  '  app:',
  'networks:',
  '  default:',
  '    external: true',
  (line, _s, l) => line === `    name: ${l}_default`,
  '  tracy:',
  '    external: true',
  (line) => line.startsWith('    name: ') && NETWORK_VALUE.test(line.slice('    name: '.length))
]

/** The optional `dns:` line exactly as `tracy_web_networks` prints it. */
const isDnsLine = (line) =>
  line.startsWith('    dns: [') && line.endsWith(']') && DNS_VALUE.test(line.slice('    dns: ['.length, -1))

/**
 * The pure half of `tokenMountCustody`, exported so its rules can be tested shape by shape.
 * @param {string} text - a compose file.
 * @param {string} [siteDir] - the absolute directory holding it; without one nothing is proven.
 * @returns {'protected'|'unknown'|'none'}
 */
export function classifyTokenMount(text, siteDir) {
  if (typeof siteDir !== 'string' || !isAbsPath(siteDir)) return 'unknown'
  const label = path.posix.basename(siteDir)
  if (!SAFE_SITE_LABEL.test(label)) return 'unknown'
  const lines = String(text)
    .split('\n')
    .filter((line) => !/^ *$/.test(line) && !/^ *#/.test(line))
  let at = 0
  const slots = []
  let mail = false
  let limits = false
  for (const want of EMDASH_COMPOSE_FORM) {
    const line = lines[at]
    if (typeof want === 'object') {
      if (want.opt === 'networks') {
        const taken = matchWebNetworks(lines, at, label)
        if (taken === 0) return 'unknown'
        at += taken
      } else if (want.opt === 'mail') {
        const taken = matchMailEnv(lines, at, label)
        mail = taken > 0
        at += taken
      } else if (want.opt === 'limits') {
        const taken = matchLimits(lines, at)
        limits = taken > 0
        at += taken
      } else if (want.opt === 'token' && line === TOKEN_BIND_LINE) {
        slots.push(want.slot)
        at++
      } else if (want.opt === 'dns' && line !== undefined && isDnsLine(line)) at++
      continue
    }
    if (line === undefined) return 'unknown'
    if (typeof want === 'string' ? line !== want : !want(line, siteDir, label)) return 'unknown'
    at++
  }
  if (at !== lines.length) return 'unknown'
  // 🔒 THE MAIL RUN DATES THE FILE (#289, 23/09/2026). Only a generator that also writes the token
  // bind in its own place has ever written it: a file carrying mail with no bind is not the pre-#155
  // output (`none` would authorise the legacy mint), and one with the bind where only the migration
  // puts it was never written by anyone. Re-render such a file.
  if (mail && !(slots.length === 1 && slots[0] === 'generator')) return 'unknown'
  // 🔒 SO DOES THE CAP RUN (28/09/2026), and later still: the generator that writes it writes the
  // mail run and the bind in its own place too. Caps beside no bind would otherwise read `none`.
  if (limits && !(mail && slots.length === 1 && slots[0] === 'generator')) return 'unknown'
  if (slots.length === 0) return 'none'
  return slots.length === 1 ? 'protected' : 'unknown'
}

/** What in `.env` (`provision.sh`, `platform/emdash.sh`) and in the compose file marks an EmDash site. */
const EMDASH_ENV_MARK = /(?:^|\n)(?:PLATFORM=emdash[ \t\r]*(?:\n|$)|EMDASH_)/
const EMDASH_COMPOSE_MARK = /EMDASH_|\/app\/(?:data|uploads)(?![A-Za-z0-9_])/
/**
 * What proves a Joomla or WordPress site: `provision.sh`'s `PLATFORM=` line (since 06/09/2026), or a
 * compose file that is, line for line, one of the three PHP forms `render-compose.sh` writes
 * (`composeProvesPhp` below).
 */
const PHP_ENV_PROOF = /(?:^|\n)PLATFORM=(?:joomla|wordpress)[ \t\r]*(?:\n|$)/

/** The generator's PHP variables: database name, sql-mode, and Joomla's extension URL list. */
const DB_NAME_VALUE = /^[A-Za-z0-9_]+$/
const SQL_MODE_VALUE = /^(?:[A-Z_]+(?:,[A-Z_]+)*)?$/
const EXTENSION_URL = 'https://[A-Za-z0-9._~/%+=@:?&-]+'
const EXTENSIONS_VALUE = new RegExp(`^(?:${EXTENSION_URL}(?:[,;]${EXTENSION_URL})*)?$`)
// Joomla's admin email is one fixed address in the generator, so only that exact value is the
// generator's line; any other address is a hand edit. It is the agent account's name inside the
// site, not a deployment address, which is why it is a pattern here and not config
// (`scripts/check-origins.ts` reads string literals only).
const ADMIN_EMAIL_VALUE = /^tracy-agent@tracy\.ai$/
const WEBROOT_TAIL = '/.webroot'

/**
 * A line `<prefix>"<value>"` whose value matches `re`; with `key`, the value is also held in `c[key]`
 * the first time and must repeat exactly after that (`DB_NAME` is written twice).
 */
const quoted = (prefix, re, key) => (line, c) => {
  if (!line.startsWith(`${prefix}"`) || !line.endsWith('"') || line.length < prefix.length + 2) return false
  const value = line.slice(prefix.length + 1, -1)
  if (!re.test(value)) return false
  if (key === undefined) return true
  if (c[key] === undefined) c[key] = value
  return c[key] === value
}

/** `tracy_compose_db` and the head of the web service, shared by the three PHP forms. */
const PHP_COMPOSE_HEAD = [
  'services:',
  '  db:',
  '    image: mariadb:11',
  '    restart: unless-stopped',
  { opt: 'limits', service: 'db' },
  '    command:',
  (line) =>
    line.startsWith('      - --sql-mode=') && SQL_MODE_VALUE.test(line.slice('      - --sql-mode='.length)),
  '      - --max-allowed-packet=256M',
  '    environment:',
  '      MARIADB_ROOT_PASSWORD: "${DB_PASSWORD}"',
  quoted('      MARIADB_DATABASE: ', DB_NAME_VALUE, 'db'),
  '    volumes:',
  '      - db:/var/lib/mysql',
  '  web:',
  (line) => line.startsWith('    image: ') && IMAGE_VALUE.test(line.slice('    image: '.length)),
  '    restart: unless-stopped',
  '    security_opt: ["no-new-privileges:true"]',
  '    shm_size: 512m',
  { opt: 'limits', service: 'web' },
  '    depends_on: [db]'
]

/** The web service's volumes, networks and ports, and the file's footer, shared by the three forms. */
const PHP_COMPOSE_TAIL = [
  '    volumes:',
  (line, c) => {
    const tail = ':/var/www/html'
    if (!line.startsWith('      - ') || !line.endsWith(tail)) return false
    const webroot = line.slice('      - '.length, -tail.length)
    if (!isAbsPath(webroot) || !webroot.endsWith(`/${c.label}${WEBROOT_TAIL}`)) return false
    c.webroot = webroot
    return true
  },
  '      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro',
  '      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro',
  (line, c) => line === `      - ${c.webroot.slice(0, -WEBROOT_TAIL.length)}:/site/${c.label}`,
  (line, c) => line === `      - ${c.webroot}:/site/${c.label}/.webroot`,
  { opt: 'networks' },
  { opt: 'dns' },
  '    ports:',
  '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80"',
  'volumes:',
  '  db:',
  'networks:',
  '  default:',
  '    external: true',
  (line, c) => line === `    name: ${c.label}_default`,
  '  tracy:',
  '    external: true',
  (line) => line.startsWith('    name: ') && NETWORK_VALUE.test(line.slice('    name: '.length))
]

/**
 * `tracy_compose_clone`, `tracy_compose_joomla_fresh` and `tracy_compose_wordpress_fresh` in
 * `render-compose.sh`, one entry per non-comment line each emits (same entry kinds as
 * `EMDASH_COMPOSE_FORM`, plus `header` on the clone's mail run, which brings its own
 * `environment:`, and `service` on the two cap runs; a function also gets the match state `c`: the
 * label, and the values a form writes twice).
 * @type {Array<Array<string | {opt: 'mail', header?: boolean} | {opt: 'limits', service: 'db'|'web'} | {opt: 'networks'|'dns'} | ((line: string, c: Record<string, string>) => boolean)>>}
 */
const PHP_COMPOSE_FORMS = [
  [
    ...PHP_COMPOSE_HEAD,
    '    entrypoint: ["apache2-foreground"]',
    { opt: 'mail', header: true },
    ...PHP_COMPOSE_TAIL
  ],
  [
    ...PHP_COMPOSE_HEAD,
    '    environment:',
    '      JOOMLA_DB_HOST: db',
    '      JOOMLA_DB_USER: root',
    '      JOOMLA_DB_PASSWORD: "${DB_PASSWORD}"',
    quoted('      JOOMLA_DB_NAME: ', DB_NAME_VALUE, 'db'),
    '      JOOMLA_DB_PREFIX: "tr_"',
    (line, c) => line === `      JOOMLA_SITE_NAME: "${c.label}"`,
    '      JOOMLA_ADMIN_USER: "Tracy Agent"',
    '      JOOMLA_ADMIN_USERNAME: "tracyagent"',
    '      JOOMLA_ADMIN_PASSWORD: "${JOOMLA_ADMIN_PASSWORD}"',
    quoted('      JOOMLA_ADMIN_EMAIL: ', ADMIN_EMAIL_VALUE),
    quoted('      JOOMLA_EXTENSIONS_URLS: ', EXTENSIONS_VALUE),
    { opt: 'mail' },
    ...PHP_COMPOSE_TAIL
  ],
  [
    ...PHP_COMPOSE_HEAD,
    '    environment:',
    '      WORDPRESS_DB_HOST: db',
    '      WORDPRESS_DB_USER: root',
    '      WORDPRESS_DB_PASSWORD: "${DB_PASSWORD}"',
    quoted('      WORDPRESS_DB_NAME: ', DB_NAME_VALUE, 'db'),
    '      WORDPRESS_TABLE_PREFIX: "tr_"',
    { opt: 'mail' },
    ...PHP_COMPOSE_TAIL
  ]
]

/**
 * Is this compose, line for line, a PHP form the fleet writes for the site labelled `label`?
 *
 * 🔒 AN EXACT-FORM MATCHER, LIKE `classifyTokenMount` (23/09/2026). Six reviews in a row found
 * a YAML shape the structural walker that stood here read as a webroot bind (a block scalar, a
 * multi-line quote, a duplicate `volumes:\t[]`, ...), and a false proof sends a markless EmDash site
 * down the Joomla/WordPress road, where the host token is read with no custody question. The fleet
 * writes these files itself, so its three PHP forms are the whole vocabulary: blank lines and
 * whole-line comments dropped, every other line literal or a tight value class. A compose edited by
 * hand or written by an older generator is no proof; such a site needs `.env`'s `PLATFORM=` line,
 * or a re-render (`render-compose.sh <label>`). `mint-agent-token.sh`'s `compose_proves_php` is the
 * same table in awk, held to the same answers by `test/token-custody-cases.mjs`.
 * @param {string} text
 * @param {string} label
 * @returns {boolean}
 */
function composeProvesPhp(text, label) {
  if (!SAFE_SITE_LABEL.test(label)) return false
  const lines = String(text)
    .split('\n')
    .filter((line) => !/^ *$/.test(line) && !/^ *#/.test(line))
  return PHP_COMPOSE_FORMS.some((form) => {
    const c = { label }
    let at = 0
    let mail = false
    const limits = { db: false, web: false }
    for (const want of form) {
      const line = lines[at]
      if (typeof want === 'object') {
        if (want.opt === 'networks') {
          const taken = matchWebNetworks(lines, at, label)
          if (taken === 0) return false
          at += taken
        } else if (want.opt === 'mail') {
          const taken = matchMailEnv(lines, at, label, want.header === true)
          mail = taken > 0
          at += taken
        } else if (want.opt === 'limits') {
          const taken = matchLimits(lines, at)
          limits[want.service] = taken > 0
          at += taken
        } else if (line !== undefined && isDnsLine(line)) at++
        continue
      }
      if (line === undefined) return false
      if (typeof want === 'string' ? line !== want : !want(line, c)) return false
      at++
    }
    // 🔒 THE CAPS COME AS ONE WRITE (28/09/2026): the generator puts them on both services, and only
    // the generator that also writes the site-mail run. One service capped, or caps without the mail
    // run, was written by no fleet tool — no proof.
    if (limits.db !== limits.web || (limits.web && !mail)) return false
    return at === lines.length
  })
}

/**
 * Is this an EmDash site, asked of every mark the fleet leaves in its directory?
 *
 * 🔒 NOT OF `data/data.db` ALONE (Astra review, 23/09/2026). The door used to call a site EmDash only
 * when its SQLite `stat`ed as a regular file, so an EmDash site whose database was missing (or whose
 * `stat` failed) took the Joomla/WordPress road: the host token was read with no custody question,
 * a wrong or missing compose still answered 200, and a FIFO there hung the door. Now any one mark
 * makes the site EmDash, and its custody is asked: a `data/` or `uploads/` entry of any type (only
 * EmDash keeps those under the private root: `platform/emdash.sh`, `render-compose.sh`), `.env`
 * naming `PLATFORM=emdash` or holding an `EMDASH_` key, or a compose file naming `EMDASH_` or
 * `/app/data`·`/app/uploads`. A mark that cannot be READ is not an absent mark: a `lstat` failing
 * with anything but ENOENT, or a `.env`/compose that exists but is not one readable regular file,
 * answers `'unknown'` and the door refuses. `mint-agent-token.sh`'s `site_shape` is the same rule,
 * and `test/token-custody-cases.mjs` (`SITE_SHAPE_CASES`) holds both to one list of answers.
 *
 * 🔒 AND `'other'` MUST BE PROVEN TOO, NOT INFERRED FROM MISSING MARKS (Astra review, 23/09/2026).
 * An EmDash site that lost `data/`, `uploads/` and its `.env` marks, with a compose reduced to
 * `services: {}`, carried no mark and took the Joomla/WordPress road: its host token was answered
 * with no custody question, and a FIFO there hung the door. So `'other'` now needs positive proof of
 * a PHP site: `.env` naming `PLATFORM=joomla|wordpress` (what `render-compose.sh`'s
 * `tracy_detect_platform` reads first), or a compose that is exactly one of the three PHP forms
 * `render-compose.sh` writes (`composeProvesPhp`). A directory with neither answers `'unknown'` and
 * the door refuses. A site directory that does not exist at all is `'other'`: there is nothing to
 * read, and the mint names it `SITE_UNKNOWN`.
 *
 * ⚠ A Joomla or WordPress directory the fleet wrote carries no EmDash mark and does carry the
 * proof, so its road is byte for byte what it was; only a non-regular `.env` or compose there, or a
 * directory with no proof — a pre-06/09 `.env` beside a compose edited by hand or written by an older
 * generator — now refuses instead of answering, until the compose is re-rendered.
 *
 * @param {string} siteDir
 * @returns {Promise<'emdash'|'other'|'unknown'>}
 */
export async function siteShape(siteDir) {
  const exists = await lstat(siteDir).then(
    () => true,
    (err) => (err?.code === 'ENOENT' ? false : undefined)
  )
  if (exists === undefined) return 'unknown'
  if (!exists) return 'other'
  for (const name of ['data', 'uploads']) {
    const seen = await lstat(path.join(siteDir, name)).then(
      () => true,
      (err) => (err?.code === 'ENOENT' ? false : undefined)
    )
    if (seen === undefined) return 'unknown'
    if (seen) return 'emdash'
  }
  const label = path.basename(path.resolve(siteDir))
  let marked = false
  let proven = false
  for (const [name, mark, proof] of [
    ['.env', EMDASH_ENV_MARK, (text) => PHP_ENV_PROOF.test(text)],
    ['docker-compose.yml', EMDASH_COMPOSE_MARK, (text) => composeProvesPhp(text, label)]
  ]) {
    const file = path.join(siteDir, name)
    const seen = await lstat(file).then(
      () => true,
      (err) => (err?.code === 'ENOENT' ? false : undefined)
    )
    if (seen === undefined) return 'unknown'
    if (!seen) continue
    const text = await readComposeFile(file)
    if (text === undefined) return 'unknown'
    if (mark.test(text)) marked = true
    if (proof(text)) proven = true
  }
  if (marked) return 'emdash'
  return proven ? 'other' : 'unknown'
}

/**
 * Does the site ITSELF hold the token this host has written down for it?
 *
 * 🔒 THE HOST COPY IS NOT PROOF, AND BELIEVING IT IS COST A SITE ITS WHOLE AGENT. An EmDash site
 * keeps the PAT in two files: the host copy `readAgentToken` reads, which pairing forwards, and
 * `<privateRoot>/<label>/data/tracy-agent.token`, which IS `/app/data/tracy-agent.token` inside
 * the site (`render-compose.sh` binds `./data:/app/data`) and is the only one the agent's content
 * door ever reads (`tracy-site-tools/src/host/index.ts:362`). Every site the generic EmDash road
 * provisioned before 19/09/2026 is in exactly the state where the first exists and the second does
 * not — so the door read the host copy, answered 200, and never ran the repair that was sitting
 * right behind it. Pairing went green while every `tracy_emdash` call answered `NO_TOKEN`:
 * measured on `demoemdash1`, where one agent spent 3m52s and 641K tokens discovering it was
 * blind. The repair existed; the door's own fast path is what kept it from being reached.
 *
 * ⚠ BY SHAPE, AND ONLY FOR EMDASH — the same test `mint-agent-token.sh` makes (`siteShape`: any
 * mark the fleet leaves in an EmDash site directory, not `data/data.db` alone), so the two agree
 * about what an EmDash site is without either being told. Joomla and WordPress keep the single-read path they have always had, byte for byte: they
 * have one copy, and a second read there would be a question about a file that is never supposed
 * to exist.
 *
 * 🔒 AND THE TWO-COPY QUESTION IS THE WRONG ONE ON A SITE UNDER PROTECTED CUSTODY (#155). Since
 * `render-compose.sh` emits `./tracy-agent.token:/run/tracy-agent.token:ro`, an EmDash site's
 * container reads the HOST FILE ITSELF through a read-only single-file bind, and provision
 * deliberately deletes the `data/` copy so the site's own www-data shell is left no readable PAT.
 * On such a site the absent second copy is the FINISHED state, not a half-healed one — and reading
 * it as "incomplete" sends this door into `mint-agent-token.sh`, whose repair is precisely wrong
 * here: it replaces the token file with `mv` (a NEW inode, which the running container never sees
 * through its bind), writes the agent-readable `data/` copy back, and revokes the credential the
 * mounted reader is still presenting. Green pairing, dead agent, and a legacy copy reintroduced.
 * So: the mount declared in the site's own compose file decides, and where it is declared the host
 * copy IS the container's copy — one file, nothing to disagree with.
 *
 * 🔒 AND THIS DOOR FAILS CLOSED (23/09/2026). Whenever the host side cannot PROVE the custody,
 * it answers `custody: 'unknown'` and the route refuses with `TOKEN_CUSTODY_UNKNOWN` — no token, no
 * mint, nothing written. That covers a compose file that is missing, unreadable, empty or not
 * exactly a form the fleet writes (`tokenMountCustody`), a host token path whose existence cannot be
 * established, and — the case the demoemdash1 repair used to take — a compose declaring NO mount
 * beside an existing host token file: a protected site whose compose lost its entry while the
 * container kept the bind looks exactly like that, and the legacy repair is what kills its agent.
 * A protected host token that is a symlink, not a regular file, linked twice, not owned by root or
 * not mode 0600 is refused the same way. The legacy mint therefore runs only for a site proven pre-#155 (readable compose, no mount, no
 * host token file), and the second `data/` copy is no longer read here at all: every state in which
 * it could disagree with the host copy has a host file, and is refused before the question arises.
 *
 * ⚠ THIS DOOR CANNOT SEE A *STALE* BIND, AND DOES NOT PRETEND TO. A container recreated before the
 * host file's inode was replaced holds the old inode; only `docker inspect` plus an in-container
 * digest can tell, which is `emdash/migrate-token-mount.mjs`'s job and is far too expensive for a
 * path every pairing takes. Answering with the host token is still the right answer here: it is
 * what pairing forwards, and the repair for a stale bind is the staged recovery
 * (`emdash/README.md`), never a re-mint from this door.
 *
 * @param {object} input
 * @param {string} input.label - already validated by the caller (`SAFE_LABEL`).
 * @param {object} input.config - needs `privateRoot`.
 * @returns {Promise<{token: string|null, complete: boolean, custody?: 'unknown'}>}
 *   `complete` with the token when it can be answered as is; otherwise `custody` names a refusal,
 *   and its absence means the mint may run (Joomla/WordPress without a token, an EMPTY protected
 *   token file, or a proven pre-#155 EmDash site with no host token).
 */
export async function readAgentTokenCustody({ label, config }) {
  const siteDir = path.join(config.privateRoot, label)
  const shape = await siteShape(siteDir)
  if (shape === 'unknown') return { token: null, complete: false, custody: 'unknown' }
  // Joomla and WordPress keep the single read, and the mint, they have always had — read without
  // waiting, so a FIFO (or anything but a regular file) there refuses instead of hanging the door.
  if (shape === 'other') {
    const token = await readTokenFile(path.join(siteDir, 'tracy-agent.token'))
    if (token === undefined) return { token: null, complete: false, custody: 'unknown' }
    return token ? { token, complete: true } : { token: null, complete: false }
  }

  const custody = await tokenMountCustody(siteDir)
  if (custody === 'unknown') return { token: null, complete: false, custody: 'unknown' }
  // `lstat`, so a dangling symlink counts as present; any error but ENOENT is not proof of absence.
  const hostStat = await lstat(path.join(siteDir, 'tracy-agent.token')).then(
    (s) => s,
    (err) => (err?.code === 'ENOENT' ? 'absent' : 'indeterminate')
  )
  if (hostStat === 'indeterminate') return { token: null, complete: false, custody: 'unknown' }
  const hostFile = hostStat === 'absent' ? 'absent' : 'present'

  if (custody === 'protected') {
    // 🔒 A PROTECTED BIND WHOSE HOST FILE IS GONE IS REFUSED, NOT RE-MINTED. The running container
    // still reads the inode it was created with; a mint would write a new inode it never sees and
    // revoke the credential it is still presenting — a 200 here and NO_TOKEN for the agent. An
    // EMPTY file keeps its inode, so that case still reaches the mint, which writes through it.
    if (hostFile === 'absent') return { token: null, complete: false, custody: 'unknown' }
    // 🔒 THE PROTECTED FILE MUST BE ONE REGULAR FILE, NOT A NAME FOR ANOTHER (Astra review,
    // 23/09/2026). `readAgentToken` follows links, so a `tracy-agent.token` symlinked (or hard-linked)
    // to `data/tracy-agent.token` read as protected custody and answered 200 — with the PAT sitting in
    // the directory the site's own www-data shell reads. A symlink, a non-regular file or a second
    // link to the inode cannot be proven protected, so it is refused before any token or mint.
    //
    // 🔒 AND IT MUST BE ROOT'S, MODE 0600 (Astra review, 23/09/2026). The bind hands the container
    // the file's own owner and mode, so a token left 0644 — or owned by anyone but root — is one the
    // site's www-data shell can read through `/run/tracy-agent.token`: exactly what the mount exists
    // to prevent. Such a file is refused, not answered; `mint-agent-token.sh` makes the same check.
    // `config.tokenOwnerUid` exists only so the suites can run unprivileged; `readConfig` never sets
    // it, so tracy-host (which runs as 0:0) always demands root.
    const ownerUid = config.tokenOwnerUid ?? 0
    if (
      !hostStat.isFile() ||
      hostStat.nlink !== 1 ||
      hostStat.uid !== ownerUid ||
      (hostStat.mode & 0o7777) !== 0o600
    )
      return { token: null, complete: false, custody: 'unknown' }
    const token = await readProtectedToken(path.join(siteDir, 'tracy-agent.token'), hostStat, ownerUid)
    if (token === undefined) return { token: null, complete: false, custody: 'unknown' }
    return token ? { token, complete: true } : { token: null, complete: false }
  }

  // 🔒 `none` WITH A HOST TOKEN FILE IS A DISAGREEMENT, NOT A LEGACY SITE (23/09/2026). The
  // host file is the protected token; a compose that declares no mount beside it is most likely a
  // protected site whose compose lost the entry while its container kept the bind — and the legacy
  // repair there revokes the credential the container reads, replaces the inode it holds and writes
  // the readable copy back. So the legacy mint runs only for a site PROVEN pre-#155: readable compose,
  // no mount declared, and no host token file at all.
  if (hostFile === 'present') return { token: null, complete: false, custody: 'unknown' }
  return { token: null, complete: false }
}

/**
 * Read the protected host token only as the very file `readAgentTokenCustody` judged by `lstat`.
 *
 * 🔒 NEVER OPEN THE TOKEN BEFORE CUSTODY IS PROVEN (Astra review, 23/09/2026). The door used to read
 * first and check after, and `readFile` on a FIFO — or a symlink to one — with no writer waits
 * forever, so the endpoint hung instead of answering `TOKEN_CUSTODY_UNKNOWN`. The caller checks
 * the path with `lstat` first; this opens it with `O_NOFOLLOW | O_NONBLOCK` (a link or a FIFO
 * swapped in afterwards cannot block or be followed) and re-checks the open descriptor against the
 * same inode, owner and mode before reading a byte.
 *
 * @param {string} tokenPath
 * @param {import('node:fs').Stats} expected - the `lstat` the caller already accepted.
 * @param {number} ownerUid
 * @returns {Promise<string|undefined>} the trimmed token, or `undefined` when the path is no longer
 *   that file (the caller refuses).
 */
async function readProtectedToken(tokenPath, expected, ownerUid) {
  let handle
  try {
    handle = await open(tokenPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
    const held = await handle.stat()
    if (
      !held.isFile() ||
      held.dev !== expected.dev ||
      held.ino !== expected.ino ||
      held.nlink !== 1 ||
      held.uid !== ownerUid ||
      (held.mode & 0o7777) !== 0o600
    )
      return undefined
    return (await handle.readFile('utf8')).trim()
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * The Content API relay PAT of one EmDash site: `$privateRoot/<label>/tracy-content.token`, which
 * `provision/platform/emdash.sh` generates for an image built with the Content API reader. Scope
 * `content:read` only, and never mounted into the container (the container holds its SHA-256).
 *
 * Nothing is minted here: a site without the file is a site whose image has no reader, and the
 * answer is null. The file must be what provision leaves — one root-owned 0600 regular file, the
 * same custody rule as the agent token — or it is not answered.
 *
 * @returns {Promise<string | null>}
 */
export async function readContentToken({ label, config }) {
  const file = path.join(config.privateRoot, label, 'tracy-content.token')
  const ownerUid = config.tokenOwnerUid ?? 0
  const held = await lstat(file).catch(() => null)
  if (!held?.isFile() || held.nlink !== 1 || held.uid !== ownerUid || (held.mode & 0o7777) !== 0o600)
    return null
  const token = await readProtectedToken(file, held, ownerUid)
  return typeof token === 'string' && /^ec_pat_[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

/**
 * The codes `provision/mint-agent-token.sh` names its own failures with, and the status each is
 * worth at this door. They exist so `custody: unavailable` on the other side can say WHICH thing
 * is wrong: "the site is not running" and "the component was never installed" are one message
 * apart for the person reading it and a whole different repair.
 *
 * `BAD_LABEL` is unreachable through `/_host/agent-token` — `SAFE_LABEL` refuses the same shapes
 * one layer earlier. It is listed anyway so that a day the two patterns drift apart names itself
 * here instead of arriving as a generic failure nobody can trace back to a regex.
 *
 * ⚠ `NOT_JOOMLA` OUTLIVED ITS NAME, DELIBERATELY. Since 20/09/2026 the script mints for EmDash
 * too, so that code now means "neither Joomla nor EmDash" — WordPress, or a site whose shape says
 * nothing. The name is kept because it is a wire code: it is asserted in this app's tests, read by
 * `pairComponent`, and may already be sitting in a fleet operator's runbook. Renaming it would
 * gain a tidier word and cost a silent 500 wherever the old one is still matched.
 */
export const MINT_TOKEN_STATUS = Object.freeze({
  BAD_LABEL: 400,
  SITE_UNKNOWN: 404,
  NOT_JOOMLA: 409,
  SITE_DOWN: 409,
  COMPONENT_NOT_INSTALLED: 409,
  // EmDash's counterpart to `COMPONENT_NOT_INSTALLED`: the site container was reached and ran the
  // minter, and what came back was not a PAT. A CONFLICT, not a 500 — the host did its part and
  // the site declined, which is a different repair from the script dying.
  // ⚠ One letter from `MINT_FAILED` below and nothing like it: that one is the fallback for a
  // script that ended without naming itself at all, and it is a 500.
  EMDASH_MINT_REFUSED: 409,
  // The site's compose file is not exactly a form the fleet writes, or disagrees with the host
  // token file (`tokenMountCustody` above; the script runs the same table).
  // A CONFLICT: minting would replace an inode a container may be holding, so nothing is written
  // until the compose file is back to a known custody.
  // The same code covers a compose file that binds the host token read-only while the host file is
  // gone: minting would create an inode the container never sees and revoke the one it still
  // reads, so the repair is the staged recovery (`emdash/README.md`), never this door.
  TOKEN_CUSTODY_UNKNOWN: 409
})

/**
 * `POST /_host/agent-token`'s mint — `provision/mint-agent-token.sh` for a label whose token file
 * does not exist. A site provisioned before that file was collected has no other way to ever get
 * one: only a provision wrote it, and a standing site is never provisioned again.
 *
 * 🔒 NO `logPath`, AND THAT IS THE POINT, NOT AN OMISSION. Every other job in this file streams
 * its script's output into `${logDir}/…` — this one must not, because the script's last line is
 * the site's write key. The `tail` this gets back holds it too, which is why nothing below ever
 * puts `tail` into an answer or a job record: the token reaches the caller by being READ BACK off
 * disk (`readAgentToken`), never by being parsed out of a stream.
 *
 * @param {object} input
 * @param {string} input.label - already validated by the caller (`SAFE_LABEL`).
 * @param {object} input.config - needs `scriptsDir`, `privateRoot`, `sitesRoot`.
 * @param {Function} input.run - `run.js`'s `runScript` (or a test fake with the same shape).
 * @returns {Promise<{token: string} | {error: string, status: number, detail: string}>}
 */
export async function mintAgentToken({ label, config, run }) {
  const { code, tail } = await run({
    script: 'bash',
    args: [path.join(config.scriptsDir, 'provision/mint-agent-token.sh'), '--label', label],
    // The same translation `runIngressUpdate` does for the Cloudflare names: this host's config
    // spells the two roots `privateRoot`/`sitesRoot`, `lib/roots.sh` reads them as TRACY_*. Passed
    // explicitly rather than inherited, so the script works off the values THIS process was
    // configured with, not whatever happens to be in its environment.
    env: {
      ...process.env,
      TRACY_PRIVATE_ROOT: config.privateRoot,
      TRACY_SITES_ROOT: config.sitesRoot,
      // The owner the protected token must have — the door's own value, never an inherited one, so
      // the script and `readAgentTokenCustody` cannot disagree about it (root unless a test says so).
      TRACY_TOKEN_OWNER_UID: String(config.tokenOwnerUid ?? 0)
    }
  })

  if (code === 0) {
    const token = await readAgentToken({ label, config })
    if (token) return { token }
  }

  // `TRACY_ERROR <CODE>` alone on a line, `!! <why>` on the next — the script's own contract. The
  // LAST marker wins: a failure is the end of that script, so anything after it is noise.
  let named = null
  let detail = ''
  for (const line of tail) {
    const marked = /^TRACY_ERROR (\S+)$/.exec(line.trim())
    if (marked) named = marked[1]
    else if (line.startsWith('!! ')) detail = line.slice(3).trim()
  }
  const known = named && Object.hasOwn(MINT_TOKEN_STATUS, named) ? named : null
  return {
    // Exit 0 with no token file is not a case the script has, but it is the one this would fall
    // into if it ever grew one — reported as a failure rather than as an empty success.
    error: known ?? 'MINT_FAILED',
    status: known ? MINT_TOKEN_STATUS[known] : 500,
    detail: detail.slice(0, 200)
  }
}

/**
 * `POST /_host/address` — one ingress rule, added through the Cloudflare API (`ingress_api.py`),
 * the same branch `provision.sh:504-505` takes when `TRACY_CF_API_TOKEN`/`TRACY_TUNNEL_ID` are
 * set: prod1 runs `cloudflared --token-file`, so tunnel configuration is remote, and `ingress.py`
 * (the file-editing sibling) would edit a file nothing on that host reads. `config.cloudflare`
 * gates this the same way `readArtifactStore`-shaped config gates a feature elsewhere in this
 * migration: unset = the door answers `NOT_CONFIGURED` before anything runs.
 *
 * @param {object} input
 * @param {{hostname: string, port?: number, remove?: boolean, dns?: boolean}} input.body - `remove`
 *   takes the rule (and with `dns` the record) away; `port` is then not read.
 * @param {object} input.config - needs `scriptsDir`, `cloudflare` ({token, account, tunnel}).
 * @param {Function} input.run
 * @returns {Promise<{code: number, tail: string[]}>}
 */
export async function runIngressUpdate({ body, config, run }) {
  const scriptPath = path.join(config.scriptsDir, 'provision', 'ingress_api.py')
  const env = {
    ...process.env,
    // Translating this host's own config names into the names `ingress_api.py` itself reads
    // (py's own module doc: "Reads TRACY_CF_API_TOKEN, TRACY_CF_ACCOUNT_ID and TRACY_TUNNEL_ID
    // from the environment") — same shape as `provisionArgs` translating `privateRoot` to `--root`.
    TRACY_CF_API_TOKEN: config.cloudflare.token,
    TRACY_CF_ACCOUNT_ID: config.cloudflare.account,
    TRACY_TUNNEL_ID: config.cloudflare.tunnel
  }
  return run({
    script: 'python3',
    args: [
      scriptPath,
      '--hostname',
      String(body.hostname),
      // `--replace`: every hostname this door is given is a Tracy address (a site's managed name, a
      // demo's) — its own by name. A customer's own domain never comes this way (`go-live.sh` adds
      // those, and never over a rule that leads to another site).
      ...(body.remove ? ['--remove'] : ['--port', String(body.port), '--replace']),
      ...(body.dns ? ['--dns'] : [])
    ],
    env
  })
}

/** `go-live.sh`'s exit code for "another go-live of this site holds its lock" (EX_TEMPFAIL). */
export const GO_LIVE_BUSY_EXIT = 75

/**
 * Run `go-live.sh` as a background job — the counterpart to Python's `go_live()` (py:450-479),
 * called from `app.js`'s `/_host/go-live` handler without being awaited.
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {object} input.body - `{label, op, domains, jobKey?}`; `op` is `live`, `draft`,
 *   `drop-domain`, or `teardown` — which runs `teardown.sh` instead, with the names and folders
 *   `runTeardownJob` (`provision.js`) hands it.
 * @param {object} input.config - needs `privateRoot`, `scriptsDir`, `logDir`, and `jobsDir` for a
 *   teardown; `cloudflare` when this host has a tunnel.
 * @param {{put: Function, get: Function}} input.jobs
 * @param {Function} input.run
 */
export async function runGoLiveJob({ jobId, body, config, jobs, run }) {
  const label = body.label
  const op = body.op
  const domains = Array.isArray(body.domains) ? body.domains : []
  const teardown = op === 'teardown'
  const logPath = path.join(config.logDir, `${teardown ? 'teardown' : 'go-live'}-${label}.log`)

  await jobs.put(jobId, { state: 'running', step: `go-live:${op}`, label })

  const args = teardown
    ? [
        path.join(config.scriptsDir, 'provision', 'teardown.sh'),
        '--label',
        String(label),
        '--root',
        String(config.privateRoot)
      ]
    : [
        path.join(config.scriptsDir, 'provision', 'go-live.sh'),
        '--label',
        String(label),
        '--op',
        String(op),
        '--root',
        String(config.privateRoot)
      ]
  for (const domain of domains) args.push('--domain', String(domain))
  // The route generation of this run (`goLiveRoute` checked it is a positive integer).
  if (!teardown && Number.isSafeInteger(body.routeGen)) args.push('--route-gen', String(body.routeGen))

  // 🔒 THE SAME THREE NAMES `runIngressUpdate` TRANSLATES, AND FOR THE SAME REASON. `go-live.sh`
  // hands the customer's domain to `ingress_api.py`, which reads `TRACY_CF_API_TOKEN`,
  // `TRACY_CF_ACCOUNT_ID` and `TRACY_TUNNEL_ID` from its environment — names this host's own
  // config spells `CLOUDFLARE_TOKEN`/`_ACCOUNT`/`_TUNNEL`. `/_host/address` translated them;
  // this job did not, and nothing said so:
  //
  //   ==> noindex: REMOVED (site is indexed)
  //   need TRACY_CF_API_TOKEN, TRACY_CF_ACCOUNT_ID and TRACY_TUNNEL_ID
  //   TRACY_RESULT go_live=live label=tracydemo
  //
  // Exit 0. Measured 11/09 on the dev host: the job reported DONE, the flag flipped to published,
  // mail opened, noindex lifted — and the domain the customer actually came for never reached the
  // tunnel. A site that is live everywhere except at its own address.
  //
  // 🔒 ONLY WHEN THIS HOST HAS A TUNNEL. The route refuses an ask that names a domain on a host with
  // no tunnel configuration (`NOT_CONFIGURED`); an ask without one is run here all the same — a
  // publish at the Tracy address touches no tunnel — and this used to dereference `null` for it.
  // The three names are then left exactly as they are in this process's environment, never invented:
  // a draft that finds domains on the site's own record with no way to reach the tunnel ends
  // non-zero in the script, saying which.
  const env = publicOriginEnv(body)
  if (config.cloudflare) {
    env.TRACY_CF_API_TOKEN = config.cloudflare.token
    env.TRACY_CF_ACCOUNT_ID = config.cloudflare.account
    env.TRACY_TUNNEL_ID = config.cloudflare.tunnel
  }
  // A shard host (`TRACY_TUNNEL=catch-all`): the scripts write and remove no tunnel rule at all.
  if (config.tunnelMode === 'catch-all') env.TRACY_TUNNEL = 'catch-all'
  if (teardown) {
    // What `runTeardownJob` hands `teardown.sh`, for the reasons written there: "no tunnel" is said
    // rather than left to be inferred, and the script is told where this host keeps the site's job
    // records and logs.
    if (!config.cloudflare && config.tunnelMode !== 'catch-all') env.TRACY_TUNNEL = 'none'
    env.JOBS_DIR = config.jobsDir
    env.HOOK_LOG_DIR = config.logDir
  }

  // 🔒 A RECORD IS THE SCRIPT'S OUTCOME ONLY WHEN IT CARRIES THE SCRIPT'S OWN EXIT CODE. `run` can
  // throw with the script still at work (its log could not be written), and the record of an ending
  // can fail to reach the disk. Neither says what the script did, so neither is written as `done` or
  // as a failure of the script: the record says `unobserved`, carries no exit code, and a caller
  // asking again under the same key has the job run again (`goLiveRoute`, `hasOutcome`).
  const unobserved = (why, how = {}) =>
    jobs
      .put(jobId, {
        state: 'failed',
        step: `go-live:${op}`,
        exitCode: null,
        busy: false,
        unobserved: true,
        // What IS known about the ending, kept apart from an exit code: the signal that ended the
        // script (`run.js`), and whether it was this host's own time limit.
        signal: typeof how.signal === 'string' ? how.signal : null,
        timedOut: how.timedOut === true,
        output: null,
        detail: String(why?.message ?? why).slice(0, 200)
      })
      .catch(() => {})

  let ended
  try {
    ended = await run({ script: 'bash', args, env, logPath })
  } catch (error) {
    await unobserved(error)
    return
  }
  const { code, tail } = ended ?? {}
  // 🔒 A SIGNAL, A TIME LIMIT OR A SCRIPT THAT NEVER STARTED IS NOT THE SCRIPT'S OWN ENDING. A signal
  // ends the shell this host started; what that shell had started — the tunnel call, a compose
  // restart — may still be running and still hold the site's lock. `run.js` reports each of these
  // without an exit code (`code: null` with `signal`, `spawnError` or `timedOut`); a `timedOut` run
  // that carries a number is still not the script ending by itself. None is written as the script's
  // failure: the record says `unobserved`, and the same key runs the job again (it ends `busy`,
  // having changed nothing, while an earlier run still holds the lock).
  if (!Number.isInteger(code) || ended?.timedOut === true || typeof ended?.signal === 'string') {
    await unobserved(
      typeof ended?.signal === 'string'
        ? `the script was ended by ${ended.signal}`
        : ended?.timedOut === true
          ? 'the script was stopped at its time limit'
          : typeof ended?.spawnError === 'string'
            ? `the script could not be started: ${ended.spawnError}`
            : 'the script ended without an exit code',
      { signal: ended?.signal, timedOut: ended?.timedOut }
    )
    return
  }
  try {
    await jobs.put(jobId, {
      state: code === 0 ? 'done' : 'failed',
      step: `go-live:${op}`,
      exitCode: code,
      unobserved: false,
      signal: null,
      timedOut: false,
      // The script found the site held by an earlier go-live and changed nothing: the job ended,
      // the operation did not. A caller must not read this as how the flip went (`goLiveRoute`).
      busy: code === GO_LIVE_BUSY_EXIT,
      output: Array.isArray(tail) ? tail.join('\n') : ''
    })
  } catch (error) {
    await unobserved(error)
  }
}

/** `os.path.isdir` (py) — exported so `app.js`'s `goLiveRoute` can reuse it for its own
 * `no such site` 404 check (py's `_go_live`, py: `os.path.isdir(f"/srv/tracy/{label}")`) instead
 * of a second copy. */
export async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * `core-manifest-write` — py:744-777. Not a script job: it writes
 * `${privateRoot}/<label>/core-manifest.json` directly, for `webroot-edit.sh`'s own Core-area gate
 * to read (ADR 0070) instead of falling back to its default list. Called from `app.js`'s
 * `/_host/site` handler, which answers `202 {jobId}` with the job already `done` — there is no
 * background step here for a poller to catch mid-flight.
 *
 * DELIBERATELY STRICTER than Python on the label — the label is the caller's responsibility to
 * validate with `SAFE_LABEL` before calling this (see `app.js`'s `siteJobRoute`), not `SAFE_ARG`.
 * Python's own `_site` validates this with `SAFE_ARG` (py:750), which allows `/` and `..`, then
 * interpolates the label straight into `f"/srv/tracy/{label}"` (py:751-752) — an arbitrary file
 * read/write off this host for a crafted label. Same class of gap `SAFE_LABEL` already closed for
 * `/_host/provision` and `/_host/agent-token` — the third and fourth disclosed departures from
 * fidelity, all for the identical reason.
 *
 * @param {object} input
 * @param {string} input.label - already validated by the caller (`SAFE_LABEL`).
 * @param {*} input.contentBase64
 * @param {object} input.config - needs `privateRoot`.
 * @returns {Promise<{ok: true, extensions: number} | {error: string, status: number}>}
 */
export async function writeCoreManifest({ label, contentBase64, config }) {
  const siteDir = path.join(config.privateRoot, label)
  if (!(await isDirectory(siteDir))) return { error: 'no such site', status: 404 }

  // py:754 — checked as a plain string, not `!contentBase64.trim()` or similar: an empty string is
  // already falsy, so this reads exactly as Python's `not raw` does.
  if (typeof contentBase64 !== 'string' || !contentBase64 || contentBase64.length > MAX_CORE_MANIFEST) {
    return { error: 'need contentBase64 (max ~1.5MB)', status: 400 }
  }

  let decoded
  let manifest
  try {
    decoded = strictBase64Decode(contentBase64)
    manifest = JSON.parse(decoded.toString('utf8'))
    if (typeof manifest.platform !== 'string' || !Array.isArray(manifest.extensions)) {
      throw new Error('not a core manifest')
    }
  } catch {
    return { error: 'refused contentBase64: not a core manifest', status: 400 }
  }

  const target = path.join(siteDir, 'core-manifest.json')
  // Atomic — same discipline as jobs.js's putJob: write to a temp file, then rename over the real
  // one, so a reader (webroot-edit.sh's own gate) never opens a half-written manifest. The random
  // suffix (jobs.js's own reasoning) keeps two concurrent writes for the same label from stepping
  // on each other's temp file; Python's single fixed `.tmp` name doesn't guard against that, a gap
  // this port closes without changing what a caller observes.
  const tmp = `${target}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, decoded)
  await rename(tmp, target)

  return { ok: true, extensions: manifest.extensions.length }
}
