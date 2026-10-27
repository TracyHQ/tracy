import { createServer } from 'node:http'
import { serve } from '@hono/node-server'
import { buildApp } from './app.js'
import { readConfig } from './config.js'
import { docsSiteBuilt } from './docs/route.js'
import { createPool, migrate } from './db/index.js'
import { start as startCron } from './cron.js'
import { hostCall, hostJob } from './host/client.js'
import { pgIdentityStore, memoryIdentityStore } from './identity/store.js'
import { transportFor } from './mail/transport.js'
import { dbSitesResolver } from './sites/resolver.js'
import { workspaceResolver } from './workspace/route.js'
import { modelUpgrade } from './workspace/model-upgrade.js'
import { upgradeListener } from './workspace/upgrade.js'
import { withSessionCookieName, withSessionRevocations } from './lib/session.js'
import { memoryRateLimiter, overLimitBy } from './lib/rate.js'
import { speechHealth } from './lib/speech-health.js'
import { readSpeechProfile } from './lib/speech-provider.js'
import { startSpeechHealth } from './speech/health.js'
import { speechRelay } from './speech/relay.js'
import { speechSwitchOn } from './lib/speech.js'
import { speechKeyterms } from './lib/speech-keyterms.js'
import {
  archiveSessionsAtDoor,
  forgetWorkspaceAtDoor,
  mintSeatSession,
  revokeSeatAtDoor
} from './workspace/seat-door.js'
import { accountByEmail, grantFor } from './seats/store.js'
import { toolsetsFor } from './seats/roles.js'
import { seedShards } from './shards/store.js'

/**
 * Boot the whole service: config, the identity store (Postgres if configured, memory if not),
 * the Hono app, and the raw `upgrade` splice into a host's dsh.
 *
 * @param {object} [input] - env to read config from, a logger, and (for tests) an override for
 *   the seat-door client so a test never dials a real gateway.
 * @returns {Promise<{server: object, port: number, close: () => Promise<void>}>} the running
 *   server, the port it bound (useful when `PORT=0`), and a shutdown.
 */
