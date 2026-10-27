/**
 * One `webroot-history` job per site at a time, shared by every door that asks while it runs.
 *
 * Site changes opens with two doors, `/activity?version=2` (the list) and `/backups` (its
 * milestones), and each ran its own `webroot-history` job: two whole reads of the webroot on the
 * host, back to back (7.1 s and 4.3 s on demo-tb-joomla, local stand 12/10/2026). The history op
 * answers both from the same read, so a second ask joins the job already running.
 *
 * Only a RUNNING job is joined — a finished answer is never handed out again, so nothing here can
 * be stale by more than the time one job takes. And any other job filed for the same site (a
 * backup, a moment, a restore, a write) ends the sharing: a read asked after it runs its own job,
 * so it sees what that job did.
 */

const HISTORY = 'webroot-history'

/**
 * Wrap `runJob(site, input, deadlineMs, onJob, options)` so concurrent history reads of one site
 * share one host job. Every other call goes straight through.
 * @template {(site: any, input: any, ...rest: any[]) => Promise<any>} T
 * @param {T} runJob
 * @returns {T}
 */
export function shareHistoryJobs(runJob) {
  /** @type {Map<string, Promise<any>>} site key → the history job running for it */
  const running = new Map()
  // @ts-ignore — the wrapper has runJob's own signature.
  return (site, input, ...rest) => {
    const key = String(site?.site_key ?? '')
    // `onJob` (a door tying its own row to the job id) needs a job of its own.
    if (input?.kind !== HISTORY || typeof rest[1] === 'function' || !key) {
      running.delete(key)
      return runJob(site, input, ...rest)
    }
    const open = running.get(key)
    if (open) return open
    // Called at once (an async wrapper runs synchronously up to its first await), so a second ask
    // in the same tick already finds it.
    const job = (async () => runJob(site, input, ...rest))().finally(() => {
      if (running.get(key) === job) running.delete(key)
    })
    running.set(key, job)
    return job
  }
}
