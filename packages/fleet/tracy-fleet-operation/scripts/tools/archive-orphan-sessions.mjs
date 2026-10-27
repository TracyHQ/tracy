#!/usr/bin/env node
// archive-orphan-sessions — move the session folders of sites that no longer exist out of the host
// dsh's live store, into `<dsh home>/sessions-archive/<label>-<UTC stamp>/`. One-off, for operators.
//
// WHY. dsh answers `session/list` by reading the header of every session in its store at each page
// load, for every site on the host. Until 28/09/2026 deleting a site left its session folder there:
// on the local stand 1,190 of 1,202 sessions sat in the folders of 33 deleted sites
// (tasks/ban-giao-session-list-quet-ca-host-2026-09-28.md). Since then the delete door archives the
// folder itself (`/gateway/seat/archive-sessions`); this cleans up what was left before, and any
// folder a delete could not move (its answer carried `sessionsReason`).
//
// 🔒 DRY RUN BY DEFAULT. Without `--apply` it only lists. With `--apply` each folder moves by ONE
// rename(2) — never a copy, never a delete — so moving it back to `sessions/--site-<label>--`
// restores it, and a rename that fails leaves it where it was.
//
// The rules are the delete door's (`vendor/tracy/dsh-passwords/src/tracy/session-archive.ts`), with the
// same reasons; `scripts/test/session-archive-parity.test.ts` holds the two to one verdict per
// folder. A folder is left, and named, when its site folder still exists, when a session in it
// belongs to another path (dsh's folder name is lossy: `/site/a-b` and `/site/a/b` share one), when
// a header cannot be read, or while a fresh Tracy lease names one of its sessions. One rule only a
// sweep needs: an EMPTY site mount refuses the whole run, because a mount that is missing looks
// exactly like that, and then every site looks deleted.
//
// Usage (Node ≥ 22.15 for zstd; nothing to install):
//   node archive-orphan-sessions.mjs --dsh-home <dir> --sites-root <dir> [--apply] [--json]
//                                    [--allow-empty-sites-root]
// `--dsh-home` defaults to $DSH_HOME, `--sites-root` to $TRACY_SITES_ROOT.
//
// On a fleet host, run it where the store and the mount have the paths dsh gave them, as the user
// dsh writes as:
//   docker cp archive-orphan-sessions.mjs tracy-dsh:/tmp/
//   docker exec tracy-dsh node /tmp/archive-orphan-sessions.mjs --dsh-home /desk-home --sites-root /site
//   docker exec tracy-dsh node /tmp/archive-orphan-sessions.mjs --dsh-home /desk-home --sites-root /site --apply
import { lstat, mkdir, open, readdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createZstdDecompress } from 'node:zlib'

export const SESSIONS_DIR = 'sessions'
export const ARCHIVE_DIR = 'sessions-archive'
export const LEASES_DIR = 'leases'
export const SITE_MOUNT = '/site'
export const LEASE_FRESH_MS = 120_000
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const GENERATION = /^session\.v\d+\.jsonl(\.zstd)?$/
const HEADER_READ_BYTES = 64 * 1024
/** dsh's folder for `/site/<label>` (`projectKey`, session-persistence-jsonl/src/format.ts). */
const SITE_FOLDER = /^--site-(.+)--$/

export const siteWorkspacePath = (label) => `${SITE_MOUNT}/${label}`
export const siteSessionFolderName = (label) => `--site-${label}--`
export const archiveStamp = (now) =>
  new Date(now)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')

async function kindOf(target) {
  try {
    return (await lstat(target)).isDirectory() ? 'directory' : 'other'
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing'
    throw error
  }
}

