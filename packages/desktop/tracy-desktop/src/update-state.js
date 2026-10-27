/**
 * The self-update's STATE — what Settings › Help & about shows — as a pure reducer from the
 * updater's events. No Electron here: `src/updater.js` feeds the events, `src/update-bridge.js` sends
 * the result to the product window, test/update-state.test.mjs covers every move.
 *
 * Statuses:
 *   off              this copy never updates itself (not packaged, no update channel)
 *   idle             it does, and has not checked yet (never shown as "up to date")
 *   checking         a check runs
 *   current          the last check found nothing newer (`lastCheckedAt`)
 *   downloading      a newer `version` downloads (`percent`)
 *   downloaded       `version` is ready to install (`readySince`: when the first version of this wait
 *                    was ready; `stagedVersion`: what Squirrel.Mac — or the AppImage updater — has
 *                    prepared to install on quit, tasks/todo-desktop-update-policy.md A1/A2)
 *   available-manual `version` is out, and this copy (ad-hoc signed) cannot install it itself
 *   error            a check or download failed (`nextRetryAt` only while automatic checks are on)
 *   installing       Restart was asked for
 *   install-error    Squirrel refused the install after Restart; the version stays ready
 *
 * Every event moves `revision` forward, so a page that receives a snapshot it asked for after a
 * newer pushed state can tell which one is newer.
 */

/** The most release-note characters that cross IPC; the page renders text, never markup. */
const MAX_NOTES = 20_000

/** C0/C1 controls except tab and newline, and the bidi embedding/override/isolate characters. */
// Built from escapes in a string, so no invisible character sits in this file (a formatter turned
// regex escapes into the raw characters once).
const UNSAFE = new RegExp(
  // oxlint-disable-next-line no-control-regex -- removing these characters is the point
  '[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]',
  'g'
)

/**
 * Release notes as electron-updater hands them (a string from the channel file, or an array of
 * `{ version, note }` when it collects several versions), as plain text safe to show: line breaks
 * normalised, control and bidi characters dropped, HTML tags dropped (a lone `<` stays), capped at
 * `MAX_NOTES`.
 * @param {unknown} raw
 * @returns {string | null} null when there is nothing to show.
 */
function normalizeReleaseNotes(raw) {
  let text
  if (typeof raw === 'string') text = raw
  else if (Array.isArray(raw))
    text = raw
      .map((entry) =>
        entry !== null && typeof entry === 'object' && typeof entry.note === 'string' ? entry.note : ''
      )
      .filter((note) => note.trim() !== '')
      .join('\n\n')
  else return null
  text = text
    .replace(/\r\n?/g, '\n')
    // The Desktop-only mark of the product changelog (tasks/todo-desktop-update-policy.md E9): a
    // `desktop:` prefix, a ` {desktop}` suffix or a Starlight `<Badge>`. Inside the app every line is
    // about the app, so the mark goes and the line stays.
    .replace(/<Badge\b[^<>]*\/>|<Badge\b[^<>]*>[^<]*<\/Badge>/gi, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*(?:[-*]\s+)?)desktop:\s*/i, '$1')
        .replace(/\s*\{desktop\}\s*$/i, '')
        .replace(/[ \t]+$/, '')
    )
    .join('\n')
    // Only what looks like a tag (`<b>`, `</p>`, `<img …>`): a `<` in prose (`a < b`) is text and stays.
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(UNSAFE, '')
    .trim()
  if (text === '') return null
  return text.length > MAX_NOTES ? `${text.slice(0, MAX_NOTES)}…` : text
}

/**
 * @typedef {'off' | 'idle' | 'checking' | 'current' | 'downloading' | 'downloaded' | 'available-manual'
 *   | 'error' | 'installing' | 'install-error'} UpdateStatus
 * @typedef {{
 *   revision: number, status: UpdateStatus, version: string | null, percent: number | null,
 *   releaseNotes: string | null, lastCheckedAt: number | null, nextRetryAt: number | null,
 *   autoCheck: boolean, readySince: number | null, stagedVersion: string | null
 * }} UpdateState
 */

