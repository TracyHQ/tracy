/**
 * The Git half of the Site changes list, shared by the V1 reader (`activity.js`) and the V2 reader
 * (`activity-v2.js`): one `webroot-history` job per page, and what its answer says was left out.
 * Moved here unchanged from `activity.js` so both readers call the very same code.
 */

/** How long one page may wait on the host's `webroot-history` job. */
export const GIT_DEADLINE_MS = 45_000

/** Thrown when the host is still building the site's history for the first time (→ 202). */
export class GitPending extends Error {}

/**
 * The host's Git moments for this site (`webroot-git.sh --op history`), or why there are none.
 * `backups`: the backup points in the answer (`{version, sha}`), so a restore to one can be named by
 * its number (E6.5) — never listed as events.
 * @returns {Promise<{state: 'read'|'failed', rows: any[], hidden: {sha: string, turn: string|null}[],
 *   truncated: boolean|null, backups: {version: number, sha: string}[], sealed?: any}>}
 */
export async function readGit(site, runJob) {
  // `bounded`: each host call gets what is left of the deadline, so a host that stops answering
  // mid-job is a 202 at the deadline, not a request held for the socket's own timeout (BUG-L4-2).
  const job = await runJob(site, { kind: 'webroot-history' }, GIT_DEADLINE_MS, undefined, { bounded: true })
  if (!job.ok) {
    if (job.reason === 'timeout') throw new GitPending()
    return { state: 'failed', rows: [], hidden: [], truncated: null, backups: [] }
  }
  const data = lastJson(job.output)
  if (!data || data.ok !== true || !Array.isArray(data.rows))
    return { state: 'failed', rows: [], hidden: [], truncated: null, backups: [] }
  // Backup rows are milestones read from `/backups` (ADR 0024), never events of this list.
  const rows = data.rows.filter((r) => r && r.kind !== 'backup' && typeof r.sha === 'string')
  const backups = data.rows
    .filter((r) => r && r.kind === 'backup' && typeof r.sha === 'string' && Number.isSafeInteger(r.version))
    .map((r) => ({ version: Number(r.version), sha: String(r.sha) }))
  // Q4's reader names the commits it left out because every file in them is excluded today; an
  // older reader does not, and the list then keeps what Postgres recorded.
  const hidden = Array.isArray(data.hidden)
    ? data.hidden
        .filter((h) => h && typeof h.sha === 'string')
        .map((h) => ({ sha: h.sha, turn: typeof h.turn === 'string' && h.turn ? h.turn : null }))
    : []
  // Q2's reader says when it stopped at its cap; an older one did not, and stopped at 200.
  const truncated = typeof data.truncated === 'boolean' ? data.truncated : rows.length >= 200
  // The seal this very read made (`read_op`'s `sealed`: `{sha, files, at?, parentAt?}`), for the
  // reader to keep as a `site_outside` row as the history door does (E5.1c: so it can fold at once).
  const sealed =
    data.sealed && typeof data.sealed === 'object' && typeof data.sealed.sha === 'string' ? data.sealed : null
  return { state: 'read', rows, hidden, truncated, backups, sealed }
}

/**
 * The number of the backup a restore went back to, or null when the commit it names is no backup
 * point in Git's answer (a reset to a plain moment, or a point past the window).
 * @param {{backups?: {version: number, sha: string}[]}} git
 * @param {string|null|undefined} target a full or short sha
 * @returns {number|null}
 */
export function backupVersionOf(git, target) {
  const short = String(target ?? '')
  if (short.length < 7) return null
  const hits = (git.backups ?? []).filter((b) => b.sha.startsWith(short))
  // Several points on one commit: the newest number, as the history lists it first.
  return hits.length ? Math.max(...hits.map((b) => b.version)) : null
}

/**
 * The turns and commits whose files were ALL excluded (Q4: a CMS cache recorded before the exclude
 * list named it — leemood on dev, three moments of T3's compiled CSS). A turn qualifies only when
 * none of its moments in Git's window kept a file: a turn whose earlier moment held a real edit
 * stays. Postgres keeps such rows as they were recorded; the list leaves them out (`activity-store`).
 * @param {{rows: any[], hidden: {sha: string, turn: string|null}[]}} git
 */
export function cacheOnly(git) {
  const kept = new Set(git.rows.map((r) => r.turn).filter((t) => typeof t === 'string' && t))
  const turns = new Set(git.hidden.map((h) => h.turn).filter((t) => t !== null && !kept.has(t)))
  return { turns: [...turns], shas: git.hidden.map((h) => h.sha) }
}

/** How many files a history row names: a count, or the list of paths. */
export const fileCount = (r) =>
  typeof r.files === 'number' ? r.files : Array.isArray(r.files) ? r.files.length : 0

export function lastJson(output) {
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
