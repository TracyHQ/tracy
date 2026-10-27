/**
 * Installer GETs observed by the sessionless update host. Neither a completed transfer nor a new
 * install is claimed. Identity/install headers and query claims are deliberately not consumed.
 * A cookie token groups requests for one artifact for 15 minutes. Parallel first requests without
 * a cookie can still count twice; a fresh request after that window counts again.
 */
import { createHash, randomUUID } from 'node:crypto'
import { withDeadline } from './beta-access.js'
import { signInSource } from './sign-in-source.js'

export const DOWNLOAD_COOKIE = 'tracy_download_request'
export const DOWNLOAD_WINDOW_SECONDS = 15 * 60
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const TOKEN = new RegExp(`^(${UUID})\\.(\\d{1,12})$`, 'i')
const INSTALLER = String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:dmg|exe|AppImage|deb)`
const RELEASE = new RegExp(
  String.raw`^(stable|dev)\/(\d+\.\d+\.\d+(?:-dev\.\d+)?)\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/(${INSTALLER})$`
)
const FLAT = new RegExp(`^${INSTALLER}$`)
const VERSION = String.raw`(\d+\.\d+\.\d+(?:-dev\.\d+)?)`
// The names the release line gives each platform's installer (tasks/todo-desktop-windows.md §4).
const TRACY_FILE = [
  [new RegExp(String.raw`^Tracy-Cowork-(Dev-)?${VERSION}-(arm64|x64)\.dmg$`), 'macos'],
  [new RegExp(String.raw`^Tracy-Cowork-(Dev-)?${VERSION}-win-(arm64|x64)-setup\.exe$`), 'windows'],
  [new RegExp(String.raw`^Tracy-Cowork-(Dev-)?${VERSION}-linux-(arm64|x64)\.(?:AppImage|deb)$`), 'linux']
]
const PLATFORM_OF = { dmg: 'macos', exe: 'windows', AppImage: 'linux', deb: 'linux' }

/**
 * Metadata comes only from the served artifact path. Unrecognized flat names keep null fields; the
 * platform then follows the extension.
 */
export function installerMetadata(file) {
  if (typeof file !== 'string' || file.includes('..')) return null
  const release = RELEASE.exec(file)
  if (!release && !FLAT.test(file)) return null
  const name = release?.[3] ?? file
  const known = TRACY_FILE.map(([re]) => re.exec(name)).find(Boolean)
  return {
    file,
    channel: release?.[1] ?? (known ? (known[1] ? 'dev' : 'stable') : null),
    version: release?.[2] ?? known?.[2] ?? null,
    arch: known?.[3] ?? null,
    platform: PLATFORM_OF[name.slice(name.lastIndexOf('.') + 1)]
  }
}

/**
 * Is this request the desktop app's own updater? electron-updater sends the app's request headers
 * (`App-Name`, `App-Version`, … — the app's `updateHeaders`) on every download; a browser sends
 * neither. On Windows and Linux the installer is also the update payload, so an updater fetch of it
 * is not a download. A forged header only hides the sender's own request from the count.
 */
export function isUpdaterRequest(header) {
  return Boolean(header('app-name') || header('app-version'))
}

/** A server-issued, short-lived retry token. It carries no identity or authorization. */
export function downloadToken(cookie, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  const value = (cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DOWNLOAD_COOKIE}=`))
    ?.slice(DOWNLOAD_COOKIE.length + 1)
  const match = TOKEN.exec(value ?? '')
  const issued = match ? Number(match[2]) : null
  if (issued !== null && issued <= seconds && seconds - issued < DOWNLOAD_WINDOW_SECONDS)
    return {
      value: `${match[1].toLowerCase()}.${issued}`,
      maxAge: DOWNLOAD_WINDOW_SECONDS - (seconds - issued)
    }
  return { value: `${randomUUID()}.${seconds}`, maxAge: DOWNLOAD_WINDOW_SECONDS }
}

/**
 * Only the caller's successful, non-range GET reaches this writer. Account/install identity stays
 * null: this host cannot authenticate the person. UTM fields are sanitized attribution claims.
 */
export async function recordDownload(pool, { file, token, params }) {
  const artifact = installerMetadata(file)
  if (!artifact || typeof token !== 'string' || !TOKEN.test(token)) return false
  const dedupeKey = createHash('sha256').update(`${token}\n${file}`).digest('hex')
  const connection = await withDeadline(async (abort) => {
    const acquired = await pool.connect()
    if (abort.aborted) {
      acquired.release()
      throw new Error('DOWNLOAD_POOL_TIMEOUT')
    }
    return acquired
  }, 500)
  try {
    await connection.query({ text: 'begin', query_timeout: 500 })
    await connection.query({ text: "set local statement_timeout = '500ms'", query_timeout: 500 })
    const { rowCount } = await connection.query({
      text: `insert into desktop_download
       (id, channel, version, platform, arch, file, source, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     on conflict (dedupe_key) do nothing`,
      values: [
        randomUUID(),
        artifact.channel,
        artifact.version,
        artifact.platform,
        artifact.arch,
        file,
        JSON.stringify(signInSource(params) ?? {}),
        dedupeKey
      ],
      query_timeout: 500
    })
    await connection.query({ text: 'commit', query_timeout: 500 })
    return rowCount > 0
  } catch (error) {
    await connection.query({ text: 'rollback', query_timeout: 500 }).catch(() => {})
    throw error
  } finally {
    connection.release()
  }
}
