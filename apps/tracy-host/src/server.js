/**
 * Boot `tracy-host`: read config, wire the real `run` (`run.js`'s `runScript`) and the real job
 * store (`jobs.js`, bound to `config.jobsDir`), and serve the Hono app on `PORT` — 8090 when unset,
 * which is only the image's own default: `deploy/compose.yml` sets it from `TRACY_HOST_PORT` (51720,
 * the unusual block Tracy moved to on 15/09 so a customer site cannot hold its port).
 *
 * Task 1 shipped a minimal `execFile`-based shim here, written for `/health` only. That shim is
 * gone: `run.js`'s `runScript` is the one runner this process has, and `/health`'s `docker
 * version` probe goes through it exactly the same as `/_host/provision`'s call into
 * `provision.sh` — there is no second, parallel way to shell out living beside it.
 */
import { createServer } from 'node:http'
import { serve } from '@hono/node-server'
import { buildApp } from './app.js'
import { makeOutline, makeShoot } from './browser.js'
import { makeDemoQa } from './demo-qa-browser.js'
import { makePictureOverlap } from './picture-overlap-browser.js'
import { readConfig } from './config.js'
import { runScript } from './run.js'
import { acceptJob, clearDraining, jobAccepted, orphanJobs, putJob, readJob } from './jobs.js'
import { refreshZeroMtimes } from './mtimes.js'
import { backfillContentIdentity } from './content-identity.js'
import { start as startSyncClocks } from './sync.js'

/**
 * @param {object} [input] - env to read config from, a logger, and (for tests) overrides for
 *   `run` so a test never actually shells out, and for `startSync` so a test can see the sync
 *   clocks started and stopped without waiting for them.
 * @returns {Promise<{server: object, port: number, close: () => Promise<void>}>} the running
 *   server, the port it bound (useful when `PORT=0`), and a shutdown.
 */
export async function start({
  env = process.env,
  log = console,
  run = runScript,
  startSync = startSyncClocks
} = {}) {
  const config = readConfig(env)
  // A thin, config-bound view over jobs.js's directory-taking functions — the shape app.js and
  // provision.js expect (`jobs.put(id, fields)` / `jobs.get(id)`), so neither has to know or care
  // where the job files actually live.
  const jobs = {
    put: (id, fields) => putJob(config.jobsDir, id, fields),
    get: (id) => readJob(config.jobsDir, id),
    // The durable "this host took that job" mark `goLiveRoute` answers a repeated key from.
    accept: (id) => acceptJob(config.jobsDir, id),
    accepted: (id) => jobAccepted(config.jobsDir, id)
  }
  if (await clearDraining(config.jobsDir))
    log.log('[host] removed the draining marker a deploy left for the previous process')
  // Anything still "running" from before this boot died with the previous process (jobs.js says why).
  const orphaned = await orphanJobs(config.jobsDir)
  if (orphaned.length)
    log.warn(
      `[host] ${orphaned.length} job(s) left running by the previous process marked failed: ${orphaned.join(', ')}`
    )
  // The capture browser, or null when Playwright is absent (a dev box, or a host that never ran
  // `playwright install`) — the route then answers 503 NO_BROWSER, never a crash.
  const shoot = await makeShoot({ log, visionStreams: config.browserRuns })
  const outline = await makeOutline({ log })
  const demoQa = await makeDemoQa({
    log,
    runsAtOnce: config.browserRuns,
    tabsAtOnce: config.demoQaTabs,
    readCacheBytes: config.demoReadCacheBytes
  })
  log.log(
    `[host] browser work at once: ${config.browserRuns} QA run(s) and capture(s), ${config.demoQaTabs} tab(s) a run`
  )
  const pictureOverlap = await makePictureOverlap({ log })
  const app = buildApp({ config, jobs, run, shoot, outline, demoQa, pictureOverlap })

  const server = await new Promise((resolve) => {
    const s = serve(
      { fetch: app.fetch, port: Number(env.PORT ?? 8090), hostname: '0.0.0.0', createServer },
      (info) => {
        log.log(`[host] ${config.hostName} ← listening on ${info.port}`)
        resolve(s)
      }
    )
  })
  // In the background, after the server answers: the webroots a mtime-0 archive left (mtimes.js).
  const refreshed =
    env.TRACY_HOST_REFRESH_MTIMES === '0'
      ? Promise.resolve({ sites: 0, files: 0 })
      : refreshZeroMtimes({ sitesRoot: config.sitesRoot, log }).catch((error) => {
          log.warn(`[host] giving files at mtime 0 the time now failed: ${error?.message ?? error}`)
          return { sites: 0, files: 0 }
        })
  // Then, still in the background: the content identity a site built before its reader never got
  // (content-identity.js). After the mtime pass, so the two never walk the sites at once.
  const identified =
    env.TRACY_HOST_CONTENT_IDENTITY === '0'
      ? Promise.resolve({ enabled: [], skipped: [], failed: [], why: {} })
      : refreshed
          .then(() => backfillContentIdentity({ config, run, log }))
          .catch((error) => {
            log.warn(`[host] setting up content identity failed: ${error?.message ?? error}`)
            return { enabled: [], skipped: [], failed: [], why: {} }
          })

  // The hourly site-folder push, the ten-minute brand publish and the daily sweep of the copies'
  // expired table snapshots (sync.js) — after the server answers, like the passes above. Nothing
  // started the first two before 02/10/2026. `TRACY_HOST_SYNC=0` turns all three off, the same
  // switch shape as `TRACY_HOST_REFRESH_MTIMES`.
  const sync = env.TRACY_HOST_SYNC === '0' ? null : startSync({ config, run, log })
  if (!sync) log.log('[host] TRACY_HOST_SYNC=0 — the site-folder, brand and snapshot-sweep clocks are off')

  return {
    server,
    port: server.address().port,
    refreshed,
    identified,
    close: () => {
      sync?.stop()
      return new Promise((r) => server.close(r))
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
