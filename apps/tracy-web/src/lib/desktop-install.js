/**
 * `desktop_install` — which Tracy Cowork apps exist and who uses them (09/10,
 * tasks/todo-desktop-auto-update.md "Who uses the app"). Shared by the update feed (records a check)
 * and `/ops` (links a person, lists installs), so it lives in `lib/`.
 *
 * The id is the UUID electron-updater keeps in the app's userData and sends as `x-user-staging-id`.
 * Every field the app sends is a claim, never an authority: it only names a row to show staff.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHANNELS = new Set(['stable', 'dev'])
const ARCHES = new Set(['arm64', 'x64'])
const PLATFORMS = new Set(['mac', 'win', 'linux'])
const SHORT = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/

/** @returns {string | null} the id in lowercase, or null when it is not a UUID. */
export function installIdOf(value) {
  return typeof value === 'string' && UUID.test(value.trim()) ? value.trim().toLowerCase() : null
}

const short = (value) => (typeof value === 'string' && SHORT.test(value) ? value : null)

/**
 * Record one channel-file read. Never throws on bad input — a missing or malformed id is not
 * recorded at all; a field that does not look like a version, arch or OS version is stored empty.
 * @param {import('pg').Pool} pool
 * `platform` is the feed's own fact — which channel file was read — never a header.
 * @param {{ installId: unknown, channel: string, platform: 'mac' | 'win' | 'linux', version?: unknown, arch?: unknown, osVersion?: unknown }} check
 * @returns {Promise<boolean>} whether a row was written.
 */
export async function recordCheck(pool, { installId, channel, platform, version, arch, osVersion }) {
  const id = installIdOf(installId)
  if (id === null || !CHANNELS.has(channel) || !PLATFORMS.has(platform)) return false
  await pool.query(
    `insert into desktop_install (install_id, channel, platform, version, arch, os_version)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (install_id) do update
       set channel = excluded.channel, platform = excluded.platform, version = excluded.version,
           arch = excluded.arch, os_version = excluded.os_version, last_seen = now()`,
    [id, channel, platform, short(version), ARCHES.has(arch) ? arch : null, short(osVersion)]
  )
  return true
}

/**
 * Link an install the feed has already seen to the signed-in person.
 * @returns {Promise<'linked' | 'unknown'>} `unknown` when the feed never saw that id (or no account).
 */
export async function linkInstall(pool, { installId, email }) {
  const { rowCount } = await pool.query(
    `update desktop_install d
        set account_id = a.id, linked_at = now()
       from account a
      where d.install_id = $1 and a.email = $2`,
    [installId, email]
  )
  return rowCount > 0 ? 'linked' : 'unknown'
}

/**
 * Every install, most recently seen first, with the linked person's email.
 * @param {{ limit?: number | null, channel?: 'stable' | 'dev' | null, since?: Date | null }} [options]
 *   `limit: null` reads every row (a report that counts must not stop at a page); `channel` and
 *   `since` (last seen at or after) narrow the read.
 */
export async function listInstalls(pool, { limit = 500, channel = null, since = null } = {}) {
  const { rows } = await pool.query(
    `select d.install_id, d.channel, d.platform, d.version, d.arch, d.os_version, d.first_seen, d.last_seen,
            d.linked_at, a.email
       from desktop_install d
       left join account a on a.id = d.account_id
      where ($2::text is null or d.channel = $2) and ($3::timestamptz is null or d.last_seen >= $3)
      order by d.last_seen desc
      limit $1`,
    [limit, channel, since]
  )
  return rows.map((r) => ({
    installId: r.install_id,
    channel: r.channel,
    platform: r.platform,
    version: r.version,
    arch: r.arch,
    osVersion: r.os_version,
    email: r.email ?? null,
    firstSeen: r.first_seen.toISOString(),
    lastSeen: r.last_seen.toISOString(),
    linkedAt: r.linked_at ? r.linked_at.toISOString() : null
  }))
}
