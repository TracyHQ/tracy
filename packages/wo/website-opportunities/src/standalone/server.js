/**
 * The standalone Website Opportunities server (ADR 0036 decision 2): the same open router the full product
 * mounts, with the one-operator host (`./host.js`), photos and logos on disk (`./disk-objects.js`) and the Tracy
 * builder (`../plugins/builders/tracy.js`), which keeps the manual builder's doors beside its own. The browser page in `ui/public/` is served beside the API (`./ui.js`).
 *
 *   node src/standalone/server.js      (settings: `./config.js`, how to run: `../../README.md`)
 *
 * Work in the background (research jobs, site checks, social stats) runs in this process on timers.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { capsFromRuntime, createChargeable, createCostLedger } from '../cost-ledger.js'
import { websiteOpportunitiesDomain } from '../domain-loader.js'
import { createEscalatingFetch } from '../escalating-fetch.js'
import { createExecutor } from '../executor.js'
import { sharedGuardedProxy } from '../guarded-connect-proxy.js'
import { imageInfoWith } from '../media-info.js'
import { menuVisionDoorFor } from '../menu-photo-reading.js'
import { businessReadingDoorFor } from '../business-reading.js'
import { operatorRoutes } from '../ops/operator-routes.js'
import { hubAdminRoutes } from '../ops/hub-admin-routes.js'
import { createPinnedFetch } from '../pinned-fetch.js'
import { routePlaceMediaObjects } from '../place-media-store.js'
import { websiteOpportunitiesRoutes } from '../route.js'
import { migrate as migrateWoSchema } from '../schema/index.js'
import { createSiteChecks } from '../site-checks.js'
import { createSocialStats } from '../social-stats.js'
import { createHubClient } from '../hub/client.js'
import { createHubLink } from '../hub/local-cache.js'
import { createHubService } from '../hub/serve.js'
import createManualBuilder from '../plugins/builders/manual.js'
import createTracyBuilder from '../plugins/builders/tracy.js'
import { tracyOperatorRoutes } from '../ops/tracy-routes.js'
import { createTracyConnection } from '../tracy-connection.js'
import { createTokenFile } from '../tracy-token-file.js'
import { readWoRuntime } from '../wo-settings.js'
import { join } from 'node:path'
import { readStandaloneConfig } from './config.js'
import { createDiskObjects } from './disk-objects.js'
import { createStandaloneHost } from './host.js'
import { ensureOperatorPrincipal } from './operator-principal.js'
import { createPool } from './pool.js'
import { serveUi } from './ui.js'

const RESEARCH_TICK_MS = 5_000
const QUEUE_TICK_MS = 3_000
const HUB_CLIENT_TICK_MS = 60_000

/** No in-process Tracy here (the Tracy builder calls Tracy's public API): the template list is empty, every other internal call is absent. */
async function request(path) {
  const { pathname } = new URL(path, 'http://standalone.invalid')
  if (pathname === '/api/templates') return Response.json({ templates: [] })
  return Response.json({ code: 'NO_BUILDER', next: 'This server builds no demos.' }, { status: 404 })
}

/**
 * The Hono app and its background ticks, on an already migrated database.
 * @param {{
 *   config: ReturnType<typeof readStandaloneConfig>, pool: import('pg').Pool, objects?: object | null,
 *   fetchImpl?: typeof fetch, hubFetch?: typeof fetch, resolve?: Function, loadDomain?: () => Promise<any>,
 *   now?: () => number, log?: Console
 * }} deps
 *   `objects` defaults to files under `config.dataDir`.
 *   `fetchImpl` replaces every outbound call (tests); without it crawls go through the pinned fetch that refuses
 *   private addresses, and provider APIs through `fetch`.
 *   `hubFetch` reaches the hub of `config.hubUrl` (default `fetch`: the operator chose that address, LAN included).
 *   `tracyFetch` reaches `config.tracyUrl` (default `fetch`, for the same reason); `tracyTimeoutMs` bounds each call.
 */
