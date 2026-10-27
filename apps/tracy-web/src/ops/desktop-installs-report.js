/**
 * The installs an EXPECTED minimum version would block (tasks/todo-desktop-update-policy.md C8;
 * council §C8): before a person raises `minimumVersion` on a channel, staff need the machines of
 * that channel running a version below the one about to be required — counted, split by platform
 * and arch, and listed with when each was last seen. A filter on the minimum already in force
 * answers that only after the fact, so this report takes the candidate version as its input.
 *
 * Read-only and pure: the route reads the rows (`lib/desktop-install.js` `listInstalls`), this
 * module decides which of them sit below.
 */

/** The versions the release tool and the app accept: `X.Y.Z` or `X.Y.Z-dev.N`. */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/
const CHANNELS = ['stable', 'dev']
/**
 * The "seen in the last N days" windows. The default is every install ever seen: raising the
 * minimum blocks each install the next time it opens, however long it has been silent, so a default
 * window would hide machines the change still blocks. Each row's lastSeen lets the reader judge
 * staleness, and a window narrows the count on request.
 */
const DAYS = ['7', '30', '90', 'all']
const DAY_MS = 86_400_000

/**
 * The order `packages/desktop/tracy-desktop/build/release-feed.mjs` `versionOrder` uses — copied,
 * not imported, so this app does not reach into a desktop package: numbers compare as numbers, and
 * `X.Y.Z` sorts above every `X.Y.Z-dev.N`. Both arguments must match VERSION_RE.
 * @returns {number} negative, zero or positive.
 */
export function versionOrder(a, b) {
  const parse = (v) => {
    const m = VERSION_RE.exec(v)
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])]
  }
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

const isVersion = (v) => typeof v === 'string' && v.length <= 64 && VERSION_RE.test(v)

/**
 * Read the report's query. `null` when it names none of `below`, `channel`, `days` — the plain list
 * of every install. Otherwise every one of them is checked, and `below` and `channel` are required.
 * @param {Record<string, string>} query
 * @returns {null | { ok: true, below: string, channel: 'stable' | 'dev', days: string }
 *   | { ok: false, code: 'INVALID_REPORT', field: string, message: string }}
 */
export function reportQuery(query) {
  if (!['below', 'channel', 'days'].some((k) => k in query)) return null
  const bad = (field, message) => ({ ok: false, code: 'INVALID_REPORT', field, message })
  const { below, channel, days = 'all' } = query
  if (!isVersion(below))
    return bad(
      'below',
      'below must be the expected minimum version, X.Y.Z or X.Y.Z-dev.N (for example 0.6.0)'
    )
  if (!CHANNELS.includes(channel)) return bad('channel', 'channel must be stable or dev')
  if (channel === 'stable' && below.includes('-dev.'))
    return bad('below', `a stable channel cannot require the dev build ${below}; name a stable version`)
  if (!DAYS.includes(days)) return bad('days', 'days must be 7, 30, 90 or all')
  return { ok: true, below, channel, days }
}

/** The earliest lastSeen a window keeps, or null for every install. */
export function sinceOf(days, now = Date.now()) {
  return days === 'all' ? null : new Date(now - Number(days) * DAY_MS)
}

/**
 * @param {Array<{ version: string | null, platform: string, arch: string | null, lastSeen: string }>} installs
 *   the channel's installs inside the window, most recently seen first.
 * @param {{ below: string, channel: string, days: string, since: Date | null }} expected
 */
export function belowReport(installs, { below, channel, days, since }) {
  const known = installs.filter((i) => isVersion(i.version))
  const under = known.filter((i) => versionOrder(i.version, below) < 0)
  const tally = (key, rows) => {
    const counts = new Map()
    for (const row of rows) {
      const k = key(row)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return counts
  }
  const byPlatform = [...tally((i) => `${i.platform}\u0000${i.arch ?? ''}`, under)]
    .map(([k, count]) => {
      const [platform, arch] = k.split('\u0000')
      return { platform, arch: arch || null, count }
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.platform.localeCompare(b.platform) ||
        (a.arch ?? '').localeCompare(b.arch ?? '')
    )
  const byVersion = [...tally((i) => i.version, under)]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => versionOrder(b.version, a.version))
  return {
    below,
    channel,
    days,
    since: since ? since.toISOString() : null,
    total: under.length,
    atOrAbove: known.length - under.length,
    unknownVersion: installs.length - known.length,
    byPlatform,
    byVersion,
    installs: under
  }
}
