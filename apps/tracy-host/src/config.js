/**
 * Every setting `tracy-host` reads, read once, here — modeled on `apps/tracy-web/src/config.js`'s
 * contract: an empty variable turns a feature off, and that is the shape a deployment relies on
 * (a local box with `CLOUDFLARE_*` unset gets `NOT_CONFIGURED` on those doors, not a crash three
 * layers down — see later tasks' `readCloudflare`-shaped readers).
 *
 * `tracy-host` is per-HOST (ADR 0014's "one dsh per host"), unlike `tracy-web`: it holds exactly
 * one `hostSecret` — its own — never a map of many hosts' secrets. And it NEVER holds a seat
 * secret and NEVER admits a cookie (this migration's global boundary rule) — there is
 * deliberately no `seatSecret` field here for a future task to reach for.
 */
import { browserRunsOf, demoQaTabsOf, demoReadCacheBytesOf } from './browser-room.js'
import { demoInstallMinFreeMbOf, demoInstallSlotsOf } from './install-slots.js'
import { publicOriginOf } from './public-origin.js'

export class ConfigError extends Error {
  constructor(key, why) {
    super(`${key}: ${why}`)
    this.key = key
  }
}

const need = (env, key) => {
  const v = env[key]
  if (typeof v !== 'string' || v === '') throw new ConfigError(key, 'is required')
  return v
}

/**
 * `POST /_host/address` (ingress via the Cloudflare API — `webroot.js`'s `runIngressUpdate`) and
 * `POST /_host/go-live` are both gated behind this: unset on a local box, and both doors answer
 * `501 NOT_CONFIGURED` instead of shelling out to a script that would only fail three layers down.
 * All three or none, same all-or-nothing shape as `apps/tracy-web/src/config.js`'s own
 * `readArtifactStore` — a token without an account or a tunnel id is not a usable credential.
 */
function readCloudflare(env) {
  const token = env.CLOUDFLARE_TOKEN
  const account = env.CLOUDFLARE_ACCOUNT
  const tunnel = env.CLOUDFLARE_TUNNEL
  if (!token || !account || !tunnel) return null
  return { token, account, tunnel }
}

/**
 * `TRACY_TUNNEL=catch-all` (shard beta): this host's tunnel sends EVERY name to nginx and tracy-web,
 * so no per-name rule is ever written or removed here. go-live then takes a customer's own domain
 * (it only records it) and a teardown has nothing to take out of the tunnel. It goes with no
 * `CLOUDFLARE_*`: a host that can write tunnel rules is not a catch-all host. Empty, or `none` (the
 * word this host hands `teardown.sh`, never a setting of its own): no mode.
 */
function readTunnelMode(env, cloudflare) {
  const mode = env.TRACY_TUNNEL ?? ''
  if (mode === '' || mode === 'none') return null
  if (mode !== 'catch-all') throw new ConfigError('TRACY_TUNNEL', 'must be catch-all or empty')
  if (cloudflare)
    throw new ConfigError('TRACY_TUNNEL', 'catch-all goes without CLOUDFLARE_TOKEN/ACCOUNT/TUNNEL')
  return 'catch-all'
}

/**
 * Where a dev stand keeps quickstart packs not published yet, or null. This process never reads it
 * itself: `quickstart.py` does, as the ONE directory a `file:` quickstart address may point into.
 *
 * 🔒 REFUSED AT BOOT UNLESS THE RUNTIME SAYS `development`, and deliberately stricter than
 * tracy-web's "not production": this image sets no NODE_ENV, so only the local compose override
 * (`compose.macos.yml`) says it. A server host with the variable would install bytes from its own
 * disk that no release carries — so it is not started at all rather than started permissive.
 */
function readLocalReleasesDir(env) {
  const dir = env.TRACY_LOCAL_RELEASES_DIR
  if (typeof dir !== 'string' || dir === '') return null
  if (!dir.startsWith('/') || env.NODE_ENV !== 'development')
    throw new ConfigError('TRACY_LOCAL_RELEASES_DIR', 'requires an absolute path and NODE_ENV=development')
  return dir
}