/** The first line of a generation file; the header is the first zstd frame, read no further. */
export async function readHeaderLine(file) {
  const handle = await open(file, 'r')
  let head
  try {
    const buffer = Buffer.alloc(HEADER_READ_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEADER_READ_BYTES, 0)
    head = buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  if (!file.endsWith('.zstd')) {
    const text = head.toString('utf8')
    const end = text.indexOf('\n')
    return end === -1 ? undefined : text.slice(0, end)
  }
  return new Promise((resolve) => {
    const decoder = createZstdDecompress()
    let text = ''
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      decoder.destroy()
      resolve(value)
    }
    decoder.on('data', (chunk) => {
      text += chunk.toString('utf8')
      const end = text.indexOf('\n')
      if (end !== -1) settle(text.slice(0, end))
    })
    decoder.on('error', () => settle(undefined))
    decoder.on('end', () => settle(undefined))
    decoder.end(head)
  })
}

function headerFields(line) {
  if (line === undefined) return undefined
  try {
    const value = JSON.parse(line)
    if (value?.type !== 'session' || typeof value.id !== 'string' || typeof value.cwd !== 'string')
      return undefined
    return { id: value.id, cwd: value.cwd }
  } catch {
    return undefined
  }
}

async function freshLeaseSessions(dshHome, now) {
  const dir = path.join(dshHome, LEASES_DIR)
  const ids = new Set()
  let names
  try {
    names = await readdir(dir)
  } catch {
    return ids
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = path.join(dir, name)
    try {
      if (now - (await lstat(file)).mtimeMs > LEASE_FRESH_MS) continue
      const lease = JSON.parse(await readFile(file, 'utf8'))
      if (typeof lease?.sessionId === 'string') ids.add(lease.sessionId)
    } catch {
      // A lease that vanished between the listing and the read has just been released.
    }
  }
  return ids
}

/**
 * Whether `label`'s session folder may leave the store — the delete door's rules, touching nothing.
 * @returns {Promise<{ok: true, folder: string, sessionIds: string[]} | {ok: false, reason: string, detail: string}>}
 */
export async function inspectSiteSessions({ dshHome, sitesRoot, label, now = Date.now() }) {
  if (!LABEL.test(label))
    return { ok: false, reason: 'INVALID_LABEL', detail: `not a site label: ${JSON.stringify(label)}` }
  if (!path.isAbsolute(dshHome) || !path.isAbsolute(sitesRoot))
    return {
      ok: false,
      reason: 'STORE_MISSING',
      detail: 'the dsh home and the site mount must be absolute paths'
    }
  if ((await kindOf(sitesRoot)) !== 'directory')
    return { ok: false, reason: 'SITE_MOUNT_MISSING', detail: `${sitesRoot} is not a directory here` }
  if ((await kindOf(path.join(sitesRoot, label))) !== 'missing')
    return {
      ok: false,
      reason: 'SITE_STILL_EXISTS',
      detail: `${path.join(sitesRoot, label)} still exists`
    }
  const store = path.join(dshHome, SESSIONS_DIR)
  if ((await kindOf(store)) !== 'directory')
    return { ok: false, reason: 'STORE_MISSING', detail: `${store} is not a directory here` }
  const folder = path.join(store, siteSessionFolderName(label))
  const folderKind = await kindOf(folder)
  if (folderKind === 'missing')
    return { ok: false, reason: 'NO_SESSION_FOLDER', detail: `${folder} does not exist` }
  if (folderKind !== 'directory')
    return { ok: false, reason: 'AMBIGUOUS_FOLDER', detail: `${folder} is not a plain directory` }

  const expected = siteWorkspacePath(label)
  const sessionIds = []
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(folder, entry.name)
    const generations = (await readdir(dir)).filter((name) => GENERATION.test(name)).sort()
    for (const name of generations) {
      let header
      try {
        header = headerFields(await readHeaderLine(path.join(dir, name)))
      } catch {
        header = undefined
      }
      if (header === undefined)
        return {
          ok: false,
          reason: 'AMBIGUOUS_FOLDER',
          detail: `cannot read the header of ${path.join(entry.name, name)}`
        }
      if (header.cwd !== expected)
        return {
          ok: false,
          reason: 'AMBIGUOUS_FOLDER',
          detail: `${entry.name} belongs to ${JSON.stringify(header.cwd)}, not ${expected}`
        }
      if (!sessionIds.includes(header.id)) sessionIds.push(header.id)
    }
  }
  const leased = await freshLeaseSessions(dshHome, now)
  const busy = sessionIds.filter((id) => leased.has(id))
  if (busy.length > 0)
    return { ok: false, reason: 'SESSION_ACTIVE', detail: `a fresh lease still holds ${busy.join(', ')}` }
  return { ok: true, folder, sessionIds }
}