/**
 * @param {{ autoCheck: boolean }} input
 * @returns {UpdateState}
 */
function initialUpdateState({ autoCheck }) {
  return {
    revision: 0,
    status: 'idle',
    version: null,
    percent: null,
    releaseNotes: null,
    lastCheckedAt: null,
    nextRetryAt: null,
    autoCheck: autoCheck === true,
    readySince: null,
    stagedVersion: null
  }
}

/** @returns {UpdateState} */
function offUpdateState() {
  return { ...initialUpdateState({ autoCheck: false }), status: 'off' }
}

/** A version waits to install: checks and their failures do not move it. */
const WAITING = new Set(['downloaded', 'installing', 'install-error'])

/**
 * @param {UpdateState} state
 * @param {{ type: string, [key: string]: unknown }} event
 * @returns {UpdateState}
 */
function reduceUpdate(state, event) {
  if (state.status === 'off') return state
  const next = { ...state, revision: state.revision + 1 }
  const fresh = { version: null, percent: null, releaseNotes: null, readySince: null, stagedVersion: null }
  switch (event.type) {
    case 'checking':
      if (WAITING.has(state.status) || state.status === 'downloading') return next
      return { ...next, status: 'checking', nextRetryAt: null }
    case 'not-available':
      if (WAITING.has(state.status) || state.status === 'downloading')
        return { ...next, lastCheckedAt: event.at }
      return { ...next, ...fresh, status: 'current', lastCheckedAt: event.at, nextRetryAt: null }
    case 'available': {
      if (WAITING.has(state.status)) return { ...next, lastCheckedAt: event.at }
      const notes = normalizeReleaseNotes(event.releaseNotes)
      return {
        ...next,
        ...fresh,
        status: event.inPlace ? 'downloading' : 'available-manual',
        version: String(event.version),
        percent: event.inPlace ? 0 : null,
        releaseNotes: notes,
        lastCheckedAt: event.at,
        nextRetryAt: null
      }
    }
    case 'progress':
      if (state.status !== 'downloading') return next
      return { ...next, percent: Math.max(0, Math.min(100, Math.round(Number(event.percent) || 0))) }
    case 'downloaded':
      return {
        ...next,
        status: 'downloaded',
        version: String(event.version),
        percent: null,
        releaseNotes: normalizeReleaseNotes(event.releaseNotes) ?? state.releaseNotes,
        // The wait started with the first version ready: a re-emit from the cache, or a newer version
        // downloaded while the app still runs the old one, does not move it (A2).
        readySince:
          WAITING.has(state.status) && state.readySince !== null ? state.readySince : (event.at ?? null),
        nextRetryAt: null
      }
    case 'staged':
      if (!WAITING.has(state.status)) return next
      return { ...next, stagedVersion: String(event.version) }
    case 'error':
      if (state.status === 'installing') return { ...next, status: 'install-error' }
      if (WAITING.has(state.status)) return next
      return {
        ...next,
        ...fresh,
        status: 'error',
        nextRetryAt: state.autoCheck && typeof event.nextRetryAt === 'number' ? event.nextRetryAt : null
      }
    case 'retry-at':
      return { ...next, nextRetryAt: state.autoCheck && state.status === 'error' ? event.at : null }
    case 'install':
      if (state.status !== 'downloaded' && state.status !== 'install-error') return next
      return { ...next, status: 'installing' }
    case 'auto-check':
      return {
        ...next,
        autoCheck: event.on === true,
        nextRetryAt: event.on === true ? state.nextRetryAt : null
      }
    default:
      return next
  }
}

module.exports = { MAX_NOTES, normalizeReleaseNotes, initialUpdateState, offUpdateState, reduceUpdate }