export async function start({ env = process.env, log = console, deps = {} } = {}) {
  // An image that carries the documentation site needs its host (`DOCS_ORIGIN`): refused here, by
  // name, rather than serving pages whose every asset is missing.
  const config = readConfig(env, { docsBuilt: deps.docsBuilt ?? docsSiteBuilt() })
  let identity = memoryIdentityStore()
  let pool = null
  if (config.databaseUrl) {
    pool = createPool(config.databaseUrl)
    const { applied } = await migrate(pool)
    log.log(`[db] migrated: ${applied.length === 0 ? 'nothing new' : applied.join(', ')}`)
    if (config.deploymentRole === 'master' && config.shardSeed.length > 0) {
      const written = await seedShards(pool, config.shardSeed, config.sessionSecret)
      log.log(`[shards] ${written} of ${config.shardSeed.length} written from SHARDS`)
    }
    identity = pgIdentityStore(pool)
  } else {
    log.warn('[db] DATABASE_URL is empty — sign-ins live in memory and vanish on restart')
    log.warn('[db] the seats routes (My Sites, Team, invitations) are disabled without a pool')
    log.warn('[db] the workspace proxy and every /api/sites/* door are disabled without a pool')
  }
  // Plan 2: `hostOf` now reads the `site` table, so the resolver itself needs the pool — there is
  // no site book to read without one. `null` here is what turns off `workspaceRoutes` below and
  // the `upgrade` splice (both check `sites` before doing anything), the same way a missing pool
  // already turns off `seatsRoutes`.
  const sites = pool ? dbSitesResolver(pool, config) : null
  const seatDoor = deps.seatDoor ?? {
    mintSeatSession,
    revokeSeatAtDoor,
    forgetWorkspaceAtDoor,
    archiveSessionsAtDoor
  }
  const host = deps.host ?? { hostCall, hostJob }
  // `MAIL` missing is not a boot error (#804): the service runs, and every door that mails reports
  // that the mail was not sent. Said once here, because the sign-in doors refuse before a send.
  const mail = transportFor(config.mail, log.log, { localPreview: config.localLoginPreview })
  if (mail.available === false)
    log.warn('[mail] MAIL is not configured: nothing will be sent, and every door that mails says so')
  // The sweeps (Task 9): otp_code/oauth_state/rate_bucket cleanup, and the nightly guest-visitor
  // sweep on every host's dsh. No pool, nothing to sweep — same gate every pool-backed feature above
  // already uses.
  const app = buildApp({
    config,
    env,
    log,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    identity,
    opsStaticDir: deps.opsStaticDir,
    pool,
    invitationsRealKeys: deps.invitationsRealKeys,
    mail,
    sites,
    seatDoor,
    host
  })

  const cron = pool
    ? startCron(pool, config, {
        fetchImpl: deps.fetchImpl,
        log,
        seatDoor,
        signal: app.operationSignal,
        beta: app.betaLogin,
        notifier: app.notifier,
        invitationsRealKeys: app.invitationsRealKeys,
        // The sweep closes the book of a deleted site as the delete door does (`sites/route.js`).
        closeDeletedSite: app.closeDeletedSite,
        // The design system picks of the Add site form whose worker died with its process (`sites/design-system-at-create.js`).
        designSystemSweep: app.designSystemSweep,
        // A shard sends its events to the master (`shard/events-outbox.js`); null on the master.
        shardPump: app.shardPump ?? null,
        // The master's silence sweep and hourly DNS reconcile (`shards/reconcile.js`); null on a shard.
        shardSweeps: app.shardSweeps ?? null,
        // Website Opportunities' research executor (`website-opportunities/src/executor.js`).
        opportunityTick: app.opportunityTick ?? null,
        // The demo QA gate's sweep (`opportunities-build/demo-qa.js`).
        demoQaTick: app.demoQaTick ?? null,
        // Site checks of found restaurants (`website-opportunities/src/site-checks.js`).
        siteChecksTick: app.siteChecksTick ?? null,
        // Social stats of found restaurants (`website-opportunities/src/social-stats.js`).
        socialStatsTick: app.socialStatsTick ?? null,
        socialPrefetchTick: app.socialPrefetchTick ?? null,
        // Demo retention of Website Opportunities (`opportunities-build/demo-retention.js`).
        demoRetentionTick: app.demoRetentionTick ?? null
      })
    : { stop() {} }
  // The AI Assistant's handoff to a person: its Telegram outbox, and on a laptop its long poll.
  const support = app.assistantSupport?.start() ?? { stop: async () => {} }
  const server = await new Promise((resolve) => {
    const s = serve(
      { fetch: app.fetch, port: Number(env.PORT ?? 8080), hostname: '0.0.0.0', createServer },
      (info) => {
        log.log(`[web] ${config.origin} ← listening on ${info.port}`)
        resolve(s)
      }
    )
  })

  // The socket splice reads the SAME resolver the HTTP route does (`workspaceResolver`): which
  // scope the path names, which host's dsh, which cookie, and whether that cookie was minted for
  // the grant in force now. A second, shorter copy of that logic here is exactly how the
  // creation workspace's socket used to be refused while its page loaded fine (the page knew the
  // intent, the handshake did not — measured 13/09).
  const resolver = sites
    ? workspaceResolver({
        config,
        sites,
        pool,
        // The role's fixed toolsets (ADR 0028) — the same answer the HTTP route mints with.
        seats: { accountByEmail, grantFor, toolsetsFor }
      })
    : null
  // Never throws out of itself (`upgrade.js`): a failed handshake closes that one socket.
  // The upgrade reads the session cookie outside Hono, so it is given the app's revocation book
  // itself (`lib/session.js`): a signed-out cookie must not open a workspace socket either.
  const upgrade = upgradeListener({ resolver, config, log, forward: modelUpgrade(config.sessionSecret) })
  // Voice input's socket (`speech/relay.js`) is this app's own, never a dsh one: it is taken here,
  // before the splice, whose resolver would otherwise read a root path as a site's dsh socket.
  // Its seconds of audio use the same rate windows; failed database counts refuse the session.
  const memoryLimit = memoryRateLimiter()
  const speechProbe = pool
    ? startSpeechHealth({
        readProfile: () => readSpeechProfile(pool, config),
        switchOn: () => speechSwitchOn(pool),
        fetchImpl: deps.fetchImpl ?? fetch,
        log
      })
    : null
  const speech = speechRelay({
    config,
    health: speechHealth,
    log,
    // The operator's voice switch (/ops › Agents › Voice): off, every session is refused.
    switchOn: () => speechSwitchOn(pool),
    // The key saved on /ops › Agents › Voice, else SPEECH_TO_TEXT_API_KEY; read per handshake.
    resolveProfile: () => readSpeechProfile(pool, config),
    // The keyterms pilot (/ops › Agents › Voice; none listed by default): a listed site's own names,
    // for an account with a live seat on it — the same seat lookup the workspace doors use.
    keyterms: speechKeyterms({ pool, seats: pool ? { accountByEmail, grantFor } : null }),
    count: pool
      ? (bucket, amount, max, windowMs) => overLimitBy(pool, bucket, amount, max, Date.now(), windowMs)
      : async (bucket, amount, max, windowMs) =>
          memoryLimit.overLimitBy(bucket, amount, max, Date.now(), windowMs)
  })
  server.on('upgrade', (req, socket, head) =>
    withSessionRevocations(app.sessionRevocations, () =>
      withSessionCookieName(config.sessionCookieName, async () => {
        if (req.url?.split('?')[0].startsWith('/widget/native/')) {
          const native = await app.widgetNativeUpgrade?.(req)
          if (!native) {
            socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
            return
          }
          req.url = native.url
          req.headers.cookie = native.cookie
        }
        if (req.url?.split('?')[0] === '/widget/api/speech/stream') {
          const cookie = await app.widgetSpeechCookie?.(req)
          if (!cookie) {
            socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
            return
          }
          req.url = req.url.replace('/widget/api/speech/stream', '/api/speech/stream')
          req.headers.cookie = cookie
        }
        return speech.handles(req) ? speech.upgrade(req, socket, head) : upgrade(req, socket, head)
      })
    ).catch(() => socket.destroy())
  )

  return {
    server,
    port: server.address().port,
    close: async () => {
      speechProbe?.stop()
      await cron.stop()
      await support.stop()
      await app.betaLogin?.stop()
      await new Promise((r) => server.close(r))
      // A vault operation still holding a campaign lock is let finish (bounded), so a stop between
      // taking and releasing the lock cannot leave it held for the next run.
      await app.invitationsRealKeys?.drain?.(8000)
      // The pool this function opened is this function's to end; left open it holds the process
      // for pg's 10 s idle timeout after the last request.
      await pool?.end()
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start()
    .then(({ close }) => {
      // `docker stop` sends SIGTERM and kills after 10 s. Close in time instead of dying mid-work;
      // a close that hangs is cut at 9 s.
      for (const signal of ['SIGTERM', 'SIGINT'])
        process.once(signal, () => {
          const cut = setTimeout(() => process.exit(0), 9000)
          cut.unref()
          close()
            .catch((e) => console.error('[server] shutdown failed', e))
            .finally(() => process.exit(0))
        })
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
