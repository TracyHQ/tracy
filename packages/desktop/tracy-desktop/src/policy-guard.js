/**
 * The minimum version guard (tasks/todo-desktop-update-policy.md C5–C7): what the policy says of the
 * running version, kept true over time. Pure — the store, the check, the clock and the timers come in
 * (test/policy-guard.test.mjs).
 *
 *   start    the stored policy (src/policy-store.js) decides AT ONCE; a check of the feed runs in
 *            parallel, and `start()` resolves when it answers or after START_WAIT_MS, whichever is
 *            first — so the product never waits on the network for long. A late answer is still
 *            taken (`accept`), and the verdict moves then.
 *   accept   a policy from a VERIFIED channel file (this check, or any electron-updater check through
 *            src/signed-feed-provider.js) replaces the stored one only with a higher revision
 *            (src/update-plan.js `acceptPolicy`).
 *   time     warn → blocked by a timer at the deadline, and on `resume()` after a sleep; never by
 *            waiting for the next poll.
 *   recheck  every RECHECK_MS, independent of automatic update checks (a policy check is light metadata
 *            and downloads nothing).
 *
 * `offline` in the verdict: the last check had no answer. A stored "blocked" stays blocked offline
 * (Open questions, chosen 11/10); the blocked screen says so and offers Retry.
 */
const { acceptPolicy, policyOf } = require('./update-plan.js')

const START_WAIT_MS = 1500
const RECHECK_MS = 24 * 60 * 60 * 1000
/** setTimeout's longest wait; a farther deadline is reached in steps. */
const MAX_TIMER_MS = 2 ** 31 - 1

/**
 * @typedef {import('./update-plan.js').PolicyVerdict & { offline: boolean }} GuardVerdict
 * @param {{
 *   running: string,
 *   store: { read: () => any, write: (record: any) => void },
 *   check: () => Promise<{ kind: 'ok', policy: object | null } | { kind: 'refused' | 'unreachable', reason: string }>,
 *   now: () => number,
 *   timers: { setTimeout: Function, clearTimeout: Function },
 *   log: (line: string) => void,
 *   onVerdict?: (verdict: GuardVerdict) => void,
 *   startWaitMs?: number,
 *   recheckMs?: number
 * }} deps
 */
function createPolicyGuard(deps) {
  const { running, store, check, now, timers, log } = deps
  const startWaitMs = deps.startWaitMs ?? START_WAIT_MS
  const recheckMs = deps.recheckMs ?? RECHECK_MS
  let stored = null
  let offline = false
  /** @type {GuardVerdict | null} */
  let verdict = null
  let deadlineTimer = null
  let recheckTimer = null
  let inFlight = null
  let stopped = false

  const same = (a, b) =>
    a !== null &&
    a.level === b.level &&
    a.minimumVersion === b.minimumVersion &&
    a.after === b.after &&
    a.offline === b.offline

  function evaluate() {
    const next = { ...policyOf({ running, policy: stored?.policy ?? null, now: now() }), offline }
    armDeadline(next)
    if (same(verdict, next)) return
    const was = verdict
    verdict = next
    if (was?.level !== next.level || was?.offline !== next.offline)
      log(
        `policy: ${next.level}${next.minimumVersion ? ` (minimum ${next.minimumVersion}${next.after ? `, from ${new Date(next.after).toISOString()}` : ''})` : ''}${offline ? ', offline' : ''}`
      )
    deps.onVerdict?.(next)
  }

  function armDeadline(next) {
    if (deadlineTimer !== null) timers.clearTimeout(deadlineTimer)
    deadlineTimer = null
    if (stopped || next.level !== 'warn' || next.after === null) return
    const wait = Math.max(0, Math.min(next.after - now(), MAX_TIMER_MS))
    deadlineTimer = timers.setTimeout(() => {
      deadlineTimer = null
      evaluate()
    }, wait)
  }

  function accept(policy) {
    if (!acceptPolicy(stored, policy)) return false
    const revision = policy?.policyRevision ?? 0
    stored = { policy: policy ?? null, revision, verifiedAt: now() }
    try {
      store.write(stored)
    } catch (error) {
      log(`policy: could not save revision ${revision}: ${error.message}`)
    }
    log(
      `policy: revision ${revision} accepted${policy?.minimumVersion ? `, minimum ${policy.minimumVersion}` : ', no minimum'}`
    )
    evaluate()
    return true
  }

  function scheduleRecheck() {
    if (recheckTimer !== null) timers.clearTimeout(recheckTimer)
    recheckTimer = stopped
      ? null
      : timers.setTimeout(() => {
          recheckTimer = null
          void refresh('daily')
        }, recheckMs)
  }

  /** One check of the feed; callers of a running one share it. */
  function refresh(why) {
    inFlight ??= (async () => {
      let result
      try {
        result = await check()
      } catch (error) {
        result = { kind: 'unreachable', reason: error?.message ?? String(error) }
      }
      inFlight = null
      if (result.kind === 'ok') {
        offline = false
        log(`policy check (${why}): ok, verified`)
        if (!accept(result.policy)) evaluate()
      } else {
        if (result.kind === 'unreachable') offline = true
        log(`policy check (${why}): ${result.kind}: ${result.reason}`)
        evaluate()
      }
      scheduleRecheck()
      return { outcome: result.kind, verdict: verdict }
    })()
    return inFlight
  }

  return {
    /** @returns {Promise<{ outcome: 'ok' | 'refused' | 'unreachable' | 'timeout', verdict: GuardVerdict }>} */
    start() {
      stored = store.read()
      evaluate()
      const fresh = refresh('start')
      return new Promise((resolve) => {
        const timer = timers.setTimeout(() => {
          offline = true
          log(
            `policy check: timeout after ${startWaitMs} ms; deciding from ${stored ? `stored revision ${stored.revision}` : 'nothing stored'}`
          )
          evaluate()
          resolve({ outcome: 'timeout', verdict })
        }, startWaitMs)
        fresh.then((result) => {
          timers.clearTimeout(timer)
          resolve(result)
        })
      })
    },
    accept,
    /** The Retry of the blocked screen, and a wake: check now. */
    retry: () => refresh('retry'),
    /** After `powerMonitor` `resume`: the clock may have passed the deadline while asleep. */
    resume: () => evaluate(),
    /** @returns {GuardVerdict} */
    current: () => verdict ?? { ...policyOf({ running, policy: null, now: now() }), offline },
    stop() {
      stopped = true
      if (deadlineTimer !== null) timers.clearTimeout(deadlineTimer)
      if (recheckTimer !== null) timers.clearTimeout(recheckTimer)
      deadlineTimer = recheckTimer = null
    }
  }
}

module.exports = { createPolicyGuard, START_WAIT_MS, RECHECK_MS }