export function createStandaloneApp({
  config,
  pool,
  objects,
  fetchImpl,
  hubFetch,
  tracyFetch,
  tracyTimeoutMs,
  resolve,
  loadDomain,
  now,
  log = console
}) {
  const host = createStandaloneHost({ config })
  // One folder serves both key families: content-addressed `media/…` keys and this install's `places/…` keys.
  const disk = objects === undefined ? createDiskObjects({ dir: config.dataDir }) : objects
  const store = disk && routePlaceMediaObjects({ local: disk, shared: disk })
  const domain = loadDomain ?? websiteOpportunitiesDomain
  const lookup = resolve ?? ((name) => dnsLookup(name, { all: true, verbatim: true }))
  const crawlFetch =
    fetchImpl ?? createPinnedFetch({ isBlockedAddress: async () => (await domain()).isBlockedAddress })
  const apiFetch = fetchImpl ?? fetch
  // No sealed keys here (`host.openSecret` opens none): provider keys come from the environment.
  const menuVisionDoor = () => menuVisionDoorFor(pool, config.sessionSecret, host)
  const runtime = () => readWoRuntime(pool, config, { log, openSecret: host.openSecret, menuVisionDoor })
  const switchOn = async () => true
  const timing = now ? { now } : {}

  // Off unless WO_SITE_READ_TLS: a homepage that refuses Node is read again as Chrome, through the loopback proxy
  // that refuses private addresses at connect time (`impit` is an optional dependency; missing, tier 2 stays off).
  const startRead = createEscalatingFetch({
    baseFetch: crawlFetch,
    getProxy: async () => sharedGuardedProxy({ isBlockedAddress: (await domain()).isBlockedAddress }),
    isEnabled: () => config.woSiteReadTls === true,
    log
  })
  const siteChecks = createSiteChecks({
    pool,
    runtime,
    domain,
    fetchImpl: crawlFetch,
    startRead,
    apiFetch,
    resolve: lookup,
    switchOn,
    log,
    ...timing
  })
  const socialStats = createSocialStats({
    pool,
    runtime,
    domain,
    fetchImpl: apiFetch,
    switchOn,
    log,
    ...timing
  })
  const ledger = createCostLedger({ pool, caps: capsFromRuntime(runtime) })
  const shared = config.woSharedResearch !== false
  const hubLink = config.hubUrl
    ? createHubLink({
        pool,
        client: createHubClient({ url: config.hubUrl, token: config.hubToken, fetchImpl: hubFetch ?? fetch }),
        contribute: config.hubContribute,
        ...timing,
        log
      })
    : null
  const hubService = config.hubServe
    ? createHubService({
        pool,
        host,
        config,
        ledger,
        googleKey: async () => (await runtime()).keys.google,
        fetchImpl: apiFetch,
        resolve: lookup,
        objects: store,
        ...timing,
        log
      })
    : null
  const executor = createExecutor({
    pool,
    host,
    loadDomain: domain,
    runtime,
    objects: store,
    switchOn,
    imageInfo: imageInfoWith(host),
    resolve: lookup,
    fetchImpl: crawlFetch,
    apiFetch,
    shared,
    chargeable: createChargeable(ledger),
    researchLedger: ledger,
    hub: hubLink,
    menuVisionDoor,
    businessReadingDoor: () => businessReadingDoorFor(pool, config.sessionSecret, host),
    log,
    ...timing
  })

  // The Tracy account this server builds demos in; its tokens live in one file next to the photos (`../tracy-token-file.js`).
  const sealing =
    typeof host.sealSecret === 'function' && config.sessionSecret
      ? {
          seal: (plain) => host.sealSecret(plain, config.sessionSecret),
          open: (cipher) => host.openSecret(cipher, config.sessionSecret)
        }
      : {}
  const tracyConnection = createTracyConnection({
    tracyUrl: config.tracyUrl,
    apiUrl: config.tracyApiUrl,
    store: createTokenFile({ path: join(config.dataDir, 'tracy-connection.json'), ...sealing }),
    fetchImpl: tracyFetch ?? fetch,
    ...(tracyTimeoutMs ? { timeoutMs: tracyTimeoutMs } : {}),
    ...timing,
    log
  })
  const builder = createTracyBuilder({
    pool,
    connection: tracyConnection,
    placePhotoUri: config.googleApiKey
      ? async (name) =>
          (await domain()).placePhotoUri(name, {
            googleKey: config.googleApiKey,
            fetch: apiFetch,
            resolve: lookup
          })
      : null,
    manual: createManualBuilder({ pool, objects: store }),
    ...timing,
    log
  })

  const app = new Hono()
  app.get('/healthz', (c) => host.json(c, { ok: true }))
  if (hubService) app.route('/', hubService.routes)
  app.route(
    '/',
    websiteOpportunitiesRoutes({
      config,
      pool,
      host,
      request,
      ensureAccount: (db) => ensureOperatorPrincipal(db),
      builder,
      loadDomain: domain,
      objects: store,
      runtime,
      siteChecks,
      socialStats,
      resolve: lookup,
      fetchImpl: crawlFetch,
      ...timing
    })
  )
  // The operator page's doors; `hub` turns on its Hub tab where the hub admin doors are mounted too.
  app.route(
    '/',
    operatorRoutes({
      config,
      pool,
      host,
      fetchImpl: apiFetch,
      hub: config.hubServe === true,
      tracy: true,
      log,
      ...timing
    })
  )
  app.route('/', tracyOperatorRoutes({ host, connection: tracyConnection, log }))
  if (config.hubServe === true) app.route('/', hubAdminRoutes({ pool, host, log, ...timing }))
  // Without a page (UI_DIR pointing nowhere), `/` points at the API.
  if (!serveUi(app, config.uiDir))
    app.get('/', (c) => host.json(c, { api: '/api/website-opportunities', health: '/healthz' }))
  return {
    app,
    ticks: [
      { ms: RESEARCH_TICK_MS, name: 'research', run: () => executor.tick() },
      { ms: QUEUE_TICK_MS, name: 'site checks', run: () => siteChecks.tick() },
      { ms: QUEUE_TICK_MS, name: 'social stats', run: () => socialStats.tick() },
      // Follows demos sent to Tracy; also finishes a Connect when no page is open to poll it.
      { ms: QUEUE_TICK_MS, name: 'tracy', run: () => builder.tick() },
      { ms: QUEUE_TICK_MS, name: 'tracy connect', run: () => tracyConnection.poll().catch(() => null) },
      ...(hubService ? hubService.ticks : []),
      ...(hubLink ? [{ ms: HUB_CLIENT_TICK_MS, name: 'hub', run: () => hubLink.tick() }] : [])
    ]
  }
}

