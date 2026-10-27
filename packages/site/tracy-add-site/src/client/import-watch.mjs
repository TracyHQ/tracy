/**
 * The import wizard's watch on the read of the old site, and the handover that follows it, with no
 * React and no real clock. `import-wizard.tsx` wires its state setters in as effects; `node --test`
 * drives the same code with a fake clock and fake doors.
 */

/** Poll period of the read of the old site. */
export const POLL_MS = 2000

/**
 * What a provision answer means for the screen.
 * @param {{ jobId: string } | { code: string }} provisioned
 * @returns {{ at: 'handed_over', jobId: string } | { at: 'handover_failed', code: string }}
 */
export function handoverOutcome(provisioned) {
  return 'jobId' in provisioned
    ? { at: 'handed_over', jobId: provisioned.jobId }
    : { at: 'handover_failed', code: provisioned.code }
}

/**
 * How long a finished run whose host says its own handover is `pending` is waited for before the
 * wizard hands over itself. The host's request takes seconds; this only covers a host that never
 * reaches tracy-web, so the open tab still gets a build (#1652).
 */
export const HOST_HANDOVER_WAIT_MS = 60_000

/**
 * Watch one import run until it ends.
 *
 * 🔒 THE HANDOVER RUNS ONCE, and `latch` is the only thing guaranteeing it: the interval does not
 * wait for the long `provision` await, so a later tick would see `done` again and provision twice
 * (the second loses with 409 ALREADY_PROVISIONED, after the first built the site). A ref, not React
 * state: two adjacent ticks read the same render.
 *
 * 🔒 THE HOST HANDS OVER FIRST (#1652). A finished run carries the host's own handover
 * (`run.handover`): `filed` names the job it filed, and the wizard follows that job without filing
 * one; `pending` is waited for (`HOST_HANDOVER_WAIT_MS`). With no handover on the run (an older host,
 * one that could not queue it), a refused one, or a wait that ran out, the wizard provisions as it
 * always did — tracy-web answers a second request for the same import with the first one's job. Its
 * `TAKEN` is the one answer that can mean "the host's request is in flight right now", so the run is
 * asked once more: a host handover still `pending` then is the host building, and the wizard goes back
 * to following it (no failure is shown for it) until it is `filed`, or given up and asked again here.
 * @param {{
 *   runId: string,
 *   poll: (runId: string) => Promise<'lost' | { state: string, result?: object, error?: string, handover?: { state: string, jobId?: string } } | null>,
 *   provision: (result: object) => Promise<{ jobId: string } | { code: string }>,
 *   latch: { current: boolean },
 *   effects: {
 *     lost: () => void,
 *     failed: (run: any) => void,
 *     progress: (run: any) => void,
 *     handedOver: (jobId: string) => void,
 *     handoverFailed: (code: string, result: object) => void
 *   },
 *   pollMs?: number,
 *   hostWaitMs?: number
 * }} input
 * @returns {() => void} Stop watching.
 */
export function watchImport({
  runId,
  poll,
  provision,
  latch,
  effects,
  pollMs = POLL_MS,
  hostWaitMs = HOST_HANDOVER_WAIT_MS
}) {
  let cancelled = false
  let waited = 0
  /** @param {Awaited<ReturnType<typeof poll>>} run */
  const filedBy = (run) =>
    run && run !== 'lost' && run.handover?.state === 'filed' && typeof run.handover.jobId === 'string'
      ? run.handover.jobId
      : null
  // Set when the wizard's own request met the host's in flight (`TAKEN`): from then on the wizard
  // only follows the host's handover, and asks again itself only if the host gives it up.
  let followingHost = false
  /** @param {{ jobId: string } | { code: string }} provisioned @param {object} result */
  const report = (provisioned, result) => {
    const outcome = handoverOutcome(provisioned)
    if (outcome.at === 'handed_over') effects.handedOver(outcome.jobId)
    else effects.handoverFailed(outcome.code, result)
  }
  /** @param {object} result */
  const handOverItself = async (result) => {
    const provisioned = await provision(result)
    if (!cancelled) report(provisioned, result)
  }
  const tick = async () => {
    const run = await poll(runId)
    if (cancelled || !run) return
    if (run === 'lost') return effects.lost()
    if (run.state === 'error') return effects.failed(run)
    if (run.state === 'done' && run.result) {
      const hostJob = filedBy(run)
      if (followingHost) {
        if (run.handover?.state === 'pending') return effects.progress(run)
        // Synchronously, so a second tick in flight finds nothing left to do.
        followingHost = false
        clearInterval(timer)
        if (hostJob) return effects.handedOver(hostJob)
        return handOverItself(run.result)
      }
      if (latch.current) return
      if (!hostJob && run.handover?.state === 'pending' && waited < hostWaitMs) {
        waited += pollMs
        return effects.progress(run)
      }
      latch.current = true
      clearInterval(timer)
      if (hostJob) return effects.handedOver(hostJob)
      const provisioned = await provision(run.result)
      if (cancelled) return
      if ('code' in provisioned && provisioned.code === 'TAKEN') {
        // One poll period: long enough for a request in flight to be answered and written down.
        await new Promise((resolve) => setTimeout(resolve, pollMs))
        if (cancelled) return
        const again = await poll(runId)
        if (cancelled) return
        const filed = filedBy(again)
        if (filed) return effects.handedOver(filed)
        const latest = again && again !== 'lost' ? again : run
        if (latest.handover?.state === 'pending') {
          // The host's request holds the lock: it is building, so follow it instead of failing.
          followingHost = true
          effects.progress(latest)
          timer = setInterval(() => void tick(), pollMs)
          return
        }
        return handOverItself(run.result)
      }
      return report(provisioned, run.result)
    }
    effects.progress(run)
  }
  let timer = setInterval(() => void tick(), pollMs)
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}
