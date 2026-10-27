/**
 * `update.<zone>/desktop/*` — the Tracy Cowork desktop app's update feed (tasks/todo-desktop-auto-update.md).
 *
 * electron-updater's generic provider reads a channel file, then downloads the artifact it names
 * next to it. Both come from the `tracy-releases` bucket, STREAMED (a 100 MB artifact is never held
 * in this process) and read-only: only `GET`/`HEAD` of a name this module knows the shape of —
 * everything else is refused before the store is asked.
 *
 * Channel files, per platform (electron-updater 6.8.9, `Provider.getChannelFilePrefix`):
 *   mac `<channel>-mac.yml`, win `<channel>.yml` (NsisUpdater, one file listing both exes),
 *   linux `<channel>-linux.yml` on x64 and `<channel>-linux-arm64.yml` on arm64 (AppImage/Deb).
 * Each has a detached Ed25519 signature `<channel file>.sig` (tasks/todo-desktop-windows.md §4).
 * Artifacts: `.zip`/`.dmg` (mac), `.exe` (win), `.AppImage`/`.deb` (linux), flat or in a release
 * folder. No `.blockmap`: the app turns differential download off, and with it electron-updater
 * never asks for one.
 *
 * Channel files and their signatures are never cached. Mac update ZIPs keep immutable caching;
 * installers (dmg, exe, AppImage, deb) are not cached so App Statistic can observe requests
 * reaching this app (not completed transfers or CDN hits). An exe or AppImage is also what the
 * updater downloads; that fetch is served the same way but not counted (`isUpdaterRequest`).
 *
 * Every read of a channel file also records the asking install (`recordCheck`) — after the answer
 * is decided and never at its expense: a failed write is logged, the app still gets its file.
 *
 * Dependencies come in from `app.js` (module graph): `getObject(key, method)` is the store read,
 * signed there with `sites/artifacts.js`'s `signedCall`.
 */
import { Hono } from 'hono'
import {
  DOWNLOAD_COOKIE,
  downloadToken,
  installerMetadata,
  isUpdaterRequest
} from '../lib/desktop-download.js'

const ARTIFACT = String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:zip|dmg|exe|AppImage|deb)`
// A flat artifact next to the channel files (the first dev builds, and the dmg name the Mac app
// falls back to).
const FLAT_FILE = new RegExp(`^${ARTIFACT}$`)
// One release's artifacts live under an immutable folder of their own (the release line's
// prepare/publish, tasks/todo-desktop-release.md): `<channel>/<version>/<build id>/<artifact>`.
// Exactly that shape — a channel file never lives in there, and no other nesting is served.
const RELEASE_FILE = new RegExp(
  String.raw`^(?:stable|dev)\/\d+\.\d+\.\d+(?:-dev\.\d+)?\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/${ARTIFACT}$`
)
const CHANNEL_FILE = /^(stable|dev)(-mac|-linux|-linux-arm64)?\.yml$/
const SIGNATURE = /^(?:stable|dev)(?:-mac|-linux|-linux-arm64)?\.yml\.sig$/
/** Which platform reads a channel file, by its suffix (none = Windows). */
const PLATFORM_OF = { '-mac': 'mac', '-linux': 'linux', '-linux-arm64': 'linux', '': 'win' }
const TYPES = [
  [/\.ya?ml$/, 'text/yaml; charset=utf-8'],
  [/\.zip$/, 'application/zip'],
  [/\.dmg$/, 'application/x-apple-diskimage'],
  [/\.exe$/, 'application/vnd.microsoft.portable-executable'],
  [/\.AppImage$/, 'application/vnd.appimage'],
  [/\.deb$/, 'application/vnd.debian.binary-package'],
  [/\.sig$/, 'application/octet-stream']
]

// Bound the response delay even when the pool is exhausted or a recorder never resolves. The
// database writer also bounds its statements; a late rejection remains consumed by this race.
async function recordInstaller(record, request) {
  let timer
  try {
    await Promise.race([
      Promise.resolve().then(() => record(request)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('tracking timed out')), 500)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {object} deps
 * @param {((key: string, method: 'GET' | 'HEAD') => Promise<Response>) | null} deps.getObject - null: no store configured.
 * @param {((check: object) => Promise<unknown>) | null} deps.record - null: no database.
 * @param {((download: object) => Promise<unknown>) | null} [deps.recordDownload] - successful installer requests only.
 * @param {{ warn: (...args: unknown[]) => void }} [deps.log]
 */
export function updateFeedRoutes({ getObject, record, recordDownload = null, log = console }) {
  const app = new Hono()

  app.all('*', async (c) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname
    const name = pathname.startsWith('/desktop/') ? pathname.slice('/desktop/'.length) : ''
    const known =
      CHANNEL_FILE.test(name) || SIGNATURE.test(name) || FLAT_FILE.test(name) || RELEASE_FILE.test(name)
    if (!known || name.includes('..')) return c.body(null, 404, { 'cache-control': 'no-store' })
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD') return c.body(null, 405, { allow: 'GET, HEAD' })
    if (getObject === null) return c.body(null, 503, { 'cache-control': 'no-store' })

    const stored = await getObject(`desktop/${name}`, method)
    if (stored.status === 404) return c.body(null, 404, { 'cache-control': 'no-store' })
    if (!stored.ok) {
      log.warn(`update feed: store answered ${stored.status} for ${name}`)
      return c.body(null, 502, { 'cache-control': 'no-store' })
    }

    const channelFile = CHANNEL_FILE.exec(name)
    const channel = channelFile?.[1]
    // Only a channel-file read is an install checking in. An artifact GET is not: on Windows and
    // Linux the same exe/AppImage serves the first install and every update.
    if (channel && record) {
      try {
        await record({
          installId: c.req.header('x-user-staging-id'),
          channel,
          platform: PLATFORM_OF[channelFile[2] ?? ''],
          version: c.req.header('app-version'),
          arch: c.req.header('x-arch'),
          osVersion: c.req.header('x-os-version')
        })
      } catch (error) {
        log.warn(`update feed: could not record an install: ${error.message}`)
      }
    }

    const installer = installerMetadata(name)
    const headers = {
      'content-type': TYPES.find(([re]) => re.test(name))?.[1] ?? 'application/octet-stream',
      'cache-control':
        channel || SIGNATURE.test(name) || installer ? 'no-store' : 'public, max-age=31536000, immutable'
    }
    // Count only complete GET requests accepted by storage, not HEAD, range/resume or updater ZIPs.
    // Identity headers are not read: the update host has no authenticated session. Tracking must
    // never turn an otherwise successful installer response into an error.
    // On Windows and Linux the updater downloads the installer itself: its fetch is not a download.
    if (
      installer &&
      method === 'GET' &&
      !c.req.header('range') &&
      stored.status === 200 &&
      recordDownload &&
      !(installer.platform !== 'macos' && isUpdaterRequest((name) => c.req.header(name)))
    ) {
      const token = downloadToken(c.req.header('cookie'))
      headers['set-cookie'] =
        `${DOWNLOAD_COOKIE}=${token.value}; Path=/desktop; Max-Age=${token.maxAge}; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`
      try {
        await recordInstaller(recordDownload, { file: name, token: token.value, params: url.searchParams })
      } catch (error) {
        log.warn(`update feed: could not record an installer request: ${error.message}`)
      }
    }
    for (const h of ['content-length', 'etag', 'last-modified']) {
      const value = stored.headers.get(h)
      if (value) headers[h] = value
    }
    return new Response(method === 'HEAD' ? null : stored.body, { status: 200, headers })
  })

  return app
}
