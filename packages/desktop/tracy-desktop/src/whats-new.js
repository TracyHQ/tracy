/**
 * "What's new" after an update (tasks/todo-desktop-update-policy.md D2–D4; Lee chose Help & about as
 * its home, 11/10): app-level state, not a window's — one main process decides it once per start
 * and every window reads the same answer.
 *
 *   start      compares the running version with `lastRunVersion` (src/update-plan.js
 *              `whatsNewDecision`): a higher minor or major is news → `pending`; both fields land in
 *              ONE write (src/preferences.js), so a crash never records the run without its news.
 *              Unseen news survives restarts until `seen()`.
 *   seen       Help & about showed it: pending goes, the dot goes, in every window.
 *   notify     the switch "Notify me what's new after an update" — only the system notification;
 *              the dot and the box show either way. `notifyOnce` shows at most one per main process.
 */
const { whatsNewDecision } = require('./update-plan.js')

/**
 * @param {{
 *   prefs: { read: () => any, update: (patch: object) => Promise<any> },
 *   running: string,
 *   earlierRun: boolean,
 *   log: (line: string) => void
 * }} deps - `earlierRun`: the app ran on this device before (its updater id, its preferences), which
 *   matters only when no `lastRunVersion` was ever recorded (an app from before this).
 */
function createWhatsNew({ prefs, running, earlierRun, log }) {
  let state = { pending: null, notify: true }
  let notified = false
  const watchers = new Set()
  const publish = () => {
    for (const watcher of watchers) {
      try {
        watcher({ ...state })
      } catch (error) {
        log(`what's new watcher failed: ${error.message}`)
      }
    }
  }
  const take = (saved) => {
    state = { pending: saved.whatsNew.pending, notify: saved.whatsNew.notify }
    publish()
  }

  return {
    async start() {
      const saved = prefs.read().whatsNew
      state = { pending: saved.pending, notify: saved.notify }
      const lastRun = saved.lastRunVersion
      const news = whatsNewDecision({ lastRun, running, earlierRun: lastRun === null && earlierRun })
      if (news !== null)
        log(`what's new: ${news.from ?? 'an earlier version'} → ${news.to} (page ${news.page})`)
      if (news === null && lastRun === running) return
      try {
        take(
          await prefs.update({
            whatsNew: news === null ? { lastRunVersion: running } : { pending: news, lastRunVersion: running }
          })
        )
      } catch (error) {
        log(`what's new: could not save this run (${error.message})`)
        if (news !== null) {
          state = { ...state, pending: news }
          publish()
        }
      }
    },
    /** @returns {{ pending: { from: string | null, to: string, page: string } | null, notify: boolean }} */
    current: () => ({ ...state }),
    async seen() {
      if (state.pending === null) return
      log(`what's new: ${state.pending.to} seen`)
      take(await prefs.update({ whatsNew: { pending: null } }))
    },
    async setNotify(on) {
      if (typeof on !== 'boolean') throw new TypeError('notify must be a boolean')
      take(await prefs.update({ whatsNew: { notify: on } }))
    },
    /** Show the one notification of this main process, if there is news and the switch is on. */
    notifyOnce(show) {
      if (notified || state.pending === null || !state.notify) return
      notified = true
      show(state.pending)
    },
    onChange(watcher) {
      watchers.add(watcher)
      return () => watchers.delete(watcher)
    }
  }
}

module.exports = { createWhatsNew }
