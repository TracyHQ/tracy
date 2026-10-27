/**
 * The app's own preferences, `<userData>/preferences.json`, one document with three parts:
 * - `autoCheck` — "Check for updates automatically" (Settings › Help & about, src/update-bridge.js);
 * - `onboarding` — whether the first-run screen was closed, how, and which agent was picked
 *   (src/onboarding-bridge.js); `flowVersion` lets a later screen show itself again;
 * - `notifications` — `enabled`: system notifications when an agent's turn ends, and `sound`: the
 *   sound they make, `system` or a macOS alert sound (src/notify-sounds.js; src/notify-bridge.js).
 * - `whatsNew` — "What's new" after a minor/major update (tasks/todo-desktop-update-policy.md D3,
 *   src/whats-new.js): `pending` (the update not yet seen in Help & about), `lastRunVersion` (the
 *   version that last ran) and `notify` (the system notification; the dot and the box stay either
 *   way). `pending` and `lastRunVersion` change in ONE write, so a crash never loses the news.
 * The page never writes this file: it asks the main process through a bridge, which writes here.
 *
 * Read defensively: a missing, broken or oversized file means the defaults, and a log line; a part
 * of the wrong shape falls back to ITS default alone. Written whole through a temporary file and a
 * rename (a crash mid-write leaves the old file, never half a file), one write at a time in the
 * order asked. `update(patch)` replaces whole parts on top of the saved document (`notifications`:
 * the fields given, on top of the saved ones), inside that same queue, so two changes asked
 * together never lose each other. A write that fails or a
 * value of the wrong shape REJECTS: a switch on the page must not show a choice that was not saved.
 */
const fs = require('node:fs')
const path = require('node:path')
const { AGENT_ID } = require('./agent-manifest.js')
const { DEFAULT_SOUND, isNotifySound } = require('./notify-sounds.js')

/** Far above anything this file holds; a bigger one is not ours. */
const MAX_BYTES = 64 * 1024

const OUTCOMES = Object.freeze(['completed', 'dismissed'])

/**
 * @typedef {{ flowVersion: 1, closedAt: number | null, outcome: 'completed' | 'dismissed' | null, picked: string | null }} OnboardingState
 * @typedef {{ from: string | null, to: string, page: string }} WhatsNewPending
 * @typedef {{ pending: WhatsNewPending | null, lastRunVersion: string | null, notify: boolean }} WhatsNewState
 * @typedef {{ autoCheck: boolean, onboarding: OnboardingState, notifications: { enabled: boolean, sound: string }, whatsNew: WhatsNewState }} Preferences
 */

const DEFAULT_ONBOARDING = Object.freeze({ flowVersion: 1, closedAt: null, outcome: null, picked: null })

/** @returns {Preferences} */
const defaults = () => ({
  autoCheck: true,
  onboarding: { ...DEFAULT_ONBOARDING },
  notifications: { enabled: true, sound: DEFAULT_SOUND },
  whatsNew: { pending: null, lastRunVersion: null, notify: true }
})

const SHORT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]{1,32})?$/
const PAGE = /^\d+\.\d+$/
const isPending = (value) =>
  value === null ||
  (isObject(value) &&
    (value.from === null || (typeof value.from === 'string' && SHORT_VERSION.test(value.from))) &&
    typeof value.to === 'string' &&
    SHORT_VERSION.test(value.to) &&
    typeof value.page === 'string' &&
    PAGE.test(value.page))

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Each part: whether a value has its shape, the copy of it that is stored (known keys only), and,
 * where reading the file can keep more than "all or the default", `fromFile`.
 */
