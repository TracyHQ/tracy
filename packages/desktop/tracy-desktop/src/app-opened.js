/**
 * One foreground-open signal per app copy and UTC+7 day. Only `opened()` creates an event;
 * loads, updater callbacks and the retry timer only deliver events already saved by a focus.
 * The existing updater id is read, never generated. Account identity stays in the existing
 * same-origin session cookie; no page content, navigation, new identifier or account is stored here.
 */
const fs = require('node:fs')
const path = require('node:path')

const DAY_MS = 86_400_000
const RETRY_MS = 5 * 60_000
const MAX_DAYS = 90
const UTC7_MS = 7 * 3_600_000

/** @param {number} at */
function openedDay(at) {
  return new Date(at + UTC7_MS).toISOString().slice(0, 10)
}

/**
 * @typedef {{openedAt: string, version: string, platform: string}} OpenedEvent
 * @typedef {{sent: string[], pending: OpenedEvent[]}} OpenedState
 * @param {{file: string, version: string, platform: string, installId: () => string | null,
 *   send: (event: OpenedEvent & {installId: string}) => Promise<boolean>, log: (line: string) => void,
 *   now?: () => number, timers?: {setTimeout: Function, clearTimeout: Function}}} deps
 */
function createAppOpened(deps) {
  const now = deps.now ?? Date.now
  const timers = deps.timers ?? { setTimeout, clearTimeout }
  /** @type {OpenedState} */
  let state = { sent: [], pending: [] }
  let busy = false
  let stopped = false
  let retry = null
  let retryAt = 0

  try {
    if (fs.statSync(deps.file, { throwIfNoEntry: false })?.size <= 64 * 1024) {
      const saved = JSON.parse(fs.readFileSync(deps.file, 'utf8'))
      if (Array.isArray(saved.sent) && Array.isArray(saved.pending)) {
        state.sent = saved.sent.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
        state.pending = saved.pending
          .filter(
            (event) =>
              typeof event?.openedAt === 'string' &&
              Number.isFinite(Date.parse(event.openedAt)) &&
              typeof event.version === 'string' &&
              typeof event.platform === 'string'
          )
          .map(({ openedAt, version, platform }) => ({ openedAt, version, platform }))
      }
    }
  } catch {
    deps.log('app opened: saved delivery state could not be read')
  }

  /** Save before sending, through a private temporary file and atomic rename. */
  function save() {
    const cutoff = now() - MAX_DAYS * DAY_MS
    state.sent = state.sent.filter((day) => day >= openedDay(cutoff)).slice(-MAX_DAYS)
    state.pending = state.pending.filter((event) => Date.parse(event.openedAt) > cutoff).slice(-MAX_DAYS)
    const tmp = `${deps.file}.${process.pid}.tmp`
    try {
      fs.mkdirSync(path.dirname(deps.file), { recursive: true })
      fs.writeFileSync(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 })
      fs.renameSync(tmp, deps.file)
      return true
    } catch {
      try {
        fs.rmSync(tmp, { force: true })
      } catch {
        // The parent itself may be unavailable; cleanup must not interrupt the app.
      }
      deps.log('app opened: delivery state could not be saved; delivery deferred')
      return false
    }
  }

  function schedule() {
    if (stopped || retry !== null || state.pending.length === 0) return
    retry = timers.setTimeout(
      () => {
        retry = null
        return flush()
      },
      Math.max(RETRY_MS, retryAt - now())
    )
    retry?.unref?.()
  }

  async function flush() {
    if (stopped || busy || state.pending.length === 0) return
    if (now() < retryAt) return schedule()
    busy = true
    try {
      if (!save()) return
      const installId = deps.installId()
      if (installId === null) return
      while (state.pending.length > 0 && !stopped) {
        const event = state.pending[0]
        if (!(await deps.send({ installId, ...event }))) {
          retryAt = now() + RETRY_MS
          break
        }
        state.pending.shift()
        state.sent.push(openedDay(Date.parse(event.openedAt)))
        if (!save()) break
      }
    } catch {
      retryAt = now() + RETRY_MS
      deps.log('app opened: delivery deferred')
    } finally {
      busy = false
      schedule()
    }
  }

  return {
    /** Call only for a visible product window actually gaining focus. */
    opened() {
      if (stopped) return Promise.resolve()
      const at = now()
      const day = openedDay(at)
      if (
        !state.sent.includes(day) &&
        !state.pending.some((event) => openedDay(Date.parse(event.openedAt)) === day)
      ) {
        state.pending.push({
          openedAt: new Date(at).toISOString(),
          version: deps.version,
          platform: deps.platform
        })
        if (!save()) {
          schedule()
          return Promise.resolve()
        }
      }
      return flush()
    },
    flush,
    stop() {
      stopped = true
      if (retry !== null) timers.clearTimeout(retry)
      retry = null
    }
  }
}

module.exports = { createAppOpened, openedDay }