/** Move `label`'s folder into the archive once `inspectSiteSessions` clears it. */
export async function archiveSiteSessions({ dshHome, sitesRoot, label, now = Date.now() }) {
  const inspected = await inspectSiteSessions({ dshHome, sitesRoot, label, now })
  if (!inspected.ok) return inspected
  const archive = path.join(dshHome, ARCHIVE_DIR)
  await mkdir(archive, { recursive: true, mode: 0o700 })
  const base = `${label}-${archiveStamp(now)}`
  let name = base
  for (let n = 1; (await kindOf(path.join(archive, name))) !== 'missing'; n++) name = `${base}-${n}`
  await rename(inspected.folder, path.join(archive, name))
  return { ok: true, archivedTo: name, sessions: inspected.sessionIds.length }
}

/**
 * Every folder in the store, sorted into what the sweep would do with it. Reads only.
 * @returns {Promise<{refused: null | {reason: string, detail: string}, rows: Array<{folder: string, label: string|null, verdict: 'archive'|'live'|'kept'|'not-a-site', reason?: string, detail?: string, sessions?: number}>}>}
 */
export async function planOrphans({ dshHome, sitesRoot, now = Date.now(), allowEmptySitesRoot = false }) {
  if (!path.isAbsolute(dshHome || '') || !path.isAbsolute(sitesRoot || ''))
    return {
      refused: { reason: 'USAGE', detail: '--dsh-home and --sites-root must be absolute paths' },
      rows: []
    }
  const store = path.join(dshHome, SESSIONS_DIR)
  if ((await kindOf(store)) !== 'directory')
    return { refused: { reason: 'STORE_MISSING', detail: `${store} is not a directory here` }, rows: [] }
  if ((await kindOf(sitesRoot)) !== 'directory')
    return {
      refused: { reason: 'SITE_MOUNT_MISSING', detail: `${sitesRoot} is not a directory here` },
      rows: []
    }
  if (!allowEmptySitesRoot && (await readdir(sitesRoot)).length === 0)
    return {
      refused: {
        reason: 'SITE_MOUNT_EMPTY',
        detail: `${sitesRoot} is empty — a missing mount looks exactly like this, and every site would look deleted. Pass --allow-empty-sites-root only if this host truly has no sites.`
      },
      rows: []
    }
  const rows = []
  for (const entry of (await readdir(store, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const match = SITE_FOLDER.exec(entry.name)
    const label = match && LABEL.test(match[1]) ? match[1] : null
    if (!entry.isDirectory() || label === null) {
      rows.push({ folder: entry.name, label: null, verdict: 'not-a-site' })
      continue
    }
    const inspected = await inspectSiteSessions({ dshHome, sitesRoot, label, now })
    if (inspected.ok) {
      rows.push({ folder: entry.name, label, verdict: 'archive', sessions: inspected.sessionIds.length })
    } else if (inspected.reason === 'SITE_STILL_EXISTS') {
      rows.push({ folder: entry.name, label, verdict: 'live' })
    } else {
      rows.push({
        folder: entry.name,
        label,
        verdict: 'kept',
        reason: inspected.reason,
        detail: inspected.detail
      })
    }
  }
  return { refused: null, rows }
}

function parseArgs(argv, env) {
  const options = {
    dshHome: env.DSH_HOME ?? '',
    sitesRoot: env.TRACY_SITES_ROOT ?? '',
    apply: false,
    json: false,
    allowEmptySitesRoot: false
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') options.apply = true
    else if (arg === '--json') options.json = true
    else if (arg === '--allow-empty-sites-root') options.allowEmptySitesRoot = true
    else if (arg === '--dsh-home') options.dshHome = argv[++i] ?? ''
    else if (arg === '--sites-root') options.sitesRoot = argv[++i] ?? ''
    else return { error: `unknown argument: ${arg}` }
  }
  return { options }
}

/**
 * The command line. Returns the exit code: 0 done, 1 a move failed, 2 refused or misused.
 * @param {string[]} argv
 * @param {{env?: Record<string, string|undefined>, out?: (line: string) => void, now?: number}} [io]
 */
export async function main(argv, { env = process.env, out = console.log, now = Date.now() } = {}) {
  const parsed = parseArgs(argv, env)
  if (parsed.error) {
    out(parsed.error)
    out(
      'usage: archive-orphan-sessions.mjs --dsh-home <dir> --sites-root <dir> [--apply] [--json] [--allow-empty-sites-root]'
    )
    return 2
  }
  const { dshHome, sitesRoot, apply, json, allowEmptySitesRoot } = parsed.options
  const plan = await planOrphans({ dshHome, sitesRoot, now, allowEmptySitesRoot })
  if (plan.refused) {
    if (json) out(JSON.stringify({ refused: plan.refused }))
    else out(`refused (${plan.refused.reason}): ${plan.refused.detail}`)
    return 2
  }
  const moved = []
  let failed = 0
  if (apply) {
    for (const row of plan.rows.filter((r) => r.verdict === 'archive')) {
      try {
        // Judged again at the moment of the move: the plan above may be seconds old.
        const result = await archiveSiteSessions({ dshHome, sitesRoot, label: row.label, now })
        if (result.ok)
          moved.push({ folder: row.folder, archivedTo: result.archivedTo, sessions: result.sessions })
        else {
          failed++
          moved.push({ folder: row.folder, reason: result.reason, detail: result.detail })
        }
      } catch (error) {
        failed++
        moved.push({ folder: row.folder, reason: 'ARCHIVE_FAILED', detail: String(error?.message ?? error) })
      }
    }
  }
  const count = (verdict) => plan.rows.filter((r) => r.verdict === verdict)
  const toArchive = count('archive')
  const sessions = toArchive.reduce((sum, r) => sum + (r.sessions ?? 0), 0)
  if (json) {
    out(JSON.stringify({ apply, dshHome, sitesRoot, rows: plan.rows, moved }, null, 2))
    return failed > 0 ? 1 : 0
  }
  out(`dsh home    ${dshHome}`)
  out(`site mount  ${sitesRoot}`)
  for (const row of plan.rows) {
    if (row.verdict === 'archive')
      out(
        `${apply ? 'archive' : 'would archive'}  ${row.folder}  ${row.sessions} session(s) → ${ARCHIVE_DIR}/${row.label}-${archiveStamp(now)}`
      )
    else if (row.verdict === 'live') out(`live site      ${row.folder}`)
    else if (row.verdict === 'kept') out(`kept           ${row.folder}  ${row.reason}: ${row.detail}`)
    else out(`not a site     ${row.folder}`)
  }
  for (const m of moved)
    if (m.reason) out(`NOT MOVED      ${m.folder}  ${m.reason}: ${m.detail}`)
    else out(`moved          ${m.folder} → ${ARCHIVE_DIR}/${m.archivedTo}`)
  out(
    `${toArchive.length} folder(s) of deleted sites (${sessions} sessions), ${count('live').length} live, ` +
      `${count('kept').length} kept, ${count('not-a-site').length} not a site folder.`
  )
  out(
    apply
      ? `Moved ${moved.length - failed}, failed ${failed}.`
      : 'Dry run: nothing moved. Run again with --apply to move them.'
  )
  return failed > 0 ? 1 : 0
}

// No top-level await: `scripts/test/session-archive-parity.test.ts` imports this file through tsx,
// which compiles it as CommonJS there.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