const PARTS = Object.freeze({
  autoCheck: {
    valid: (value) => typeof value === 'boolean',
    copy: (value) => value
  },
  onboarding: {
    valid: (value) =>
      isObject(value) &&
      value.flowVersion === DEFAULT_ONBOARDING.flowVersion &&
      (value.closedAt === null || (Number.isFinite(value.closedAt) && value.closedAt >= 0)) &&
      (value.outcome === null || OUTCOMES.includes(value.outcome)) &&
      (value.picked === null ||
        (typeof value.picked === 'string' && value.picked.length <= 64 && AGENT_ID.test(value.picked))),
    copy: (value) => ({
      flowVersion: value.flowVersion,
      closedAt: value.closedAt,
      outcome: value.outcome,
      picked: value.picked
    })
  },
  notifications: {
    // A missing sound (a file from before it existed) is the default.
    valid: (value) =>
      isObject(value) &&
      typeof value.enabled === 'boolean' &&
      (value.sound === undefined || isNotifySound(value.sound)),
    copy: (value) => ({ enabled: value.enabled, sound: value.sound ?? DEFAULT_SOUND }),
    // A sound not on the list falls back alone; the switch is kept.
    fromFile: (value) =>
      isObject(value) && typeof value.enabled === 'boolean'
        ? { enabled: value.enabled, sound: isNotifySound(value.sound) ? value.sound : DEFAULT_SOUND }
        : undefined
  },
  whatsNew: {
    valid: (value) =>
      isObject(value) &&
      isPending(value.pending) &&
      (value.lastRunVersion === null ||
        (typeof value.lastRunVersion === 'string' && SHORT_VERSION.test(value.lastRunVersion))) &&
      typeof value.notify === 'boolean',
    copy: (value) => ({
      pending:
        value.pending === null
          ? null
          : { from: value.pending.from, to: value.pending.to, page: value.pending.page },
      lastRunVersion: value.lastRunVersion,
      notify: value.notify
    })
  }
})

/** The known parts of `input` that are present, checked; throws a TypeError naming a bad part. */
function checkedParts(input) {
  if (!isObject(input)) throw new TypeError('preferences: expected an object')
  const out = {}
  for (const [name, part] of Object.entries(PARTS)) {
    if (!Object.hasOwn(input, name)) continue
    if (!part.valid(input[name])) throw new TypeError(`preferences: ${name} has the wrong shape`)
    out[name] = part.copy(input[name])
  }
  return out
}

/**
 * @param {{ file: string, log: (line: string) => void }} deps
 * @returns {{
 *   read: () => Preferences,
 *   write: (prefs: Partial<Preferences> & { autoCheck: boolean }) => Promise<void>,
 *   update: (patch: Partial<Preferences>) => Promise<Preferences>
 * }}
 */
function createPreferences({ file, log }) {
  let queue = Promise.resolve()

  /** @returns {Preferences} */
  function read() {
    let text
    try {
      const size = fs.statSync(file, { throwIfNoEntry: false })?.size
      if (size === undefined) return defaults()
      if (size > MAX_BYTES) {
        log(`preferences: ${file} is too large (${size} bytes); using the defaults`)
        return defaults()
      }
      text = fs.readFileSync(file, 'utf8')
    } catch (error) {
      log(`preferences: cannot read ${file} (${error.message}); using the defaults`)
      return defaults()
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      log(`preferences: ${file} is not valid JSON; using the defaults`)
      return defaults()
    }
    const prefs = defaults()
    if (!isObject(parsed)) return prefs
    for (const [name, part] of Object.entries(PARTS)) {
      if (!Object.hasOwn(parsed, name)) continue
      const raw = parsed[name]
      const value = part.fromFile ? part.fromFile(raw) : part.valid(raw) ? part.copy(raw) : undefined
      if (value !== undefined) prefs[name] = value
    }
    return prefs
  }

  /** Write `body` (already checked) whole, through a temporary file and a rename. */
  function save(body) {
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`, { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch (error) {
      fs.rmSync(tmp, { force: true })
      throw error
    }
  }

  /** Run `job` after every write asked before it, whatever their outcome. */
  function enqueue(job) {
    const run = queue.then(job)
    queue = run.catch(() => {})
    return run
  }

  /** The whole document: known parts only, each checked; `autoCheck` is required. */
  function write(prefs) {
    return enqueue(() => {
      if (typeof prefs?.autoCheck !== 'boolean')
        throw new TypeError('preferences: autoCheck must be a boolean')
      save(checkedParts(prefs))
    })
  }

  /** Replace the parts named in `patch`, keep the rest as saved; answers with the saved document. */
  function update(patch) {
    return enqueue(() => {
      const saved = read()
      // `notifications` fields may come one at a time: each lands on the saved part, inside the
      // queue, so a switch and a sound changed together both stay.
      // So may `whatsNew` fields.
      let merged = patch
      if (isObject(patch) && isObject(patch.notifications))
        merged = { ...merged, notifications: { ...saved.notifications, ...patch.notifications } }
      if (isObject(patch) && isObject(patch.whatsNew))
        merged = { ...merged, whatsNew: { ...saved.whatsNew, ...patch.whatsNew } }
      const next = { ...saved, ...checkedParts(merged) }
      save(next)
      return next
    })
  }

  return { read, write, update }
}

module.exports = { createPreferences, DEFAULT_ONBOARDING }
