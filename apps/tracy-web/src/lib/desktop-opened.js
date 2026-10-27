/** Daily foreground use of the desktop app. No content, new identifier or account enrichment. */
import { installIdOf } from './desktop-install.js'

export const DESKTOP_OPENED_MAX_BYTES = 512
export const DESKTOP_OPENED_PER_HOUR = 120
export const DESKTOP_OPENED_PER_IP_HOUR = 600
const DAY_MS = 86_400_000
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:dev|preview)\.\d{1,8})?$/
const PLATFORMS = new Set(['mac', 'win', 'linux'])
const FIELDS = new Set(['installId', 'version', 'platform', 'openedAt'])
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

/** Accept only a small app-opened claim; an offline retry retains its original day and time. */
export function parseDesktopOpened(body, now = Date.now()) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !FIELDS.has(field))
  )
    return { ok: false, code: 'INVALID_OPENED_SIGNAL' }
  const installId = installIdOf(body.installId)
  if (installId === null) return { ok: false, code: 'INVALID_INSTALL_ID' }
  if (typeof body.version !== 'string' || !VERSION.test(body.version))
    return { ok: false, code: 'INVALID_VERSION' }
  if (!PLATFORMS.has(body.platform)) return { ok: false, code: 'INVALID_PLATFORM' }
  if (typeof body.openedAt !== 'string') return { ok: false, code: 'INVALID_OPENED_AT' }
  const timestamp = Date.parse(body.openedAt)
  const canonical = body.openedAt.length === 20 ? body.openedAt.replace('Z', '.000Z') : body.openedAt
  if (
    !ISO.test(body.openedAt) ||
    !Number.isFinite(timestamp) ||
    timestamp < now - 90 * DAY_MS ||
    timestamp > now + 300_000 ||
    new Date(timestamp).toISOString() !== canonical
  )
    return { ok: false, code: 'INVALID_OPENED_AT' }
  return {
    ok: true,
    installId,
    version: body.version,
    platform: body.platform,
    openedAt: new Date(timestamp).toISOString(),
    day: new Date(timestamp + 7 * 3_600_000).toISOString().slice(0, 10)
  }
}

/**
 * The session supplies identity, never the body or a previous link of this copy. The unique event
 * key makes retries and concurrent sends one daily copy. A failed write throws so the app retries.
 */
export async function recordDesktopOpened(pool, opened, email = null) {
  await pool.query(
    `insert into ops_signal (kind, occurred_at, account_id, data, dedupe_key)
     values ('desktop.app_opened', $1, (select id from account where email = $2), $3, $4)
     on conflict (dedupe_key) do nothing`,
    [
      opened.openedAt,
      email,
      { installId: opened.installId, version: opened.version, platform: opened.platform },
      `desktop.app_opened:${opened.installId}:${opened.day}`
    ]
  )
}
