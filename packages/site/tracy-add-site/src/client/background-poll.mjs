/**
 * One round of the background poll in `index.tsx`: ask after every pending build this browser holds
 * that no wizard is showing, and stop asking once the answer can no longer change.
 *
 * 🔒 EVERY BUILD IS ASKED AFTER UNTIL IT SETTLES, AND NEVER AFTER (#362). Before, a build whose site
 * was deleted answered 403 on every round, read as "ask again", and was asked every 10 s for the
 * rest of the session (measured ~70 min). A settled build — done, failed, or gone — is asked once
 * per page load at most: that one read is how a pointer restored after a reload is checked, not
 * resumed.
 *
 * - `done` on a build nobody is looking at: the pointer is forgotten (its handover happened on that
 *   very read — the job door finishes it).
 * - `failed`: the pointer stays, so the failure survives a refresh until "Try again" in the wizard.
 * - `gone` (403/404): the pointer is forgotten under every key; there is nothing left to show.
 * - `unknown` (network, 5xx): asked again next round.
 *
 * A build on screen (`onScreen`) is its wizard's to watch — one watcher per build, not two.
 * @param {{
 *   store: () => Storage | null,
 *   poll: (siteKey: string, jobId: string) => Promise<{state: string, pollIssue?: 'signed_out'}>,
 *   allPending: (store: Storage | null) => Array<{siteKey: string, jobId: string}>,
 *   clearJob: (store: Storage | null, jobId: string) => void,
 *   onScreen: Set<string>
 * }} deps
 * @returns {() => void} One round; call it on each tick.
 */
export function backgroundPoller({ store, poll, allPending, clearJob, onScreen }) {
  const settled = new Set()
  // A slow answer must not stack a second request for the same job behind it.
  const inFlight = new Set()
  return () => {
    const held = store()
    if (held === null) return
    for (const pending of allPending(held)) {
      const { siteKey, jobId } = pending
      if (settled.has(jobId) || inFlight.has(jobId) || onScreen.has(jobId)) continue
      inFlight.add(jobId)
      void poll(siteKey, jobId)
        .then((job) => {
          if (
            job.pollIssue !== 'signed_out' &&
            job.state !== 'done' &&
            job.state !== 'failed' &&
            job.state !== 'gone'
          )
            return
          settled.add(jobId)
          if (job.state === 'gone') clearJob(held, jobId)
          else if (job.state === 'done' && !onScreen.has(jobId)) clearJob(held, jobId)
        })
        .catch(() => undefined)
        .finally(() => inFlight.delete(jobId))
    }
  }
}
