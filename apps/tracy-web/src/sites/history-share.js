/**
 * One `webroot-history` job per site at a time, shared by every door that asks while it runs.
 *
 * Site changes opens with two doors, `/activity?version=2` (the list) and `/backups` (its
 * milestones), and each ran its own `webroot-history` job: two whole reads of the webroot on the
 * host, back to back (7.1 s and 4.3 s on demo-tb-joomla, local stand 12/10/2026). The history op
 * answers both from the same read, so a second ask joins the job already running.
 *
 * Only a RUNNING job is joined (including one whose HTTP wait expired) — a finished answer is never handed out again, so nothing here can
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
  /** @type {Map<string, { job: Promise<any> | null, jobId?: string, timer?: ReturnType<typeof setTimeout> }>} */
  const running = new Map()
  const forget = (key) => {
    const entry = running.get(key)
    if (entry?.timer) clearTimeout(entry.timer)
    running.delete(key)
  }
  // @ts-ignore — the wrapper has runJob's own signature.
  return (site, input, ...rest) => {
    const key = String(site?.site_key ?? '')
    if (input?.kind !== HISTORY || typeof rest[1] === 'function' || !key) {
      forget(key)
      return runJob(site, input, ...rest)
    }
    const previous = running.get(key)
    if (previous?.job) return previous.job
    const entry = previous ?? { job: null, jobId: undefined, timer: undefined }
    if (entry.jobId) rest[2] = { ...rest[2], resumeJobId: entry.jobId }
    const job = (async () => runJob(site, input, ...rest))().then(
      (answer) => {
        if (running.get(key) !== entry) return answer
        if (answer?.pending === true && typeof answer.jobId === 'string') {
          entry.job = null
          entry.jobId = answer.jobId
          // Retain only the unfinished job identity, never a completed history response. The
          // bounded retention avoids leaking one entry per disconnected reader indefinitely.
          if (!entry.timer) {
            entry.timer = setTimeout(() => {
              if (running.get(key) === entry) forget(key)
            }, 10 * 60_000)
            entry.timer.unref?.()
          }
        } else forget(key)
        return answer
      },
      (error) => {
        if (running.get(key) === entry) forget(key)
        throw error
      }
    )
    entry.job = job
    running.set(key, entry)
    return job
  }
}