export function readConfig(env) {
  const cloudflare = readCloudflare(env)
  let siteProxyOrigin = null
  try {
    siteProxyOrigin = publicOriginOf(env.TRACY_WEB_ORIGIN || undefined) ?? null
  } catch {
    throw new ConfigError('TRACY_WEB_ORIGIN', 'must be an HTTP(S) origin without credentials or a path')
  }
  return {
    hostName: need(env, 'HOST_NAME'),
    // Verifies every `/_host/*` call (auth.js) — the one credential this process holds.
    hostSecret: need(env, 'HOST_SECRET'),
    // Where sites get provisioned into. `/health` checks this is actually writable, not merely
    // named: a typo'd or unmounted path answers 200 from everything BUT this until the first
    // provision job dies trying to write into it.
    sitesRoot: need(env, 'TRACY_SITES_ROOT'),
    // The OTHER root (`packages/fleet/tracy-fleet-operation/scripts/lib/roots.sh`): `.env`,
    // tokens, `compose.yml`, `webroot-baseline.git`. Never bound into the dsh container — only
    // `sitesRoot` is. `provision.sh`/`teardown.sh` both take it as `--root` (`provision.js`) and
    // both default to this exact same env var themselves if the flag is ever dropped.
    privateRoot: need(env, 'TRACY_PRIVATE_ROOT'),
    // Where the fleet's own scripts live on this host — `${scriptsDir}/provision/provision.sh`
    // etc (`provision.js`). The Dockerfile (Task 5) `COPY`s
    // `packages/fleet/tracy-fleet-operation/scripts` here and sets this env var to match
    // (`/opt/tracy-fleet`, the same default `roots.sh` itself falls back to) — this is NOT a
    // `packages/`/`workers/` import, it's a path to files this process shells out to.
    scriptsDir: need(env, 'TRACY_FLEET_DIR'),
    // A fixed stack backend, never a URL supplied by a site or a QA request.
    siteProxyOrigin,
    // This process's own bookkeeping — one JSON file per job (`jobs.js`) and one log file per
    // running script (`run.js`). Kept apart from `sitesRoot`/`privateRoot`: neither belongs to a
    // site, both outlive whichever site a job happens to be about. Not required like the roots
    // above — a sane default means a bare `node src/server.js` on a fresh checkout still runs.
    jobsDir: env.TRACY_HOST_JOBS_DIR || '/var/lib/tracy-host/jobs',
    logDir: env.TRACY_HOST_LOG_DIR || '/var/lib/tracy-host/logs',
    // null on a local box (no DNS/tunnel there) — see readCloudflare above.
    cloudflare,
    // 'catch-all' on a shard host (see readTunnelMode), else null.
    tunnelMode: readTunnelMode(env, cloudflare),
    localReleasesDir: readLocalReleasesDir(env),
    // Whether a backup export may PUT its zip to a plain-http store address: only where the runtime
    // says `development` (the local compose override, whose MinIO speaks http). Everywhere else the
    // address is a bearer secret for a customer's whole site and travels over TLS or not at all.
    exportOverHttp: env.NODE_ENV === 'development',
    // How many demo installs run at once on this host (`install-slots.js`); customers' never wait.
    demoInstallSlots: demoInstallSlotsOf(env),
    // The free memory (MB) a demo install waits for before it starts (`install-slots.js`); 0 = off.
    demoInstallMinFreeMb: demoInstallMinFreeMbOf(env),
    // Demo QA runs and vision capture streams at once, and the tabs a QA run reads in (`browser-room.js`).
    browserRuns: browserRunsOf(env),
    demoQaTabs: demoQaTabsOf(env),
    demoReadCacheBytes: demoReadCacheBytesOf(env)
  }
}