/**
 * Migrates, makes the operator principal, listens and starts the ticks. Resolves once the server listens.
 * @param {{ env?: Record<string, string | undefined>, migrate?: (pool: any) => Promise<unknown>,
 *   fetchImpl?: typeof fetch, resolve?: Function, log?: Console }} [options]
 *   `migrate` defaults to the package schema's (`../schema/index.js`); `SKIP_MIGRATIONS=1` runs none.
 */
export async function startStandaloneServer({
  env = process.env,
  migrate,
  fetchImpl,
  resolve,
  log = console
} = {}) {
  const config = readStandaloneConfig(env)
  const pool = createPool(config.databaseUrl, { log })
  try {
    if (!config.skipMigrations) await (migrate ?? migrateWoSchema)(pool)
    await ensureOperatorPrincipal(pool)
  } catch (error) {
    await pool.end().catch(() => {})
    throw error
  }
  const { app, ticks } = createStandaloneApp({ config, pool, fetchImpl, resolve, log })
  const timers = ticks.map(({ ms, name, run }) =>
    setInterval(() => run().catch((error) => log.error(`[wo] ${name} tick failed`, error)), ms)
  )
  const server = await new Promise((resolveListen) => {
    const s = serve({ fetch: app.fetch, port: config.port, hostname: config.bind }, () => resolveListen(s))
  })
  const address = server.address()
  const url = `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`
  log.info?.(
    `[wo] Website Opportunities listening on ${url} (${config.operatorToken ? 'token' : 'local only'}, files in ${config.dataDir})`
  )
  return {
    url,
    async close() {
      for (const t of timers) clearInterval(t)
      await new Promise((done) => server.close(() => done(undefined)))
      await pool.end()
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startStandaloneServer().then(
    (running) => {
      for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => running.close().then(() => process.exit(0)))
    },
    (error) => {
      console.error(`[wo] cannot start: ${error.message}`)
      process.exit(1)
    }
  )
}
