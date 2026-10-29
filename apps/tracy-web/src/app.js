import { lookup as dnsLookup } from 'node:dns/promises'
/**
 * The one Hono app. Every domain hangs its routes here, in this order — the order IS the module
 * graph, and nothing else in src/ may import across domains (test/module-graph.test.mjs).
 */
import { Hono } from 'hono'
import { apiRoutes } from './api/route.js'
import { publicDemoRoutes } from './opportunities-build/public-demos-route.js'
import { apiReferenceRoutes, docsReferenceRoutes, ownsDocsReferencePath } from './api-reference/route.js'
import { buildOpenApi } from './api-reference/spec.js'
import { assistantRoutes } from './assistant/route.js'
import { createSupport } from './assistant/support.js'
import { telegramApi } from './assistant/telegram.js'
import { badgeRoutes } from './badge/route.js'
import {
  noSitesPage,
  templateLandingPage,
  templateLookupFailedPage,
  templateNotOnTracyPage,
  workspaceUnavailablePage
} from './bar/pages.js'
import { barRoutes, hostKind, localHostName } from './bar/route.js'
import { proxySite } from './bar/site-proxy.js'
import { siteAccessKeys } from './bar/site-access.js'
import { confirmationRoutes } from './beta/confirmation.js'
import { betaRoutes } from './beta/route.js'
import { updateFeedRoutes } from './desktop/update-feed.js'
import { discordRoutes } from './discord/route.js'
import { routePlaceMediaObjects } from 'website-opportunities/src/place-media-store.js'
import { placeIngestRoutes } from 'website-opportunities/src/place-ingest-door.js'
import { memoryDiscordStore, pgDiscordStore } from './discord/store.js'
import { docsHostRoutes, docsRedirects, REFERENCE_FILES } from './docs/route.js'
import { createRepoFor, deleteRepoFor, githubRoutes, mintGitToken } from './github/route.js'
import { managedFramePolicy } from './host/frame-policy.js'
import { localAccessBook, localAccessRoutes } from './identity/local-access.js'
import { generateCode, hashCode } from './identity/otp.js'
import { identityRoutes } from './identity/route.js'
import { activateInstance, allocateFromPool } from './inventory/allocate.js'
import { eligibleQuickstarts, recordDemoAttestations } from './inventory/eligibility.js'
import { jobKeysFor } from './inventory/policy.js'
import * as inventoryStore from './inventory/store.js'
import { createCampaignKeyStore } from './invitations/real-keys.js'
import { invitationsRealRoutes } from './invitations/real-routes.js'
import { invitationsUnsubscribeRoutes } from './invitations/real-unsubscribe.js'
import { invitationsRoutes } from './invitations/route.js'
import { keysRoutes } from './keys/route.js'
import { laneRoutes } from './lanes/route.js'
import { isApiHost } from './lib/api-host.js'
import { createBetaAccess } from './lib/beta-access.js'
import { createBetaLogin } from './lib/beta-login.js'
import { contractFor, defaultContracts } from './lib/contracts.js'
import { csrfGuard, MIDDLEWARE, WORKSPACE_PROXY } from './lib/csrf.js'
import { recordDownload } from './lib/desktop-download.js'
import { recordCheck } from './lib/desktop-install.js'
import { readDesktopSetting } from './lib/desktop-setting.js'
import { isDocsHost } from './lib/docs-host.js'
import { decodedSiteKey } from './lib/http.js'
import { modelForChain } from './lib/llm-door.js'
import { lookupDoor } from './lib/llm-store.js'
import { localHttpsNavigation } from './lib/local-https.js'
import { loginMailLimiter } from './lib/login-mail-rate.js'
import { MCP_PATHS, onMcpHost, ownsMcpRequest } from './lib/mcp-host.js'
import { createOpsSignal } from './lib/ops-signal.js'
import { markOwnReads } from './lib/own-read.js'
import { pictureFeatures } from './lib/picture-cut.js'
import { labelWithVision, visionKey } from './lib/picture-vision.js'
import { newDoorProbeToken, previewDoorHealth } from './lib/preview-door-health.js'
import { pickAllowed } from './lib/preview-ticket.js'
import { readReleases, templateOfTag } from './lib/quickstart-releases.js'
import { strictTransportSecurity } from './lib/security-headers.js'
import { createLimiter, createSeedModel, DEFAULT_CONCURRENCY } from './lib/seed-model.js'
import { seeder } from './lib/seeder.js'
import { withSessionCookieName, withSessionRevocations } from './lib/session.js'
import { viewAsGuard } from './lib/view-as-guard.js'
import {
  cachedSessionRevocations,
  memorySessionRevocations,
  pgSessionRevocations
} from './lib/session-revocation.js'
import { MASTER_SHARD } from './lib/shard-shapes.js'
import { bornSiteAddress } from './lib/site-address.js'
import { readSiteDesign } from './lib/site-design.js'
import { promptSiteSession, siteSessionAhead } from './lib/site-session-ahead.js'
import { siteTeamUrl } from './lib/team-invite.js'
import { TRACY_ICON_SVG } from './lib/tracy-icon.js'
import { uiSwitchOn } from './lib/ui-setting.js'
import { isUpdateHost } from './lib/update-host.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { woRuntime } from './lib/wo-ops.js'
import { confirmationMail } from './mail/confirmation-mail.js'
import {
  addedToWorkspace,
  betaMail,
  installCodeMail,
  inviteMail,
  joinRequestMail,
  removalCodeMail,
  signInCodeMail,
  teamInviteMail
} from './mail/emails.js'
import { letterFor } from './mail/letters/index.js'
import { siteMailRoutes } from './mail/site-mail/route.js'
import { oauthRoutes } from './mcp/oauth.js'
import { accountTokenResolver } from './lib/account-token.js'
import { deviceClient } from './mcp/clients.js'
import { mcpRoutes } from './mcp/route.js'
import { createNotifier } from './notifications/notify.js'
import { preferenceFor } from './notifications/preferences.js'
import { notificationsRoutes } from './notifications/route.js'
import { unsubscribeHeadersFor } from './notifications/unsubscribe.js'
import { onboardingRoutes } from './onboarding/route.js'
import { seenHintRoutes } from './seen-hints/route.js'
import { welcomeSceneRoutes } from './welcome/route.js'
import { agentDemoCapabilities, agentDemoCreateContext } from './opportunities-build/agent-demo.js'
import { researchOfRevision } from './opportunities-build/revision-research.js'
import { createClientDemoService } from './opportunities-build/client-demo.js'
import { createDemoContactPreview } from 'website-opportunities/src/contact-preview.js'
import { capsFromRuntime, createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createDemoLook } from './opportunities-build/demo-look.js'
import { createDemoPhotoLabels } from './opportunities-build/demo-photo-labels.js'
import { createDemoCopy } from './opportunities-build/demo-copy.js'
import { ownSiteOn } from './opportunities-build/own-site.js'
import { claimAndRunQa, sweepDemoQa } from './opportunities-build/demo-qa.js'
import { sweepDemos } from './opportunities-build/demo-retention.js'
import { createDemoRunner } from './opportunities-build/demo-runner.js'
import { createDubaiPrefetch } from 'website-opportunities/src/dubai-prefetch.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { menuVisionDoorFor } from 'website-opportunities/src/menu-photo-reading.js'
import { businessReadingDoorFor } from 'website-opportunities/src/business-reading.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { createPinnedFetch } from 'website-opportunities/src/pinned-fetch.js'
import { createEscalatingFetch } from 'website-opportunities/src/escalating-fetch.js'
import { sharedGuardedProxy } from 'website-opportunities/src/guarded-connect-proxy.js'
import { createPlaceMaintenance } from 'website-opportunities/src/place-maintenance.js'
import { putQualityBrief, qualityCreateContext } from './opportunities-build/quality-protocol.js'
import { createQualityDemoRunner } from './opportunities-build/quality-runner.js'
import { createQualityVisionTests } from './opportunities-build/quality-vision-test.js'
import { createQuickstartModel } from './opportunities-build/quickstart-model.js'
import { WO_SWITCH, websiteOpportunitiesRoutes } from 'website-opportunities/src/route.js'
import { operatorRoutes as woOperatorRoutes } from 'website-opportunities/src/ops/operator-routes.js'
import { createWebsiteBuilder } from './opportunities-build/route.js'
import { createSiteChecks } from 'website-opportunities/src/site-checks.js'
import { createSiteContent, quickstartActionOpen } from './opportunities-build/site-content.js'
import { createSitePictures } from './opportunities-build/site-pictures.js'
import { createBriefPictureLabels } from './opportunities-build/brief-picture-labels.js'
import {
  createSocialClient,
  replicaSocialDomain,
  socialOrigin
} from 'website-opportunities/src/social-client.js'
import { useSocialStatsSource } from 'website-opportunities/src/place-social-stats.js'
import { createSocialService } from 'website-opportunities/src/social-service.js'
import { socialServiceRoutes } from 'website-opportunities/src/social-service-routes.js'
import { createSocialStats } from 'website-opportunities/src/social-stats.js'
import { admit, denied } from './ops/admit.js'
import { demoSelfNames } from './ops/quickstarts.js'
import { opsRoutes } from './ops/route.js'
import { buildInfoRoutes } from './public/build-info-door.js'
import { configRoutes } from './public/config-door.js'
import { publicRoutes } from './public/route.js'
import { designInspirationRedirects } from './public/design-inspiration-redirects.js'
import { publicTemplatesRoutes } from './public/templates-page.js'
import { publishedTemplates } from './lib/customer-template-cards.js'
import { woPublicFindRoutes } from './public/wo-find-page.js'
import { findResearchOf, withResearch } from 'website-opportunities/src/find-research.js'
import { publicResearchDoor } from 'website-opportunities/src/public-research.js'
import { createTracyWoHost } from './wo-host.js'
import { quickstartDownloadRoutes } from './quickstarts/download.js'
import { createSeatPlanBroker } from './seat-plan/broker.js'
import { seatPlanRoutes } from './seat-plan/route.js'
import { actingEditor, actingOwner, normalizeRole, permissionsFor } from './seats/roles.js'
import { rosterRow, seatsRoutes } from './seats/route.js'
import {
  acceptGrant,
  accountByEmail,
  defaultSiteFor,
  ensureAccount,
  grantFor,
  grantRowFor,
  grantSite,
  liveSiteKeys,
  ownersOf,
  pendingInvitesFor,
  revokeAllGrants,
  rolePolicy,
  seatsOfSite,
  setGrantRole,
  sitesOfAccount,
  unfinishedImportFor
} from './seats/store.js'
import { rebaseUrls, shardCatalogueDoors } from './shard/catalogue.js'
import { shardSignInGuard } from './shard/guard.js'
import { shardNode } from './shard/node.js'
import { shardRoutes } from './shard/route.js'
import { createHandoff } from './shards/adopt-client.js'
import { masterTags, migrationHeadOf, shardCheck } from './shards/check.js'
import { shardCustomHostnames } from './shards/custom-hostnames.js'
import { shardInvitesFor } from './shards/directory.js'
import { cloudflareDns, zoneNames } from './shards/dns.js'
import { shardDoors } from './shards/doors.js'
import { shardEvents } from './shards/events-inbox.js'
import { holdLabel } from './shards/labels.js'
import { shardOpsRoutes } from './shards/ops-routes.js'
import { reconcileDns, sweepSilentShards } from './shards/reconcile.js'
import { routeCookie } from './shards/route-cookie.js'
import { shardSignIn } from './shards/sign-in.js'
import { createShardBook } from './shards/store.js'
import { useShardGuard } from './shards/use-shard.js'
import {
  canonicalSiteKey,
  connectedOwnDomain,
  ownDomainByName,
  publicSiteFields,
  siteByPublicName
} from './sites/address.js'
import {
  compareAgentInventory,
  createAgentDemoInventory,
  inventoryInvariant,
  picturesWhere
} from './sites/agent-demo-inventory.js'
import { presign, signedCall } from './sites/artifacts.js'
import { readBrandFile } from './sites/brand-files.js'
import { createBriefBuilds } from './sites/brief-build.js'
import { createSiteBrand, setSiteBrand } from './sites/brief-engines/brand.js'
import { drawLogoSymbol } from './sites/brief-engines/brand-logo-symbol.js'
import { logoFilesOfPage } from './sites/brief-engines/brand-logo-fit.js'
import { createEmdashEngine } from './sites/brief-engines/emdash.js'
import { createJoomlaEngine } from './sites/brief-engines/joomla.js'
import { headerReader } from './sites/brief-engines/pictures.js'
import { createQuickstartFirstEngine } from './sites/brief-engines/quickstart-first.js'
import { quickstartSlotPhotoEvidence } from './opportunities-build/slot-photo-evidence.js'
import { quickstartReviews } from './lib/quickstart-reviews.js'
import { createWordpressEngine } from './sites/brief-engines/wordpress.js'
import { normalizeBrief } from './sites/brief-normalize.js'
import { briefOf } from './sites/brief-store.js'
import { designSystemLivePages } from './sites/design-system-live-page.js'
import { bodyDigest, probeAnswer, probePage, readWhole } from './sites/domain-probe.js'
import { onTurnClosed } from './sites/door-follow-up.js'
import { inspectOwnJob } from './sites/job-inspect.js'
import { fleetLabel, RESERVED_LABELS } from './sites/label.js'
import { pairComponent } from './sites/pair-component.js'
import { siteReadUrl, siteTarget } from './sites/resolver.js'
import { APPLY_ACTIONS, applyToolsetLabel, sitesRoutes } from './sites/route.js'
import { hostnamesFromConfig } from './sites/site-domain-provider.js'
import {
  appendPreviewErrors,
  appliesOfSession,
  openJobOfKind as openContactJob,
  previewErrorsFor,
  putJob as recordContactJob,
  siteByKey,
  siteByLabel,
  updateJob as updateContactJob
} from './sites/store.js'
import { speechRoutes } from './speech/route.js'
import { widgetRoutes } from './widget/route.js'
import { workspaceRoutes } from './workspace/route.js'
import { onboardingGrant } from './workspace/scope.js'
import { callSeatDoor } from './workspace/seat-door.js'

import { workspacesRoutes } from './workspaces/route.js'
import {
  acceptWorkspaceGrant,
  tracyAdminWorkspace,
  workspaceGrantFor,
  workspaceOfSite,
  workspaceRolePolicyForSite
} from './workspaces/store.js'

/**
 * What the API host answers besides `/health` (registered before every gate): the public API, its
 * reference, the documentation site (`docs/route.js`, S5) and the well-known files. Everything else on that
 * hostname — sign-in, the seat doors, /ops, the dsh workspace — is `NOT_ON_THIS_HOST`
 * (tasks/todo-api-public.md Q5).
 */
const API_HOST_PATHS = [
  { exact: '/' },
  { exact: '/v1' },
  { exact: '/mcp' },
  { exact: '/oauth/token' },
  { exact: '/oauth/revoke' },
  { prefix: '/v1/' },
  { exact: '/docs' },
  { prefix: '/docs/' },
  { prefix: '/.well-known/' }
]
/**
 * The CORS headers for a `/v1` call from the docs origin, or null for every other call. Exposes the
 * headers a `/v1` answer carries that a reader needs to see (`api/route.js`).
 */
const docsCors = (c, pathname, docsOrigin) => {
  if (!docsOrigin || (pathname !== '/v1' && !pathname.startsWith('/v1/'))) return null
  if (c.req.header('origin') !== docsOrigin) return null
  return {
    'access-control-allow-origin': docsOrigin,
    'access-control-expose-headers': 'ETag, Tracy-Apply-Id, X-Tracy-Api-Version, Retry-After'
  }
}
/** What a preflight from the docs origin may ask for: every method and request header `/v1` reads. */
const V1_PREFLIGHT = {
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
  'access-control-allow-headers':
    'Authorization, Content-Type, If-Match, If-None-Match, Idempotency-Key, Tracy-Apply-Id',
  'access-control-max-age': '600',
  vary: 'Origin'
}
const onApiHostAllowlist = (pathname) =>
  API_HOST_PATHS.some((rule) =>
    rule.exact !== undefined ? pathname === rule.exact : pathname.startsWith(rule.prefix)
  )

/** The vision door Website Opportunities looks at pictures with: the `vision` model assignment, else the env's. */
async function visionDoorFor(deps) {
  const resolved = await menuVisionDoorFor(deps.pool, deps.config.sessionSecret, createTracyWoHost(deps))
  return resolved.state === 'ready' ? resolved.door : null
}

export function buildApp(deps) {
  const app = new Hono()
  // Publisher ownership proof is public and independent of database or browser sessions.
  app.get('/.well-known/openai-apps-challenge', (c, next) => {
    if (!deps.config || !onMcpHost(c, deps.config)) return next()
    if (!deps.config.mcpChallenge) return c.notFound()
    c.header('cache-control', 'no-store')
    c.header('x-content-type-options', 'nosniff')
    return c.text(deps.config.mcpChallenge)
  })
  // The customer's Add site preview asked of this app's own doors (`lib/preview-door-health.js`), read by
  // the Road to live on /ops. Off under node --test unless a test hands one in (`deps.doorHealth`).
  const doorProbeToken = newDoorProbeToken()
  const doorHealth =
    deps.doorHealth !== undefined
      ? deps.doorHealth
      : process.env.NODE_TEST_CONTEXT
        ? null
        : previewDoorHealth({ request: (path, init) => app.request(path, init), token: doorProbeToken })
  app.invitationsRealKeys =
    deps.invitationsRealKeys ??
    (deps.config?.invitationsReal?.enabled
      ? createCampaignKeyStore({ root: deps.config.invitationsReal.keyRoot })
      : null)
  // Sign-ins ended by sign-out (J1.3): every read of the session cookie inside a request this app
  // answers checks this book (`lib/session.js`, mounted below). `server.js` hands it to the
  // websocket upgrade too.
  // The cache keeps real time (it is this process's memory, not a policy); only the memory book's
  // row expiry follows the app's clock, like every other expiry it holds. Neither reads the clock
  // on a request that holds no revoked sign-in, so a test's stepped clock is not consumed.
  const sessionRevocations = cachedSessionRevocations(
    deps.pool
      ? pgSessionRevocations(deps.pool)
      : memorySessionRevocations({ now: deps.now ?? (() => Date.now()) })
  )
  app.sessionRevocations = sessionRevocations
  // Who answers each route, declared where it is mounted, for `lib/csrf.js`: it asks the router
  // which routes match a request and needs to know which of them step aside (`next()`) and which
  // one is the workspace proxy. Middleware (`use`, the only way it is mounted here), the `/v1`
  // layer (steps aside off the API host) and the dsh catch-all are declared; every other route is
  // a Tracy door, which is also what an undeclared one is taken for.
  const owners = new Map()
  const use = (path, handler) => {
    owners.set(handler, MIDDLEWARE)
    app.use(path, handler)
  }
  if (deps.config?.origin) use('*', localHttpsNavigation(deps.config))
  // The whitelist page is where a refused sign-in is redirected (`identity/route.js`); a form-started
  // chain may end there (`lib/security-headers.js`, `hardenPage`).
  const waitlistOrigin = deps.config?.beta?.enabled ? deps.config.beta.waitlistOrigin : ''
  if (waitlistOrigin && waitlistOrigin !== deps.config.origin)
    use('*', async (c, next) => {
      c.set('formAction', waitlistOrigin)
      await next()
    })
  const signal =
    deps.signal ??
    createOpsSignal({
      pool: deps.pool ?? null,
      config: deps.config ?? {},
      now: deps.signalNow,
      fetchImpl: deps.fetchImpl,
      log: deps.log ?? { warn() {} }
    })
  deps.identity?.setSignal?.(signal)
  // The shard beta's master half (docs/sre/2026-10-15-shard-beta-design.md): the book of shards every
  // shard door reads. A shard runs none of it.
  const shardBook =
    deps.config && deps.pool && deps.config.deploymentRole !== 'shard'
      ? (deps.shardBook ?? createShardBook({ pool: deps.pool, sessionSecret: deps.config.sessionSecret }))
      : null
  app.shardBook = shardBook
  const shardHandoff = shardBook
    ? createHandoff({
        pool: deps.pool,
        book: shardBook,
        config: deps.config,
        signal,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.now ? { now: deps.now } : {})
      })
    : null
  // The sign-in hooks, built ONCE: the login doors use them here, the routing cookie's
  // `/new/?fresh=1` (Task 13) uses the same instance.
  const shardHooks = shardHandoff
    ? shardSignIn({
        pool: deps.pool,
        book: shardBook,
        config: deps.config,
        handoff: shardHandoff,
        signal,
        pages: { workspaceUnavailable: workspaceUnavailablePage },
        ...(deps.now ? { now: deps.now } : {})
      })
    : null
  // The zone's DNS, written by this master alone (spec §3.2), and the names a site label may not take.
  const shardDns = !shardBook
    ? null
    : deps.shardDns !== undefined
      ? deps.shardDns
      : deps.config.shardDns
        ? cloudflareDns({
            zoneId: deps.config.shardDns.zoneId,
            token: deps.config.shardDns.token,
            ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
          })
        : null
  const shardZone = zoneNames(shardDns, { log: deps.log ?? console })
  const siteLabelsReserved = new Set([
    ...RESERVED_LABELS,
    ...Object.values(deps.config?.ownDomainLabels ?? { connect: 'connect', origin: 'origin' })
  ])
  // Cloudflare for SaaS, held by this master alone (review amendment 7): what a shard's own domains
  // are registered and removed with.
  const shardHostnames = !shardBook
    ? null
    : deps.customHostnames !== undefined
      ? deps.customHostnames
      : hostnamesFromConfig(deps.config, deps.fetchImpl ?? fetch)
  // This master's own tags as the check door answers them (spec §5): the app tag from its env, the
  // dsh tag from its own tracy-host. /ops › Shards reads the same two.
  const shardTags = shardBook
    ? masterTags({
        config: deps.config,
        hostCall: deps.host?.hostCall,
        env: deps.env ?? process.env,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      })
    : null
  const shardMigrationHead = shardBook ? migrationHeadOf(deps.pool) : null
  const beta =
    deps.config && deps.identity && deps.mail
      ? createBetaLogin({
          pool: deps.pool ?? null,
          identity: deps.identity,
          config: deps.config,
          signal,
          now: deps.now,
          otp: { generateCode, hashCode },
          mail: { send: deps.mail.send, signInCodeMail, betaMail },
          access: createBetaAccess({
            config: deps.config,
            pool: deps.pool ?? null,
            identity: deps.identity,
            // A person invited on a shard has the invitation in THAT shard's database: the shard's
            // `account.created {source: "invitation"}` (`shards/events-inbox.js`) is what admits them here.
            pendingInvites: deps.pool
              ? async (email) => [
                  ...(await pendingInvitesFor(deps.pool, email)),
                  ...(await shardInvitesFor(deps.pool, email))
                ]
              : undefined,
            fetchImpl: deps.fetchImpl,
            now: deps.now,
            log: deps.log
          })
        })
      : null
  app.betaLogin = beta
  // The one way an event becomes a notification (spec #809): the log, the reader's settings and
  // the email, with the mail domain's letters bound in here (a domain imports only lib/ and db/).
  // Doors receive `notify`; the cron runs `deliverDue` for retries and held groups.
  // Built once, here, so a deployment with no origin fails at startup rather than on its first letter.
  const links = deps.pool && deps.mail ? notificationLinks(deps.config) : null
  const notifier =
    deps.pool && deps.mail
      ? createNotifier({
          pool: deps.pool,
          send: (letter) => deps.mail.send(letter),
          letterFor: (input) => letterFor({ ...input, links }),
          // Settings › Notifications: the person's switches per group of kinds.
          preferenceFor,
          // One-click unsubscribe (RFC 8058) on every letter whose group can be switched off.
          unsubscribeHeaders: deps.config ? unsubscribeHeadersFor(deps.config) : undefined
        })
      : {
          notify: async () => [],
          deliverDue: async () => ({ sent: 0 }),
          settle: async () => 0,
          settleSite: async () => 0
        }
  app.notifier = notifier
  app.operationSignal = signal
  // First of all: every door below reads the session cookie inside this app's revocation book, and
  // under this deployment's own cookie name besides `tracy_sess` (a shard, `lib/session.js`).
  use('*', (_c, next) =>
    withSessionRevocations(sessionRevocations, () =>
      withSessionCookieName(deps.config?.sessionCookieName, next)
    )
  )
  // `/ops` › View as user: a session that carries `act` is read-only, everywhere but `/ops` (`lib/view-as-guard.js`).
  if (deps.config?.sessionSecret)
    use('*', viewAsGuard({ config: deps.config, ...(deps.now ? { now: deps.now } : {}) }))
  // HSTS on Tracy's own https hostname only, never a customer's (`lib/security-headers.js`).
  // Before every door, so it sees each answer from that hostname whichever door gave it; mounted
  // through `use` so `lib/csrf.js` knows it steps aside.
  if (deps.config?.origin) use('*', strictTransportSecurity(deps.config.origin))
  app.get('/health', (c) => c.json({ ok: true }))
  // The desktop app's update host (`UPDATE_ORIGIN`, tasks/todo-desktop-auto-update.md) — before
  // customer-site routing, since `update.tracy.ai` is also the shape of a site address. That
  // hostname answers the feed and nothing else: no session, no Tracy door, no site.
  if (deps.config?.updateOrigin) {
    const store = deps.config.releaseStore
    const feed = updateFeedRoutes({
      getObject: store ? (key, method) => signedCall(store, { method, key }, deps.fetchImpl ?? fetch) : null,
      record: deps.pool ? (check) => recordCheck(deps.pool, check) : null,
      recordDownload: deps.pool ? (request) => recordDownload(deps.pool, request) : null,
      log: deps.log ?? console
    })
    use('*', async (c, next) => {
      if (!isUpdateHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)) return next()
      return feed.fetch(c.req.raw)
    })
  }
  // The documentation host (`DOCS_ORIGIN`, tasks/todo-desktop-update-policy.md H2) — before
  // customer-site routing, since `docs.tracy.ai` is also the shape of a site address. That hostname
  // is answered by its own router and never reaches a Tracy door: its allowlist is the built site,
  // the API reference and `/.well-known/*`, and everything else is 404 `NOT_ON_THIS_HOST`. No cookie
  // goes in (a `SESSION_DOMAIN=.tracy.ai` cookie rides along from every page of the zone) and none
  // comes out, whatever a route below it does.
  if (deps.config?.docsOrigin) {
    const docsHost = docsHostRoutes({
      ...(deps.docsStaticDir ? { staticDir: deps.docsStaticDir } : {}),
      // The reader's API reference (H4): the `/v1` document with the API host as its server, so
      // "Test request" calls `API_ORIGIN` — which answers the docs origin cross-origin (below).
      reference: docsReferenceRoutes({
        buildSpec: ({ origin, publicApi }) =>
          buildOpenApi({ origin, publicApi, applyActions: APPLY_ACTIONS, toolsetOf: applyToolsetLabel }),
        apiOrigin: deps.config.apiOrigin ?? null
      }),
      referenceOwns: ownsDocsReferencePath
    })
    use('*', async (c, next) => {
      if (!isDocsHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)) return next()
      const headers = new Headers(c.req.raw.headers)
      headers.delete('cookie')
      const res = await docsHost.fetch(new Request(c.req.raw, { headers }))
      if (!res.headers.has('set-cookie')) return res
      const clean = new Response(res.body, res)
      clean.headers.delete('set-cookie')
      return clean
    })
  }
  // MCP may share the product website's hostname. Only its exact paths bypass site routing;
  // cookies are stripped before any OAuth resource or MCP handler can see the request.
  if (deps.config)
    use('*', async (c, next) => {
      if (!ownsMcpRequest(c, deps.config)) return next()
      if (!deps.pool || !deps.host) return c.json({ code: 'MCP_UNAVAILABLE' }, 503)
      if (c.req.raw.headers.has('cookie')) {
        const headers = new Headers(c.req.raw.headers)
        headers.delete('cookie')
        return app.fetch(new Request(c.req.raw, { headers }), c.env)
      }
      return next()
    })
  // Host routing — FIRST, before every other domain (Task 1 of Plan 4). A request whose `Host`
  // names a customer site must never reach identity, seats, sites, workspaces, or the dsh
  // workspace proxy below: those all answer for tracy-web's OWN hostname. Needs a pool (the site
  // book): with none, site hostnames fall through unchanged, the same "no pool, feature off"
  // convention every other domain below already follows.
  //
  // Only `kind: 'site'` and `kind: 'unknown'` (a `--` label — refused outright, not merely
  // unrecognized) are handed to `bar`. `kind: 'tracy'` and `kind: 'custom'` both fall through to
  // `next()` — deliberately the SAME branch, not a bug: there is no domain-lookup for a real
  // customer's own domain yet (`hostKind`'s own docstring on the second-host edge), so treating
  // an unrecognized hostname as "not a site" is the safe default. It is also what keeps every
  // existing caller that reaches this process over a bare loopback address or port — every
  // end-to-end test in `test/proxy.test.mjs`, and `./dev.sh` itself — working exactly as before:
  // none of them sends a `Host` that matches `TRACY_ORIGIN`, and treating that as "unknown, 404"
  // would have been a regression this task's own global constraint forbids.
  if (deps.config && deps.pool) {
    const dsLivePages = designSystemLivePages()
    const bar = barRoutes({
      ensureFramePolicy: managedFramePolicy({ config: deps.config, fetchImpl: deps.fetchImpl }),
      pool: deps.pool,
      config: deps.config,
      sites: {
        byLabel: siteByLabel,
        byName: siteByPublicName,
        ownDomain: ownDomainByName,
        connectedOwnDomain,
        probeAnswer,
        probePage,
        readWhole,
        bodyDigest,
        target: siteTarget,
        // The per-site key the proxy signs who is viewing with (`bar/site-access.js`).
        accessKey: siteAccessKeys(deps.config.siteAccessDir),
        appendPreviewErrors,
        previewErrorsFor,
        templateOfTag: async (pool, tag) => templateOfTag(await readReleases(pool), tag),
        // The Design system preview popup's live frame: the page wearing the system its ticket names.
        dsLivePage: dsLivePages.pageOf
      },
      // Identity only, and only to vouch it on to the site (`x-tracy-email`) — the bar gates
      // nothing, so it needs no identity store, no OTP, no OAuth and no mail transport (ADR 0018).
      seats: { accountByEmail, grantFor },
      // The comment picker's seat rule (plan §S): any live seat, viewer included (ADR 0028).
      // The same function the ticket door uses, so the two can never disagree.
      mayPick: async (_siteKey, role) => pickAllowed(normalizeRole, role),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
    })
    use('*', async (c, next) => {
      if (ownsMcpRequest(c, deps.config)) return next()
      const kind = hostKind(c.req.header('host') ?? new URL(c.req.url).host, deps.config)
      if (
        kind.kind === 'site' ||
        kind.kind === 'unknown' ||
        // 🔒 EVERY OTHER PUBLIC HOSTNAME IS THE SITE ROUTER'S (#1037): a customer's own domain in
        // any state, one a site let go, and one nobody ever held alike. The router serves the site
        // that holds the name and answers its refusal page for the rest — so Tracy's own app (its
        // sign-in page, its API) is never served on a hostname that is not Tracy's. The one
        // exception is spelt out in `localHostName`: an address inside the machine or its private
        // network, which is how health checks, the host service and a developer reach this process.
        (kind.kind === 'custom' && !localHostName(kind.hostname))
      )
        return bar.fetch(c.req.raw)
      return next()
    })
  }
  // The API host (`API_ORIGIN`; tasks/todo-api-public.md S2) — right after customer-site routing
  // and BEFORE every other domain, so nothing below ever answers on that hostname unless it is on
  // the allowlist. Two rules, both of them fail-closed:
  //  1. Outside `API_HOST_PATHS` the answer is 404 `NOT_ON_THIS_HOST`, uncacheable — not a
  //     redirect to Tracy's own hostname, which would teach a caller that the two are one surface.
  //  2. No route on this host may read the session cookie (Q1: the API host takes a Bearer key,
  //     never `tracy_sess`). `SESSION_DOMAIN=.tracy.ai` DOES deliver the cookie here from every
  //     customer site's page, so stripping it at the door is what keeps a page on one site from
  //     writing to another site of the same person through `fetch()`. The header is dropped by
  //     rebuilding the request and dispatching it again: the second pass carries no cookie, so it
  //     falls through this same middleware to the routes below.
  if (deps.config) {
    // `isApiHost` rather than `hostKind(...).kind === 'api'`: the same comparison (`hostKind` calls
    // it), but it needs only `apiOrigin`, so a config with no API host costs one null check per
    // request and never parses `origin` here.
    use('*', async (c, next) => {
      if (!isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)) return next()
      const pathname = new URL(c.req.url).pathname
      if (!onApiHostAllowlist(pathname) || (MCP_PATHS.has(pathname) && !onMcpHost(c, deps.config))) {
        c.header('cache-control', 'private, no-store')
        return c.json({ code: 'NOT_ON_THIS_HOST' }, 404)
      }
      // 3. Cross-origin calls to `/v1` are answered for the docs origin ALONE — the reference's
      //    "Test request" on `DOCS_ORIGIN` (H4). A key in `Authorization`, never credentials: no
      //    `allow-credentials`, and the cookie is dropped below anyway. Any other origin gets no
      //    CORS header, so the browser keeps its answer from the calling page.
      const cors = docsCors(c, pathname, deps.config.docsOrigin)
      if (cors && c.req.method === 'OPTIONS' && c.req.header('access-control-request-method'))
        return new Response(null, { status: 204, headers: { ...cors, ...V1_PREFLIGHT } })
      if (c.req.raw.headers.has('cookie')) {
        const headers = new Headers(c.req.raw.headers)
        headers.delete('cookie')
        // `c.env` passed on: the replay is the same HTTP request (`lib/csrf.js` reads its framing).
        // The replay passes this gate again, which adds the CORS headers there.
        return app.fetch(new Request(c.req.raw, { headers }), c.env)
      }
      await next()
      if (cors) {
        c.res = new Response(c.res.body, c.res)
        for (const [name, value] of Object.entries(cors)) c.res.headers.set(name, value)
        c.res.headers.append('vary', 'Origin')
      }
    })
    // The API host's root is the API's own front page on the docs host (H3, then PR-0b): a 302 to
    // `DOCS_ORIGIN/api/`, since the docs root is the home page for people who use Tracy. It is
    // uncacheable so a future change of the root is seen at once (302 before 301: a browser
    // remembers a 301 across a rollback). With no docs host there is nothing to send the reader
    // to, and the root is refused like any other path. On every other hostname `/` belongs to the
    // workspace door below (`next()`), unchanged.
    app.get('/', (c, next) => {
      if (!isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)) return next()
      if (!deps.config.docsOrigin) {
        c.header('cache-control', 'private, no-store')
        return c.json({ code: 'NOT_ON_THIS_HOST' }, 404)
      }
      c.header('cache-control', 'no-store')
      return c.redirect(`${deps.config.docsOrigin}/api/`, 302)
    })
    // Unpublished `/.well-known/` files on the API host get a plain 404, past the gate,
    // as on the docs host (`docs/route.js`). Without it the path fell through to the workspace door,
    // whose 302 to `/login` names a door this host refuses (measured 11/10/2026 on api.tracy.site).
    // OAuth's protected-resource metadata is owned by the MCP router mounted with the Apply door.
    app.all('/.well-known/*', (c, next) => {
      if (
        ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(
          new URL(c.req.url).pathname
        ) &&
        deps.pool &&
        deps.host
      )
        return next()
      if (!isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)) return next()
      c.header('cache-control', 'private, no-store')
      return c.body(null, 404)
    })
  }
  // The cross-site request guard (#662, `lib/csrf.js`): a cookie-carrying write must come from
  // Tracy's own origin (`Sec-Fetch-Site: same-origin`, or, from a caller that sends no Fetch
  // Metadata, no foreign `Origin`) and declare the body its door reads. Here, and nowhere else: after customer-site
  // routing (a site's own hostname never answers a Tracy door) and after the API host dropped
  // `Cookie`, but before the `/api` canonicaliser below, which reads the invite body and
  // re-dispatches, and before every domain with a side effect — the dsh catch-all included.
  // `owners` is filled as the routers below are mounted: the guard needs to know which request the
  // router hands to the dsh catch-all, and those handlers do not exist yet.
  if (deps.config) use('*', csrfGuard({ config: deps.config, now: deps.now, owners }))
  // The shard pointer (`shards/route-cookie.js`): after the site router (a customer's hostname never
  // gets this far) and before every Tracy page below. Master only.
  if (shardBook)
    use(
      '*',
      routeCookie({
        config: deps.config,
        book: shardBook,
        isTracyHost: (c) =>
          hostKind(c.req.header('host') ?? new URL(c.req.url).host, deps.config).kind === 'tracy',
        fresh: shardHooks ? (c, email) => shardHooks.atFresh(c, email) : null
      })
    )
  // Shard beta (`shard/route.js`): the doors a shard answers for the master. Mounted everywhere so
  // the API reference lists them; each answers 404 NOT_A_SHARD unless TRACY_DEPLOYMENT_ROLE=shard.
  if (deps.config)
    app.route(
      '/',
      shardRoutes({
        config: deps.config,
        pool: deps.pool ?? null,
        identity: deps.identity ?? null,
        now: deps.now
      })
    )
  // Shard beta: the master link, the event outbox and the shard's own checks, for `sites/` and the
  // cron (`shard/node.js`). Null on the master, and wherever there is no database.
  const shard =
    deps.config?.deploymentRole === 'shard' && deps.config.shard && deps.pool
      ? shardNode({
          config: deps.config,
          pool: deps.pool,
          fetchImpl: deps.fetchImpl ?? fetch,
          now: deps.now ?? Date.now,
          log: deps.log ?? console
        })
      : null
  app.shardPump = shard ? () => shard.pump() : null
  // A shard signs nobody in by itself: every entry goes to the master (`shard/guard.js`). Before
  // `identity/route.js` and `lanes/route.js`, which are mounted further down.
  if (deps.config?.deploymentRole === 'shard' && deps.config.shard)
    use('*', shardSignInGuard({ config: deps.config, now: deps.now }))
  // A shard reads the template cards, their pictures and demo frames from the master (`shard/catalogue.js`).
  if (shard)
    use(
      '*',
      shardCatalogueDoors({
        config: deps.config,
        catalogue: shard.catalogue,
        fetchImpl: deps.fetchImpl ?? fetch
      })
    )
  if (deps.config?.localAccess) {
    if (!deps.pool) throw new Error('Local access requires a persistent database')
    app.route(
      '/',
      localAccessRoutes({
        config: deps.config,
        book: localAccessBook(deps.pool, deps.config.localAccess.installationId),
        ensureOwner: (email) => ensureAccount(deps.pool, email),
        now: deps.now
      })
    )
  }

  app.route(
    '/',
    confirmationRoutes({ config: deps.config, pool: deps.pool, mail: deps.mail, confirmationMail })
  )
  // `/docs` and `/docs/*` on every hostname that reaches this far — Tracy's own, the API host, a
  // local address; never a customer site, which the site router took above — moved to the docs host
  // (H3): a 302 to the same page there. The API host keeps answering its three published documents
  // at their old addresses (`/docs/api/openapi.json`, …), and so does a deployment with no docs host
  // to send them to; the OpenAPI reference router below serves them.
  app.route(
    '/',
    docsRedirects({
      docsOrigin: deps.config?.docsOrigin ?? null,
      servesHere: (c) => {
        const pathname = new URL(c.req.url).pathname
        if (!REFERENCE_FILES.some((file) => pathname === `/docs/api/${file}`)) return false
        if (!deps.config?.docsOrigin) return true
        return isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)
      }
    })
  )
  // Alias names are presentation only. Every API continues to authorize canonical identity.
  if (deps.pool)
    use('/api/*', async (c, next) => {
      const url = new URL(c.req.url)
      const match = /^\/api\/sites\/([^/]+)(\/.*)?$/.exec(url.pathname)
      let changed = false
      if (match) {
        // Not text a site can be named by: refused here, before the lookup below sends it to SQL.
        const decoded = decodedSiteKey(match[1])
        if (decoded === null) return c.json({ code: 'INVALID_SITE_KEY' }, 400)
        const supplied = decoded.toLowerCase()
        const canonical = await canonicalSiteKey(deps.pool, supplied)
        if (canonical !== supplied) {
          url.pathname = `/api/sites/${encodeURIComponent(canonical)}${match[2] ?? ''}`
          changed = true
        }
      }
      let body
      if (url.pathname === '/api/team/invite' && c.req.method === 'POST') {
        body = await c.req.raw
          .clone()
          .json()
          .catch(() => undefined)
        if (Array.isArray(body?.siteKeys)) {
          const names = await Promise.all(
            body.siteKeys.map((value) =>
              typeof value === 'string' ? canonicalSiteKey(deps.pool, value.toLowerCase()) : value
            )
          )
          if (names.some((name, i) => name !== body.siteKeys[i])) {
            body.siteKeys = names
            changed = true
          }
        }
      }
      if (!changed) return next()
      const request = new Request(url, c.req.raw)
      // `c.env` passed on: the replay is the same HTTP request, so the guard below judges its body
      // by the same framing (`lib/csrf.js`) — without it a bodiless DELETE to an alias key is a 415.
      return app.fetch(
        body === undefined ? request : new Request(request, { body: JSON.stringify(body) }),
        c.env
      )
    })
  // Public, no deps beyond config — every plugin's client reads this once per page (Task 11).
  if (deps.config) {
    app.route('/', configRoutes({ config: deps.config }))
    // Which build of this server answers (Settings › Help & about); signed in only.
    app.route(
      '/',
      buildInfoRoutes({
        config: deps.config,
        env: deps.env ?? process.env,
        fetchImpl: deps.fetchImpl ?? fetch
      })
    )
  }
  // The badges a site carries — the seat pill and the demo advertisement — read from
  // `badge_setting` when there is a pool, the defaults when there is not. No seat, no session.
  app.route('/', badgeRoutes({ config: deps.config ?? {}, pool: deps.pool ?? null }))
  // The public API reference (`/docs/api`, Scalar, self-hosted) and the OpenAPI document it draws.
  // No seat, no deps: mounted after host routing so a customer's hostname never answers it, and
  // before the dsh catch-all. The door tables live in `sites/`, which `api-reference/` may not
  // import (module graph), so they are handed to the document builder from here.
  app.route(
    '/',
    apiReferenceRoutes({
      buildSpec: ({ origin, internal, publicApi }) =>
        buildOpenApi({
          origin,
          internal,
          publicApi,
          applyActions: APPLY_ACTIONS,
          toolsetOf: applyToolsetLabel
        }),
      // On the api host the document is the public variant — `/v1` alone, that host as server.
      isApiHost: (c) =>
        Boolean(deps.config) && isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config),
      // The internal reference is staff tooling: the same gate as every /ops page.
      admitInternal: deps.config
        ? async (c) => {
            // `admit` answers the admitted person, 'sign-in', or null for no staff seat.
            const who = await admit(c, { pool: deps.pool ?? null, config: deps.config })
            return who === 'sign-in' || who === null ? denied(c, who) : null
          }
        : null
    })
  )
  // The public Design inspiration page (Task 3, ADR 0011) — no seat, model behind
  // `config.model`, brand door on a minted GUEST session of `config.guestSiteKey`.
  if (deps.config) {
    // The published template cards every public Templates reader asks per request (#1762).
    const readPublicTemplates =
      deps.publicTemplates ??
      (shard
        ? async () => {
            const body = await shard.catalogue.templates()
            if (!body) return null
            return rebaseUrls(
              body,
              `${deps.config.shard.masterOrigin}/api/templates/`,
              `${deps.config.origin}/api/templates/`
            ).templates
          }
        : async () => (await publishedTemplates(deps.pool ?? null, deps.config)).templates)
    // The old Design inspiration page addresses move to the Templates pages (301), ahead of the page.
    app.route('/', designInspirationRedirects({ readTemplates: readPublicTemplates, config: deps.config }))
    app.route(
      '/',
      publicRoutes({
        config: deps.config,
        fleetLabel,
        pool: deps.pool ?? null,
        ...(deps.seatDoor ? { seatDoor: deps.seatDoor } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      })
    )
    // The public Templates pages (#1762): one page per published template, read per request from the
    // same cards `GET /api/templates` answers. Ahead of the workspace catch-all, which would send
    // `/templates/…` to sign-in. A shard reads the master's cards, as its `/api/templates` does.
    app.route(
      '/',
      publicTemplatesRoutes({
        config: deps.config,
        readTemplates: readPublicTemplates,
        ...(deps.now ? { now: deps.now } : {})
      })
    )
    // The sign-in-free Find (`/find`): answers on the master only, behind two UI switches.
    app.route(
      '/',
      woPublicFindRoutes({
        config: deps.config,
        pool: deps.pool ?? null,
        loadDomain: deps.websiteOpportunitiesDomain ?? websiteOpportunitiesDomain,
        // Test-only override: where the built page lives (`static/find` in the image).
        ...(deps.woFindPageRoot ? { root: deps.woFindPageRoot } : {}),
        // Published shared research only: with no account, the own-workflow joins match nothing.
        ...(deps.pool
          ? {
              decorateResearch: async (candidates) => {
                const rows = await findResearchOf(deps.pool, candidates, null)
                return candidates.map((candidate, i) => withResearch(candidate, rows[i]))
              },
              // Research pressed by strangers: Google place ids only, on the shared place job.
              research: publicResearchDoor(deps.pool)
            }
          : {}),
        // Same fallback as the signed-in doors: the domain's fetch refuses every host it cannot resolve.
        resolve: deps.dnsResolve ?? ((host) => dnsLookup(host, { all: true, verbatim: true })),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.now ? { now: deps.now } : {})
      })
    )
  }
  if (deps.config)
    app.route('/', betaRoutes({ config: deps.config, pool: deps.pool ?? null, signal, now: deps.now }))
  // ONE limiter for sign-in codes by mail, shared by the two doors that send them (`/login` here,
  // `/auth/otp/start` in `lanes/route.js`): built once so neither door is a way around the other's
  // count (#805).
  const mailRate = loginMailLimiter({ pool: deps.pool ?? null, now: deps.now })
  if (deps.config) {
    app.route(
      '/',
      identityRoutes({
        store: deps.identity,
        // `available` rides along with `send` (#804): this door and the lane door below answer
        // before the beta queue sends anything, so they must know up front that no provider is
        // configured. A transport that does not say (a test's own) counts as available.
        mail: { send: deps.mail.send, available: deps.mail.available !== false, signInCodeMail },
        config: deps.config,
        now: deps.now,
        beta,
        signal,
        mailRate,
        onOAuthSession: (session) => app.widgetOAuthSession?.(session),
        // `defaultSite` on `/auth/me` (Task 9) needs the seat book — a sibling domain, so its
        // function comes through here rather than an import (module graph). OAuth sign-in itself
        // needs neither: it lives entirely in `identity/store.js`, so the two Google/GitHub doors
        // work even in memory-store mode (no DATABASE_URL), same as the OTP door already does.
        // `accountByEmail` (the seat book's, with `display_name` and `avatar_url`) is what
        // `/auth/me` builds the viewer's `face` from.
        ...(deps.pool ? { pool: deps.pool, seats: { defaultSiteFor, accountByEmail } } : {}),
        ...(shardHooks ? { shards: shardHooks } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      })
    )
  }
  // The doors a site's dsh lane signs people in through — the contract `seats.tracy.ai` answered
  // until 16/09/2026 (`lanes/route.js`'s own header has the round in order). Mounted before the dsh
  // catch-all for the same reason as every domain below it, and given the seat book's roster mapper
  // plus the OTP helpers by hand: a domain may not import a sibling (`test/module-graph.test.mjs`).
  if (deps.config) {
    app.route(
      '/',
      laneRoutes({
        pool: deps.pool ?? null,
        config: deps.config,
        store: deps.identity,
        beta,
        mail: deps.mail
          ? { send: deps.mail.send, available: deps.mail.available !== false, signInCodeMail }
          : null,
        seats: { seatsOfSite, rosterRow },
        otp: { generateCode, hashCode },
        mailRate,
        ...(deps.now ? { now: deps.now } : {})
      })
    )
  }
  // The doors Tracy's Discord bot calls (`discord/route.js`): a member proves an address with the
  // sign-in letter, and their posts reach `/ops` as signals. Same OTP helpers and the same shared
  // mail limiter as the two doors above, handed in for the module-graph rule.
  if (deps.config) {
    app.route(
      '/',
      discordRoutes({
        config: deps.config,
        pool: deps.pool ?? null,
        store: deps.discordStore ?? (deps.pool ? pgDiscordStore(deps.pool) : memoryDiscordStore()),
        beta,
        mail: deps.mail
          ? { send: deps.mail.send, available: deps.mail.available !== false, signInCodeMail }
          : null,
        otp: { generateCode, hashCode },
        signal,
        mailRate,
        ...(deps.now ? { now: deps.now } : {})
      })
    )
  }

  // Mounted BEFORE workspaceRoutes, and the composition root — not `seats/route.js` — is the one
  // place `mail/emails.js`'s templates meet the transport: `seats/route.js` is a domain (module
  // graph: imports only `lib/`, `db/`, and itself), and `mail/` is a sibling domain, not a shared
  // one. `identityRoutes` already receives `mail` shaped like this (a bare `{ send }`); seats
  // routes need the same object with the templates bound alongside it.
  if (deps.config && deps.pool && deps.sites) {
    app.route(
      '/',
      seatsRoutes({
        pool: deps.pool,
        config: deps.config,
        mail: { send: deps.mail.send, inviteMail, addedToWorkspace, joinRequestMail, teamInviteMail },
        notify: notifier.notify,
        settleNotifications: notifier.settle,
        sites: deps.sites,
        seatDoor: deps.seatDoor,
        // The role change door re-mints the seat at every host with the toolsets the effective
        // policy resolves — workspace first (`lib/role-policy.js`), a sibling domain's reader.
        workspaces: { workspaceRolePolicyForSite },
        now: deps.now
      })
    )
  }
  // Seat keys (`keys/route.js`): the viewer's Bearer keys for the api host. Mounted beside
  // seatsRoutes for the same reason — a domain of its own that needs the seat book's functions, a
  // sibling's, handed through from here.
  if (deps.config && deps.pool) {
    app.route(
      '/',
      keysRoutes({
        pool: deps.pool,
        config: deps.config,
        seats: { accountByEmail, grantFor, permissionsFor },
        // A public name (alias) names the same site as its canonical key — the same resolution the
        // `/api/sites/:key` middleware above applies to a path.
        canonicalSiteKey,
        appName: (clientId) => deviceClient(clientId)?.name ?? clientId,
        now: deps.now
      })
    )
  }
  // The AI Assistant (`assistant/route.js`, 05/10/2026): a chat about Tracy and the asker's
  // own sites. Its readers are siblings' functions, handed through here (module graph). Mounted
  // before workspaceRoutes (the dsh catch-all) so `/api/assistant/*` is answered here.
  // Its handoff to a person (`assistant/support.js`) rides the Customer Service bot when one is
  // configured, and keeps staff photos in the artifact store through the same presigned calls a
  // comment's attachments use. `server.js` starts its outbox (and, on a laptop, its long poll).
  // The same store client serves the files a customer attaches to a Help question (`assistant/files.js`).
  const assistantObjects = deps.config
    ? storeObjects(deps.config.artifactStore ?? null, deps.fetchImpl ?? fetch)
    : null
  const support =
    deps.config && deps.pool
      ? createSupport({
          pool: deps.pool,
          cs: deps.config.csTelegram ?? null,
          api: deps.config.csTelegram
            ? (deps.telegramApi ??
              telegramApi({
                token: deps.config.csTelegram.token,
                ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
              }))
            : null,
          objects: assistantObjects,
          ...(deps.log ? { log: deps.log } : {}),
          ...(deps.now ? { now: deps.now } : {})
        })
      : null
  app.assistantSupport = support
  if (deps.config && deps.pool) {
    app.route(
      '/',
      assistantRoutes({
        pool: deps.pool,
        config: deps.config,
        readers: { accountByEmail, sitesOfAccount, siteByKey, briefOf, publicSiteFields, canonicalSiteKey },
        ensureAccount,
        support,
        objects: assistantObjects,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.now ? { now: deps.now } : {}),
        ...(deps.log ? { log: deps.log } : {})
      })
    )
  }
  // The Inbox doors (`notifications/route.js`, spec #809): the signed-in person's own notification
  // log. Mounted before workspaceRoutes (the dsh catch-all) so `/api/notifications` is answered here.
  if (deps.config && deps.pool) {
    app.route('/', notificationsRoutes({ config: deps.config, pool: deps.pool }))
    // The Getting started screen's account flag (`onboarding/route.js`), before the dsh catch-all.
    app.route('/', onboardingRoutes({ config: deps.config, pool: deps.pool, now: deps.now }))
    app.route('/', seenHintRoutes({ config: deps.config, pool: deps.pool }))
    // The first-run Welcome popup's animated scenes (`welcome/route.js`), before the dsh catch-all.
    app.route('/', welcomeSceneRoutes({ config: deps.config }))
  }
  // Website Opportunities (`website-opportunities/src/`, spec tasks/spec-website-opportunities-contracts.md): its
  // doors before the dsh catch-all, its research executor run by the cron tick (`server.js`). Builds go
  // through this app's own `POST /api/sites` with the caller's cookie, as the widget's do.
  let readAgentNativeInventory = null
  let clientDemoService = null
  app.opportunityTick = null
  app.demoQaTick = null
  app.siteChecksTick = null
  app.socialStatsTick = null
  app.socialPrefetchTick = null
  app.demoRetentionTick = null
  if (deps.config && deps.pool) {
    // The open layer's only way into Tracy's infrastructure (`website-opportunities/src/host.js`, ADR 0036).
    const woHost = createTracyWoHost({ pool: deps.pool, config: deps.config })
    // Test-only override: a test serves the stored bytes itself.
    const objects =
      deps.websiteOpportunitiesObjects ?? placeMediaObjectsFor(deps.config, deps.fetchImpl ?? fetch)
    // Another deployment's push of one place's research (`website-opportunities/src/place-ingest-door.js`): 404
    // unless WO_PLACES_INGEST_SECRET is set, and never on a shard.
    app.route('/', placeIngestRoutes({ config: deps.config, pool: deps.pool, objects, host: woHost }))
    const socialRole = deps.config.woSocialRole ?? 'standalone'
    if (!['standalone', 'central', 'client'].includes(socialRole)) throw new Error('Invalid social role')
    // A place profile reads follower and post counts where this deployment keeps them (its cache, or the replica).
    useSocialStatsSource({ role: socialRole, origin: socialOrigin(deps.config.woSocialOrigin) })
    const baseDomain = deps.websiteOpportunitiesDomain ?? websiteOpportunitiesDomain
    const loadDomain =
      socialRole === 'client' ? async () => replicaSocialDomain(await baseDomain()) : baseDomain
    const resolve = deps.dnsResolve ?? ((host) => dnsLookup(host, { all: true, verbatim: true }))
    // Crawling dials untrusted names: the connection's own lookup refuses private addresses (rebinding).
    const crawlFetch =
      deps.fetchImpl ??
      createPinnedFetch({ isBlockedAddress: async () => (await loadDomain()).isBlockedAddress })
    // The demo QA gate (`opportunities-build/demo-qa.js`): the site's host reads it in a browser; repair lists go
    // into the hand-off chat on a seat minted for the person who pressed. Test-only overrides for both.
    const woDemoQa =
      deps.websiteOpportunitiesDemoQa ??
      (deps.host
        ? (site, payload) =>
            deps.host.hostCall(
              deps.config,
              site.host ?? deps.config.defaultHost,
              '/demo-qa',
              {
                label: site.label,
                platform: site.platform,
                port: site.port ?? null,
                // The names the site answers to (WordPress writes every link and redirect with them).
                ...demoSelfNames(deps.config, site),
                // The host's hard deadline includes its queue and closes the context before transport expires.
                budgetMs: payload.baseline ? 180_000 : 45_000,
                ...payload
              },
              {
                fetchImpl: deps.fetchImpl ?? fetch,
                // The inventory's routes are read on their own time (`routeBudgetMs`), on top of the pages'.
                timeoutMs: (payload.baseline ? 260_000 : 85_000) + (payload.routeBudgetMs ?? 0)
              }
            )
        : null)
    const woVisionDoor = () => visionDoorFor(deps)
    // A finished demo looked at by a vision model at desktop and phone width (`opportunities-build/demo-look.js`).
    const woDemoLook =
      deps.websiteOpportunitiesDemoLook ??
      (deps.host
        ? createDemoLook({
            capture: (site, layouts, { onFrame, signal }) =>
              deps.host.hostStreamCall(
                deps.config,
                site.host ?? deps.config.defaultHost,
                '/capture',
                {
                  label: site.label,
                  platform: site.platform,
                  layouts,
                  port: site.port ?? null,
                  // Pages open at the site's own name, served from the address that answers, as `/demo-qa` reads
                  // them: on the stand every page but home redirected to `<label>-web-1:8080` (24/10/2026).
                  ...demoSelfNames(deps.config, site),
                  mode: 'vision-tiles/1'
                },
                { onFrame, signal, fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: 240_000 }
              ),
            visionFor: woVisionDoor,
            chargeable: createChargeable(
              createCostLedger({
                pool: deps.pool,
                caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
              })
            ),
            fetchImpl: deps.fetchImpl ?? fetch
          })
        : null)
    const woPrompt =
      deps.websiteOpportunitiesPrompt ??
      (async (site, email, sessionId, requestId, text) => {
        const account = await accountByEmail(deps.pool, email)
        const grant = account ? await grantFor(deps.pool, account.id, site.site_key) : null
        if (grant?.role !== 'owner') return false
        return promptSiteSession({
          config: deps.config,
          seatDoor: deps.seatDoor ?? {},
          fetchImpl: deps.fetchImpl ?? fetch,
          site,
          email,
          sessionId,
          requestId,
          text
        })
      })
    const qaDeps = {
      readNativeInventory: (args) =>
        readAgentNativeInventory
          ? readAgentNativeInventory(args)
          : Promise.reject(new Error('AGENT_DEMO_INVENTORY_UNAVAILABLE')),
      compareNativeInventory: compareAgentInventory,
      demoQa: woDemoQa,
      prompt: woPrompt,
      log: deps.log ?? console,
      ...(deps.now ? { now: deps.now } : {})
    }
    // The background verdict on each found restaurant's current website (`website-opportunities/src/site-checks.js`).
    const woRuntimeOf = () => woRuntime(deps.pool, deps.config, deps.log ? { log: deps.log } : {})
    // Background fetches stop with the feature's switch; an unreadable switch is off.
    const woSwitchOn = () => uiSwitchOn(deps.pool, WO_SWITCH).catch(() => false)
    // Research and build work also runs for Add site's Build from my business (`opportunities-build/own-site.js`), whose
    // switch is its own; the background crawls of found restaurants (site checks, social stats, prefetch) do not.
    const woWorkOn = async () => (await woSwitchOn()) || (await ownSiteOn(deps.pool))
    // A homepage that refuses Node's TLS is read once more as Chrome, through the loopback proxy that refuses
    // private addresses at connect time. Off unless WO_SITE_READ_TLS; `impit` resolves from this app's node_modules.
    const siteReadTiers = createEscalatingFetch({
      baseFetch: crawlFetch,
      getProxy: async () => sharedGuardedProxy({ isBlockedAddress: (await loadDomain()).isBlockedAddress }),
      loadImpit: () => import('impit'),
      isEnabled: () => deps.config.woSiteReadTls === true,
      ...(deps.log ? { log: deps.log } : {})
    })
    const siteChecks = createSiteChecks({
      pool: deps.pool,
      runtime: woRuntimeOf,
      domain: loadDomain,
      fetchImpl: crawlFetch,
      startRead: siteReadTiers,
      apiFetch: deps.fetchImpl ?? fetch,
      resolve,
      switchOn: woSwitchOn,
      ...(deps.log ? { log: deps.log } : {}),
      ...(deps.now ? { now: deps.now } : {})
    })
    app.siteChecks = siteChecks
    app.siteChecksTick = () => siteChecks.tick()
    // Followers and posting dates of found restaurants' social pages (`website-opportunities/src/social-stats.js`).
    const socialStats = (socialRole === 'client' ? createSocialClient : createSocialStats)({
      origin: deps.config.woSocialOrigin,
      token: deps.config.woSocialToken,
      pool: deps.pool,
      runtime: woRuntimeOf,
      domain: loadDomain,
      fetchImpl: deps.fetchImpl ?? fetch,
      switchOn: woSwitchOn,
      ...(deps.log ? { log: deps.log } : {}),
      ...(deps.now ? { now: deps.now } : {})
    })
    if (socialRole === 'central') {
      const service = createSocialService({
        pool: deps.pool,
        domain: loadDomain,
        stats: socialStats,
        ...(deps.now ? { now: deps.now } : {})
      })
      app.route(
        '/',
        socialServiceRoutes({
          pool: deps.pool,
          host: woHost,
          service,
          pepper: deps.config.woSocialKeyPepper,
          ...(deps.now ? { now: deps.now } : {})
        })
      )
    }
    app.socialStats = socialStats
    app.socialStatsTick = () => socialStats.tick()
    // Unused demos freeze, then go through the site's own delete (`opportunities-build/demo-retention.js`),
    // acted as the account that built them. `app.teardownSiteAs` is mounted with the site doors below.
    app.demoRetentionTick = async () => {
      // The feature's switch off stops the sweep too, like the two ticks above.
      if (!(await woSwitchOn())) return { ran: false, reason: 'switch-off' }
      return sweepDemos(deps.pool, {
        now: (deps.now ?? Date.now)(),
        settings: (await woRuntimeOf()).settings,
        teardown: async (build) => {
          if (typeof app.teardownSiteAs !== 'function') return 'busy'
          const { rows } = await deps.pool.query('select email from account where id = $1', [
            build.account_id
          ])
          return rows[0] ? app.teardownSiteAs(build.site_key, rows[0].email) : 'busy'
        },
        log: deps.log ?? console
      })
    }
    if (woDemoQa) {
      app.demoQaTick = () => sweepDemoQa(deps.pool, qaDeps)
      // A hand-off chat's turn just closed: its round now, not at the next sweep.
      app.demoQaUnhook = onTurnClosed(({ siteKey }) => claimAndRunQa(deps.pool, qaDeps, { siteKey }))
    }
    const opportunityDeps = {
      checkDemoGrant: async (accountId, siteKey) =>
        (await grantFor(deps.pool, accountId, siteKey))?.role === 'owner',
      resumeFill: (build, email, actionId) => app.resumeOpportunityFill?.(build, email, actionId) ?? false,
      config: deps.config,
      pool: deps.pool,
      host: woHost,
      // Test-only override: a test answers `/api/templates` and `/api/sites` itself.
      request:
        deps.websiteOpportunitiesRequest ??
        ((path, init) => app.request(new URL(path, deps.config.origin).href, init)),
      ensureAccount,
      loadDomain,
      objects,
      runtime: woRuntimeOf,
      // The hand-off prompt goes into that chat from the server (same sender as the QA gate's repairs).
      prompt: woPrompt,
      // Test-only override: a test names the chat it would have made.
      sessionAhead:
        deps.websiteOpportunitiesSessionAhead ??
        (async (site, email, sessionId) => {
          const account = await accountByEmail(deps.pool, email)
          const grant = account ? await grantFor(deps.pool, account.id, site.site_key) : null
          if (grant?.role !== 'owner') return null
          return siteSessionAhead({
            config: deps.config,
            seatDoor: deps.seatDoor ?? {},
            fetchImpl: deps.fetchImpl ?? fetch,
            site,
            email,
            sessionId
          })
        }),
      prepareDemoContact: createDemoContactPreview({
        config: deps.config,
        host: deps.host,
        fetchImpl: deps.fetchImpl ?? fetch,
        findJob: (site) => openContactJob(deps.pool, site.site_key, 'site-demo-contact', 30 * 60_000),
        recordResult: (id, body) =>
          updateContactJob(deps.pool, id, { state: body?.state, step: body?.step, detail: body }),
        recordJob: (site, id) =>
          recordContactJob(deps.pool, {
            id,
            siteKey: site.site_key,
            host: site.host,
            kind: 'site-demo-contact'
          })
      }),
      readNativeInventory: (args) =>
        readAgentNativeInventory
          ? readAgentNativeInventory(args)
          : Promise.reject(new Error('AGENT_DEMO_INVENTORY_UNAVAILABLE')),
      compareNativeInventory: compareAgentInventory,
      picturesWhere,
      demoQa: woDemoQa,
      demoLook: woDemoLook,
      // The sweep's wordmark on a CMS dsh sets no logo on (Joomla, EmDash): its brand writer, as the account that
      // built the demo (`client-demo.js` `wornLogo`).
      wearLogo: async (build, site, { png, applyId }) => {
        const { rows } = await deps.pool.query('select email from account where id = $1', [build.account_id])
        if (!rows[0] || typeof app.applyAs !== 'function')
          return { written: [], skipped: [{ where: 'logo', reason: 'no seat to write the logo as' }] }
        return setSiteBrand({
          platform: site.platform,
          siteKey: site.site_key,
          release: site.quickstart_tag
            ? { tag: site.quickstart_tag, version: site.quickstart_version ?? null }
            : null,
          pack: { logo: { single: new Uint8Array(Buffer.from(png, 'base64')) } },
          call: (call) => app.applyAs(rows[0].email, call),
          applyId,
          note: (line) => deps.log?.info?.(`demo logo ${site.site_key}: ${line}`)
        })
      },
      siteChecks,
      socialStats,
      // What the brief's photographs show, labelled when the brief is made (F08): the build's vision door, key and cache,
      // every own photo plus others up to TRACY_BRIEF_VISION_MAX_PICTURES (60) in total, billed to the research caps. `deps.…PictureLabels`: a test's own.
      pictureLabels:
        deps.websiteOpportunitiesPictureLabels ??
        createBriefPictureLabels({
          pool: deps.pool,
          objects,
          chargeable: createChargeable(
            createCostLedger({
              pool: deps.pool,
              caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
            })
          ),
          visionFor: async () => {
            const door = await visionDoorFor(deps)
            return door ? { door, key: visionKey(door) } : null
          },
          ...(Number(process.env.TRACY_BRIEF_VISION_MAX_PICTURES) > 0
            ? { maxPictures: Number(process.env.TRACY_BRIEF_VISION_MAX_PICTURES) }
            : {}),
          log: deps.log ?? console
        }),
      quality: deps.websiteOpportunitiesQuality ?? null,
      resolve,
      fetchImpl: crawlFetch,
      ...(deps.now ? { now: deps.now } : {})
    }
    clientDemoService = createClientDemoService({ ...opportunityDeps, runtime: woRuntimeOf })
    opportunityDeps.clientDemo = clientDemoService
    // Tracy builds demos: the open doors get its builder (ADR 0036).
    opportunityDeps.builder = createWebsiteBuilder(opportunityDeps)
    // The open layer's operator doors, for Tracy's /ops staff (`wo-host.js` requireOperator); the hub is not served here.
    app.route(
      '/',
      woOperatorRoutes({
        pool: deps.pool,
        config: deps.config,
        host: woHost,
        fetchImpl: deps.fetchImpl ?? fetch,
        ...(deps.now ? { now: deps.now } : {})
      })
    )
    app.route('/', websiteOpportunitiesRoutes(opportunityDeps))
    // `/v1/demos` (tasks/todo-wo-public-demos.md B): an outside builder asks for a demo with an account token, on the
    // api host only, through the same demo actions as the Build demo button. Before `/v1`'s own 404 (`api/route.js`).
    // Account tokens (device flow, `lib/account-token.js`), made here so `/v1/demos` and `/v1` share one resolver.
    const requireAccountToken = accountTokenResolver({
      pool: deps.pool,
      pepper: deps.config.apiKeyPepper,
      audience: deps.config.apiOrigin,
      ...(deps.now ? { now: deps.now } : {})
    })
    app.requireAccountToken = requireAccountToken
    const demosAccount = async (c, scope) => {
      const auth = await requireAccountToken(c, scope)
      return auth.error ?? auth
    }
    const onApiHostForDemos = (c) => isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config)
    const publicDemos = publicDemoRoutes({
      pool: deps.pool,
      config: { origin: deps.config.origin, apiOrigin: deps.config.apiOrigin ?? deps.config.origin },
      isApiHost: onApiHostForDemos,
      // Part A's resolver (account token, scope `demos`); until it is wired every call is refused.
      requireAccountToken: deps.requireAccountToken ?? demosAccount,
      loadDomain,
      resolve,
      fetchImpl: crawlFetch,
      imageInfo: imageInfoWith(woHost),
      objects,
      templateCards: opportunityDeps.builder.templateCards,
      woSettings: async () => (await woRuntimeOf()).settings,
      switchOn: woWorkOn,
      // The agent demo's site and chat (the same service Tracy's own Build demo uses).
      clientDemo: clientDemoService,
      ...(deps.now ? { now: deps.now } : {})
    })
    for (const route of publicDemos.routes)
      owners.set(route.handler, { stepsAside: (c) => !onApiHostForDemos(c) })
    app.route('/', publicDemos)
    const demoRunner = createDemoRunner({
      ...opportunityDeps,
      // The demo-leftover check's page reader (#191): the site reader is made with the host, below.
      readSitePage: (/** @type {string} */ siteKey, /** @type {string} */ path) =>
        /** @type {any} */ (app).readSitePage?.(siteKey, path) ?? null,
      runtime: woRuntimeOf,
      switchOn: woWorkOn,
      log: deps.log ?? console
    })
    app.demoRunner = demoRunner
    const qualityRunner = deps.websiteOpportunitiesQuality
      ? createQualityDemoRunner({
          ...opportunityDeps,
          quality: deps.websiteOpportunitiesQuality,
          accountIds: deps.websiteOpportunitiesQuality.accountIds,
          runtime: woRuntimeOf,
          switchOn: woSwitchOn,
          log: deps.log ?? console
        })
      : null
    app.qualityRunner = qualityRunner

    const sharedResearch = deps.config.woSharedResearch !== false
    const researchLedger = createCostLedger({ pool: deps.pool, caps: capsFromRuntime(woRuntimeOf) })
    app.dubaiPrefetch = createDubaiPrefetch({
      siteChecks,
      socialStats,
      objects,
      runtime: woRuntimeOf,
      ledger: researchLedger,
      pool: deps.pool,
      role: socialRole,
      enabled: sharedResearch,
      fetchImpl: crawlFetch,
      resolve,
      loadDomain: baseDomain,
      ...(deps.now ? { now: deps.now } : {})
    })
    if (socialRole === 'central' && sharedResearch) {
      app.socialPrefetchTick = async () =>
        (await woSwitchOn()) ? app.dubaiPrefetch.tick() : { ran: false, reason: 'switch-off' }
    }
    // Tracy pays shared research: every paid call of a place run (or the backfill) is reserved against `/ops/wo`'s caps.
    const researchCharge = createChargeable(researchLedger)
    // The backfill of research from before places, and the URL ↔ Google merges (`place-maintenance.js`).
    const placeMaintenance = sharedResearch
      ? createPlaceMaintenance({
          pool: deps.pool,
          objects,
          runtime: woRuntimeOf,
          loadDomain,
          domainDeps: { fetch: crawlFetch, resolve },
          chargeable: researchCharge,
          ...(deps.log ? { log: deps.log } : {})
        })
      : null

    const executor = createExecutor({
      pool: deps.pool,
      host: woHost,
      loadDomain,
      runtime: woRuntimeOf,
      objects,
      switchOn: woWorkOn,
      imageInfo: imageInfoWith(woHost),
      resolve,
      fetchImpl: crawlFetch,
      shared: sharedResearch,
      prefetch: socialRole === 'central',
      prefetchConcurrency: app.dubaiPrefetch.capacity,
      chargeable: researchCharge,
      researchLedger,
      afterPublish: placeMaintenance?.afterPublish ?? null,
      menuVisionDoor: () => menuVisionDoorFor(deps.pool, deps.config.sessionSecret, woHost),
      businessReadingDoor: () => businessReadingDoorFor(deps.pool, deps.config.sessionSecret, woHost),
      ...(deps.log ? { log: deps.log } : {})
    })
    app.opportunityExecutor = executor
    app.opportunityTick = async () => {
      if (placeMaintenance)
        await placeMaintenance
          .tick()
          .catch((error) => (deps.log ?? console).error('[opportunities] place maintenance failed', error))
      return Promise.all([
        executor.tick(),
        demoRunner.tick(),
        ...(qualityRunner ? [qualityRunner.tick()] : [])
      ])
    }
  }
  // Voice input in the chat box (`speech/route.js`): whether this deployment has a speech key. The
  // live socket is `server.js`'s (`speech/relay.js`). Needs no pool, so not under the gate above.
  if (deps.config && deps.pool) {
    const widget = widgetRoutes({
      config: deps.config,
      pool: deps.pool,
      nativeSessionOptions: {
        mintNative: async ({ email, sessionId, agentPreset }) => {
          const dsh = deps.sites?.dshOf(deps.config.defaultHost)
          if (!dsh?.origin || !dsh.seatSecret) return null
          const answer = await callSeatDoor({
            origin: dsh.origin,
            secret: dsh.seatSecret,
            path: '/gateway/seat/session',
            payload: { ...onboardingGrant(email, deps.config), nativeSession: { sessionId, agentPreset } },
            ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
          })
          return answer.ok ? answer.body?.nativeSession : null
        }
      },
      nativeBuildStatus: async ({ accountId, build }) => {
        if (!build?.siteKey || !build.jobId) return { state: 'missing', links: null }
        if (!(await grantFor(deps.pool, accountId, build.siteKey)))
          return { state: 'unavailable', links: null }
        const read = await inspectOwnJob(deps.pool, { accountId, siteKey: build.siteKey, jobId: build.jobId })
        return read.status === 200 ? read.body : { state: 'unavailable', links: null }
      },
      request: (path, init) => app.request(new URL(path, deps.config.origin).href, init)
    })
    app.widgetOAuthSession = widget.oauthSession
    app.widgetSpeechCookie = widget.speechCookie
    app.widgetNativeUpgrade = widget.nativeUpgrade
    app.get('/api/widget-native/context', widget.nativeContext)
    app.route('/widget', widget)
  }
  if (deps.config) app.route('/', speechRoutes({ config: deps.config, pool: deps.pool ?? null }))
  // Mounted BEFORE workspaceRoutes (the dsh catch-all), same reasoning as seatsRoutes/sitesRoutes
  // above: `workspaces/route.js` is a domain of its own, and the site-book functions it needs to
  // check that whoever declares a site's workspace already sits on that site as owner/admin
  // (#663) are a sibling domain's, not a shared one.
  if (deps.config && deps.pool) {
    app.route(
      '/',
      workspacesRoutes({
        pool: deps.pool,
        config: deps.config,
        mail: { send: deps.mail.send, inviteMail, addedToWorkspace, removalCodeMail },
        seats: {
          accountByEmail,
          ensureAccount,
          grantFor,
          actingEditor,
          actingOwner,
          // `/tracy-admin/overview`'s "not yet declared into any workspace" queue — see
          // `workspaces/store.js`'s module docstring on why this reaches into `seats/store.js`
          // rather than a legacy table (there isn't one here).
          liveSiteKeys
        },
        now: deps.now
      })
    )
  }
  const modelAccounts =
    deps.pool && deps.config
      ? createSeatPlanBroker({
          pool: deps.pool,
          kek: deps.config.seatPlanKek,
          policy: () => readDesktopSetting(deps.pool, { strict: true })
        })
      : null
  if (modelAccounts)
    app.route('/', seatPlanRoutes({ pool: deps.pool, config: deps.config, broker: modelAccounts }))
  // The quickstart zip of a JoomlArt template, streamed off the private releases repository to a
  // signed-in person (`quickstarts/download.js`). Needs the catalogue table, so it is not mounted on
  // a stand without a database; `identity` (the account book) is what `server.js` always passes.
  if (deps.pool && deps.config)
    app.route(
      '/',
      quickstartDownloadRoutes({
        pool: deps.pool,
        config: deps.config,
        identity: deps.identity,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.now ? { now: deps.now } : {})
      })
    )

  // Mounted BEFORE workspaceRoutes, same reasoning as seatsRoutes above: `sites/route.js` is a
  // domain of its own (module graph), and both `host/client.js` (the signed channel to
  // `tracy-host`) and the seat-book functions it needs to check authorization are siblings, not
  // shared ones — the composition root hands both through rather than either domain reaching
  // into the other directly.
  if (deps.config && deps.pool && deps.host) {
    // Whether the request is on the API host (`lib/api-host.js`, S2): S1 reads this to accept a
    // Bearer key principal there and nowhere else, S3 to answer `/v1` there and nowhere else. A
    // test states which host it is on instead.
    const onApiHost =
      deps.isApiHost ?? ((c) => isApiHost(c.req.header('host') ?? new URL(c.req.url).host, deps.config))
    // "Apply" in the Add site popup: the text and pictures of a site made with a brief are made while the host
    // installs it and written the moment it is up (`sites/brief-build.js`). The engines write through the Apply
    // door as the person who pressed, so they are handed `applyAs` — which exists only once the router below
    // does, hence the late binding.
    /** @type {{applyAs: Function} | null} */
    let sitesApp = null
    // The picture model is the one a deployment BOOKED for `seedImage` (the screen /ops writes), else the
    // environment's OpenRouter key, as the seeder inside dsh reads it. Never the text model's door: a text model
    // cannot draw, and sending it the request would only fail.
    const seedImageDoor = async () => {
      // 🔒 A BROKEN BOOKING IS NOT AN EMPTY ONE. A database that would not answer, or a booked
      // provider that is off or whose key will not open, means pictures are off — not drawn with the
      // environment's key and its default model. Only a door nobody assigned reaches the environment.
      let found = { state: 'unassigned' }
      if (deps.pool) {
        try {
          found = await lookupDoor(deps.pool, 'seedImage', deps.config.sessionSecret)
        } catch (error) {
          console.warn(
            `[llm] door "seedImage" could not be read: ${error instanceof Error ? error.message : error}`
          )
          return null
        }
      }
      if (found.state === 'ok') {
        const booked = found.credential
        return {
          url: `${booked.baseUrl.replace(/\/+$/, '')}/chat/completions`,
          key: booked.apiKey,
          imageModel: booked.model
        }
      }
      if (found.state !== 'unassigned') {
        console.warn(
          `[llm] door "seedImage" is assigned but its provider is ${found.state}; not falling back`
        )
        return null
      }
      const key = process.env.OPENROUTER_API_KEY?.trim()
      if (!key) return null
      const { OPENROUTER_URL, IMAGE_MODEL } = await seeder('model')
      return {
        url: OPENROUTER_URL,
        key,
        imageModel: process.env.TRACY_SEED_IMAGE_MODEL?.trim() || IMAGE_MODEL
      }
    }
    // One bound on model calls in flight for EVERY Apply running in this process: a run alone is held to eight (the
    // measured-safe level; sixteen at once left a quarter of the answers unusable), and several runs at once would add up.
    const seedCalls = createLimiter(Number(process.env.TRACY_SEED_MODEL_CONCURRENCY) || DEFAULT_CONCURRENCY)
    const seedModels = async (input = null) => {
      const door = deps.seedTextDoorFor
        ? await deps.seedTextDoorFor(input)
        : await modelForChain(deps.pool, ['seedText', 'web'], deps.config)
      return {
        text: door
          ? createSeedModel({
              model: door,
              shared: seedCalls,
              ...(deps.seedModelFetchFor ? { fetchImpl: await deps.seedModelFetchFor(input, door) } : {})
            })
          : null,
        textDoor: door,
        image: await seedImageDoor()
      }
    }
    // Where an EmDash site's own API is and the token that opens it: the personalize tool is a client of that API.
    const siteAccess = async (siteKey) => {
      const site = await siteByKey(deps.pool, siteKey)
      if (!site) throw new Error('no such site')
      const answer = await deps.host.hostCall(
        deps.config,
        site.host,
        '/agent-token',
        { label: site.label },
        { fetchImpl: deps.fetchImpl ?? fetch }
      )
      const token = answer.body?.token
      if (!answer.ok || typeof token !== 'string' || token.length < 16)
        throw new Error('the site did not hand over its agent token')
      const origin = deps.briefSiteOriginFor
        ? await deps.briefSiteOriginFor(site)
        : siteTarget(site, deps.config).origin
      return { origin, token }
    }
    // The tag an EmDash site prints, decided by the personalize tool Apply runs from here, written where the
    // template reads it by the host that holds the site (`/_host/display-locale`, #1013).
    const displayLocale = async (siteKey, locales) => {
      const site = await siteByKey(deps.pool, siteKey)
      if (!site) throw new Error('no such site')
      const answer = await deps.host.hostCall(
        deps.config,
        site.host,
        '/display-locale',
        { label: site.label, locales },
        { fetchImpl: deps.fetchImpl ?? fetch }
      )
      if (!answer.ok)
        throw new Error(`the host answered ${answer.status ?? 'nothing'} ${answer.body?.code ?? ''}`.trim())
    }
    // `setupRun`: the brief run these writes belong to, so Site changes reads them as "Tracy setup" (sweep #4).
    const applyFor = (email, setupRun) => (call) =>
      /** @type {any} */ (sitesApp).applyAs(email, call, { setupRun })
    // The host's own word on a provision job, and the content door connected before the host says `done`: what lets the
    // words be written during the last seconds of the install instead of after them (`sites/brief-build.js`).
    const hostJob = async (hostName, jobId) => {
      const polled = await deps.host.hostJob(deps.config, hostName, jobId, {
        fetchImpl: deps.fetchImpl ?? fetch
      })
      return polled.ok ? (polled.body ?? null) : null
    }
    const pairSite = async (siteKey, email) => {
      const site = await siteByKey(deps.pool, siteKey)
      if (!site) throw new Error('no such site')
      const paired = await pairComponent({
        pool: deps.pool,
        config: deps.config,
        host: deps.host,
        fetchImpl: deps.fetchImpl ?? fetch,
        site,
        createdBy: email,
        buildIsDone: true
      })
      if (!['registered', 'skipped'].includes(paired.custody))
        throw new Error(paired.custodyDetail ?? paired.custody)
    }
    // The first bytes of a file a site serves, read at the address this process reaches it on: the shape of a
    // demo picture, which is what a drawn one has to be cut to.
    const siteFile = (siteKey) =>
      headerReader(async (path, init) => {
        const site = await siteByKey(deps.pool, siteKey)
        if (!site) throw new Error('no such site')
        const base = siteTarget(site, deps.config)
        // A path names a file OF THE SITE: one that resolves anywhere else is not asked for.
        const url = new URL(path, base)
        if (url.origin !== base.origin) throw new Error('not a path on the site')
        return (deps.fetchImpl ?? fetch)(url, init)
      })
    // 🔒 A site as a visitor reads it, at its own public address (`sites/brief-engines/glyph-fallback.js`): its pages and
    // stylesheets, its font files, and the Google Fonts sheets and files it names. Nothing else is asked for.
    const siteReader = async (siteKey) => {
      const site = await siteByKey(deps.pool, siteKey)
      if (!site) return null
      const base = new URL(site.address || bornSiteAddress(site.label, deps.config))
      const allowed = (/** @type {string} */ url) => {
        const u = new URL(url, base)
        if (u.origin !== base.origin && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))
          throw new Error(`not the site's address: ${u.origin}`)
        return u
      }
      // Marked as Tracy's own read (`lib/own-read.js`): a visitor at the Tracy address of a published site with
      // its own domain is sent on there, and this reader would be too.
      const get = (/** @type {string} */ url, /** @type {Record<string, string>} */ headers = {}) =>
        markOwnReads(deps.fetchImpl ?? fetch, deps.config)(
          siteReadUrl({ ...site, address: base.href }, deps.config, allowed(url)),
          {
            headers,
            // A redirect would lead off the addresses checked above: it is an answer that cannot be read.
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000)
          }
        )
      return {
        base: base.href,
        text: async (/** @type {string} */ url, /** @type {Record<string, string>} */ headers = {}) => {
          const response = await get(url, headers)
          if (!response.ok) throw new Error(`${url} answered ${response.status}`)
          return response.text()
        },
        bytes: async (/** @type {string} */ url) => {
          const response = await get(url)
          return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
        },
        /** A page as the site serves it, its status kept: a not-found page is read too (the leftover check). */
        page: async (/** @type {string} */ url) => {
          const response = await get(url)
          const redirected = response.status >= 300 && response.status < 400
          return { status: response.status, html: redirected ? '' : await response.text() }
        }
      }
    }
    // The demo-leftover check's page reader (#191), read by the demo runner above through `app`.
    Object.assign(app, {
      readSitePage: async (/** @type {string} */ siteKey, /** @type {string} */ path) =>
        (await siteReader(siteKey))?.page(path) ?? null
    })
    readAgentNativeInventory = createAgentDemoInventory({
      siteAccess,
      siteReader,
      applyFor,
      fetchImpl: deps.fetchImpl ?? fetch,
      checkGrant: async (siteKey, email) => {
        const account = await accountByEmail(deps.pool, email)
        const grant = account ? await grantFor(deps.pool, account.id, siteKey) : null
        if (!grant || !permissionsFor(grant.role).content) throw new Error('AGENT_DEMO_NOT_GRANTED')
      }
    })
    // A site an opportunity built gets the restaurant's own photographs instead of drawn ones (`opportunities-build/site-pictures.js`,
    // `sites/brief-engines/real-pictures.js`): injected here, so `sites/` never reads `wo_media`. `deps.realPictures`: a test's own.
    const realPictures =
      deps.realPictures ??
      createSitePictures({
        pool: deps.pool,
        // The vision model's calls count against Tracy's research caps like the research's own (`cost-ledger.js`).
        chargeable: createChargeable(
          createCostLedger({
            pool: deps.pool,
            caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
          })
        ),
        objects:
          deps.websiteOpportunitiesObjects ?? placeMediaObjectsFor(deps.config, deps.fetchImpl ?? fetch),
        measure: pictureFeatures,
        visionFor: async () => {
          const door = await visionDoorFor(deps)
          if (!door) return null
          const most = Number(process.env.TRACY_VISION_MAX_PICTURES)
          return {
            door,
            key: visionKey(door),
            label: labelWithVision,
            ...(most > 0 ? { maxPictures: most } : {})
          }
        }
      })
    // The restaurant's own posts for a site an opportunity built, written without a model (`opportunities-build/site-content.js`,
    // `sites/brief-engines/wo-content.js`): injected like the pictures. `deps.woContent`: a test's own.
    const woContent = deps.woContent ?? createSiteContent({ pool: deps.pool })
    const quickstartGenerateFor =
      deps.quickstartGenerateFor ??
      createQuickstartModel({
        pool: deps.pool,
        secret: deps.config.sessionSecret,
        ledger: createCostLedger({
          pool: deps.pool,
          caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
        }),
        runtime: () => woRuntime(deps.pool, deps.config)
      })
    const quickstartVerifySite =
      deps.quickstartVerifySite ??
      (async ({ ctx, source, report, baseline = null, stage = 'final' }) => {
        const site = await siteByKey(deps.pool, ctx.siteKey)
        if (!site) throw new Error('QUICKSTART_SITE_MISSING')
        const reviewTestimonials = quickstartReviews(source.profile_effective, source.brief).map(
          (review) => ({
            text: review.text,
            author: review.author,
            ...review.provenance
          })
        )
        const answer = await deps.host.hostCall(
          deps.config,
          site.host,
          '/demo-qa',
          {
            label: site.label,
            platform: site.platform,
            port: site.port,
            host: ctx.siteKey,
            pages: ['/'],
            discover: true,
            baseline,
            measureFrames: true,
            reviewTestimonials,
            allowedCta: [
              source.brief.business?.website,
              source.profile_effective?.googlePlace?.googleMapsUri
            ].filter(Boolean),
            briefText:
              JSON.stringify(source.brief.business) + '\n' + String(source.profile_effective?.bio ?? ''),
            placed: (report?.photos?.receipts ?? [])
              .map((r) => r.uploaded.path ?? r.uploaded.url)
              .filter(Boolean),
            // `photos-match-slots`, `faces-named` and the pictures the fill plan keeps (#141).
            ...quickstartSlotPhotoEvidence(source.brief, report?.photos)
          },
          { fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: 300_000 }
        )
        if (!answer.ok || !answer.body?.baseline) throw new Error('QUICKSTART_VISUAL_CHECK_UNAVAILABLE')
        if (stage === 'baseline') return answer.body
        return {
          state: answer.body.checks?.every((c) => c.pass && !c.skipped) ? 'passed' : 'needs-attention',
          ...answer.body,
          humanAccepted: false
        }
      })
    const quickstartEngine = (legacy) =>
      createQuickstartFirstEngine({
        legacy,
        woContent,
        applyFor,
        siteAccess,
        siteReader,
        realPictures,
        // A new revision references its research; an older one embeds it, read as stored (#1791).
        researchOf: (source) =>
          researchOfRevision(source, { optional: true, checkEmbedded: false })?.research ?? null,
        assertActive: async ({ ctx, source }) => {
          const grant = await grantFor(deps.pool, source.account_id, ctx.siteKey)
          if (!grant || !['owner', 'editor'].includes(grant.role))
            throw new Error('QUICKSTART_WRITE_ACCESS_LOST')
          const row = (
            await deps.pool.query(
              `select b.state from site_brief b join site s on s.site_key=b.site_key
          where b.site_key=$1 and b.created_at>=s.created_at`,
              [ctx.siteKey]
            )
          ).rows[0]
          if (row?.state !== 'applying') throw new Error('QUICKSTART_BRIEF_CLOSED')
          if (
            !(await quickstartActionOpen(deps.pool, {
              accountId: source.account_id,
              requestId: source.request_id,
              revisionId: source.revision_id
            }))
          )
            throw new Error('QUICKSTART_ACTION_CLOSED')
        },
        generateFor: quickstartGenerateFor,
        verifySite: quickstartVerifySite
      })
    // The overlap safety net of a brief build (`sites/brief-engines/picture-overlap-net.js`): the site's host reads the
    // build's pictures over the words in a browser. Read only; null with no host, and an answer that is not ok is none.
    const briefPictureOverlap = deps.host
      ? async (/** @type {string} */ siteKey, /** @type {string[]} */ pages) => {
          const site = await siteByKey(deps.pool, siteKey)
          if (!site) return null
          const answer = await deps.host.hostCall(
            deps.config,
            site.host ?? deps.config.defaultHost,
            '/picture-overlap',
            {
              label: site.label,
              platform: site.platform,
              port: site.port ?? null,
              ...demoSelfNames(deps.config, site),
              pages
            },
            { fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: 150_000 }
          )
          return answer?.ok ? answer.body : null
        }
      : null
    // `deps.briefs`: a test's own runner, so a route test never starts a real one.
    const briefs =
      deps.briefs ??
      createBriefBuilds({
        pool: deps.pool,
        engines: {
          wordpress: quickstartEngine(
            createWordpressEngine({
              models: seedModels,
              applyFor,
              siteFile,
              siteReader,
              realPictures,
              woContent
            })
          ),
          joomla: quickstartEngine(
            createJoomlaEngine({
              models: seedModels,
              applyFor,
              siteFile,
              siteReader,
              realPictures,
              woContent,
              pictureOverlap: briefPictureOverlap
            })
          ),
          emdash: quickstartEngine(
            createEmdashEngine({
              models: seedModels,
              siteAccess,
              displayLocale,
              woContent,
              realPictures,
              applyFor
            })
          )
        },
        normalize: async (input) => {
          const normalized = await normalizeBrief({
            brief: input.brief,
            label: input.label,
            model: input.workflow === 'quickstart-first/1' ? null : (await seedModels(input)).text
          })
          if (input.workflow !== 'quickstart-first/1') return normalized
          const source = await woContent.quickstartFor({ siteKey: input.siteKey, email: input.email })
          if (!source?.brief?.business?.name) throw new Error('QUICKSTART_SOURCE_EMPTY')
          return { ...normalized, name: source.brief.business.name, nameFrom: 'answer' }
        },
        // Writing during the host's last seconds is the default. `TRACY_BRIEF_EARLY_START=off` waits for the host's `done`
        // instead: where its last step and the first writes fight over one disk, waiting can be the faster of the two.
        hostJob: process.env.TRACY_BRIEF_EARLY_START === 'off' ? null : hostJob,
        pairSite,
        // SC-3: the run holds the site's webroot like a chat turn, so the files its writes leave are Tracy's own moment.
        webroot: {
          open: (ctx) =>
            /** @type {any} */ (sitesApp).setupWebroot('open', {
              siteKey: ctx.siteKey,
              runId: ctx.runId,
              email: ctx.email
            }),
          close: (ctx) =>
            /** @type {any} */ (sitesApp).setupWebroot('close', {
              siteKey: ctx.siteKey,
              runId: ctx.runId,
              email: ctx.email
            })
        },
        // The customer's name, logo and favicon, written after the words under their own apply id (`brief-engines/brand.js`).
        brand: createSiteBrand({
          applyFor,
          readFile: (id) =>
            readBrandFile(
              {
                pool: deps.pool,
                store: deps.config.artifactStore ?? null,
                fetchImpl: deps.fetchImpl ?? fetch
              },
              id
            ),
          versionOf: async (siteKey) => (await siteByKey(deps.pool, siteKey))?.quickstart_version ?? null,
          // The brief build's site plan: no logo of the business means its name as text (#193).
          sitePlanFor: (ctx) => woContent.sitePlanFor({ siteKey: ctx.siteKey, email: ctx.email }),
          // The brief's own logo, read with the build's pictures (no vision call: the bytes only).
          briefPicture: async (ctx, assetId) => {
            const real = await realPictures?.forSite({
              siteKey: ctx.siteKey,
              email: ctx.email,
              visionOverride: null
            })
            return real ? real.bytes(assetId) : null
          },
          // The template's own logo files as the site serves them: their colours colour a logo Tracy makes (#189).
          templateLogos: async (ctx, files) => {
            const reader = await siteReader(ctx.siteKey)
            if (!reader) return []
            // No logo slot in the content map: the logo pictures the home page shows (`logoFilesOfPage`).
            const named = files.length
              ? files
              : logoFilesOfPage((await reader.page('/').catch(() => null))?.html ?? '')
            const out = []
            for (const file of named.slice(0, 4)) {
              const bytes = await reader.bytes(new URL(file, reader.base).href).catch(() => null)
              if (bytes?.byteLength) out.push(bytes)
            }
            return out
          },
          // Whether the owner's mark already holds words, asked of the photo labeller (null with no labeller).
          markText: async (ctx, bytes) => {
            const real = await realPictures?.forSite({ siteKey: ctx.siteKey, email: ctx.email })
            const labels = real?.checkDrawing ? await real.checkDrawing(bytes).catch(() => null) : null
            if (!labels) return null
            return labels.textPresence === 'present' || labels.hasTextOverlay === true
          },
          // A symbol for a business with no logo, drawn through the Customize picture door and checked by the photo
          // labeller like any drawing (`brand-logo-symbol.js`); the name is set beside it by code.
          drawSymbol: async (ctx, item) => {
            const { image } = await seedModels()
            if (!image?.imageModel) return null
            const real = await realPictures?.forSite({ siteKey: ctx.siteKey, email: ctx.email })
            if (!real?.checkDrawing) return null
            const got = await drawLogoSymbol({
              door: image,
              chat: (await seeder('model')).chat,
              item,
              checkDrawing: real.checkDrawing,
              cache: real.drawing ?? null,
              signal: ctx.signal
            })
            if ('refused' in got) {
              ctx.note(
                `a symbol for the logo could not be drawn (${got.refused.join(', ')}), so the logo is the name alone`
              )
              return null
            }
            return got.bytes
          }
        })
      })
    // Resume only the failed fill on an existing demo, through the site's own brief runner.
    app.resumeOpportunityFill = async (build, email, retryActionId) => {
      if ((await grantFor(deps.pool, build.account_id, build.site_key))?.role !== 'owner') return false
      const { rows } = await deps.pool.query(
        `select b.*, s.label, s.host, s.quickstart_version from site_brief b
         join site s on s.site_key = b.site_key
         where b.site_key = $1 and b.account_id = $2 and b.state = 'failed'`,
        [build.site_key, build.account_id]
      )
      const row = rows[0]
      if (!row) return false
      const result = await briefs.start({
        siteKey: row.site_key,
        accountId: build.account_id,
        email,
        label: row.label,
        platform: row.platform,
        quickstart: row.quickstart,
        brief: row.brief,
        retryActionId,
        contract: contractFor(defaultContracts(), row.quickstart, row.quickstart_version),
        host: row.host,
        jobId: build.site_job_id
      })
      return result.started === true
    }
    const sites = sitesRoutes({
      pool: deps.pool,
      resumeLiveJobs: deps.resumeLiveJobs === true,
      doorProbeToken: doorHealth ? doorProbeToken : null,
      doorHealth,
      config: deps.config,
      // `installCodeMail`: the export's install code, mailed by `sites/backup-export.js`, which as a
      // domain may not import `mail/` itself (`test/module-graph.test.mjs`).
      mail: {
        send: deps.mail.send,
        available: deps.mail.available !== false,
        signInCodeMail,
        installCodeMail
      },
      mailRate,
      notify: notifier.notify,
      settleSiteNotifications: notifier.settleSite,
      host: deps.host,
      briefs,
      ...(deps.quickstartAccess ? { quickstartAccess: deps.quickstartAccess } : {}),
      agentDemo: {
        createContext: (args) => agentDemoCreateContext(deps.pool, args),
        ...agentDemoCapabilities({
          pool: deps.pool,
          inventoryInvariant,
          objects: placeMediaObjectsFor(deps.config, deps.fetchImpl ?? fetch),
          now: deps.now ?? Date.now,
          // The words of every page in small structured tasks (`opportunities-build/demo-copy.js`).
          writeCopy: createDemoCopy({
            doorFor: () => modelForChain(deps.pool, ['seedText', 'web'], deps.config),
            chargeable: createChargeable(
              createCostLedger({
                pool: deps.pool,
                caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
              })
            ),
            fetchImpl: deps.fetchImpl ?? fetch
          }),
          // What each photo shows, labelled once (`opportunities-build/demo-photo-labels.js`).
          photoLabels: createDemoPhotoLabels({
            pool: deps.pool,
            visionFor: () => visionDoorFor(deps),
            chargeable: createChargeable(
              createCostLedger({
                pool: deps.pool,
                caps: capsFromRuntime(() => woRuntime(deps.pool, deps.config))
              })
            ),
            fetchImpl: deps.fetchImpl ?? fetch
          }),
          lifecycle: (auth, params, held) => {
            if (!clientDemoService) throw new Error('DEMO_CHAT_UNAVAILABLE')
            return clientDemoService.operation(auth, params, held)
          }
        })
      },
      qualityCreate: {
        context: (args) =>
          qualityCreateContext(deps.pool, {
            ...args,
            available: deps.websiteOpportunitiesQuality?.available,
            now: deps.now ?? Date.now
          }),
        brief: (args) => putQualityBrief(deps.pool, args)
      },
      // The warm-stock allocator. Handed in from here for the same reason the ops screen's copy
      // is: a domain may not import another domain (`test/module-graph.test.mjs`).
      inventory: {
        allocateFromPool,
        activateInstance,
        instanceBySiteKey: inventoryStore.instanceBySiteKey
      },
      // Shard beta (`shard/node.js`): null on the master.
      shard,
      seats: {
        ensureAccount,
        accountByEmail,
        grantFor,
        grantRowFor,
        ownersOf,
        grantSite,
        setGrantRole,
        acceptGrant,
        revokeAllGrants,
        seatsOfSite,
        actingEditor,
        actingOwner,
        permissionsFor,
        normalizeRole
      },
      // Same cross-domain reason as `seats` above: `sites/route.js` calls `createRepoFor` at
      // job-done, `mintGitToken` at provision and `deleteRepoFor` at site delete, and none may
      // import `github/route.js` directly (module graph).
      github: { createRepoFor, deleteRepoFor, mintGitToken },
      workspaces: {
        // Task 7 fix round 2: `requireRepoDoorGrant`'s ADR 0067 §3 bootstrap exception needs the
        // site's owning workspace, and that workspace's grant on the caller.
        workspaceOfSite,
        workspaceGrantFor
      },
      // The seat door, for the one thing a site delete must tell the host's dsh: forget the
      // site folder's sessions (`sites/route.js`'s DELETE door says why).
      ...(deps.seatDoor ? { seatDoor: deps.seatDoor } : {}),
      ...(shardBook
        ? {
            labels: {
              hold: (label, siteKey) =>
                holdLabel({
                  pool: deps.pool,
                  config: deps.config,
                  zone: shardZone,
                  reservedLabels: siteLabelsReserved,
                  holder: MASTER_SHARD,
                  label,
                  siteKey
                })
            }
          }
        : {}),
      now: deps.now,
      // Overridable so a test can fake `tracy-host` and the artifact store without touching a
      // real network — same seam `host/client.js`'s own tests use.
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      // Test-only: see a `content.locate` call reach the snapshot store (`sites/route.js`).
      ...(deps.locateStoreFactory ? { locateStoreFactory: deps.locateStoreFactory } : {}),
      // Test-only: the resolver a site's own domain is read with (`sites/address.js`), so a test
      // answers DNS itself instead of asking the machine's resolver.
      ...(deps.dns ? { dns: deps.dns } : {}),
      ...(deps.ownDomainProbe ? { ownDomainProbe: deps.ownDomainProbe } : {}),
      // Test-only: Cloudflare for SaaS's custom hostnames, or null for none (`sites/site-domain-provider.js`).
      ...(deps.customHostnames !== undefined ? { customHostnames: deps.customHostnames } : {}),
      // The proxy a visitor of a site's Tracy address is served by: what a removal of an own domain
      // asks the site through before anything is taken away (`sites/address.js` `addressStanding`).
      siteProxy: proxySite,
      isApiHost: onApiHost,
      // Test-only: a design-system runner whose host and write are the test's (`sites/design-system-at-create.js`).
      ...(deps.designSystemsAtCreate ? { designSystemsAtCreate: deps.designSystemsAtCreate } : {})
    })
    // A person who lives on a shard makes sites there (`shards/use-shard.js`), before the doors below.
    if (shardBook) {
      const useShard = useShardGuard({ pool: deps.pool, book: shardBook, config: deps.config })
      use('/api/sites', useShard)
      use('/api/sites/claim', useShard)
    }
    app.route('/', sites)
    sitesApp = sites
    app.applyAs = sites.applyAs
    // A setup run's hold on the webroot (SC-3): what the brief runner above calls, reachable the same way as `applyAs`.
    app.setupWebroot = sites.setupWebroot
    // Lets the row of a deleted site go once its host said the site is off it; the cron's sweep is
    // handed it by `server.js`, so a delete nobody is watching ends like one somebody is.
    app.closeDeletedSite = sites.closeDeletedSite
    // The delete door's operation as a function: the demo retention sweep retires demos through it.
    app.teardownSiteAs = sites.teardownSiteAs
    // Finishes the design system picks of the Add site form whose worker died with its process; the cron's tick
    // calls it (`server.js`), so a pick never waits on a browser or a process that is gone.
    app.designSystemSweep = sites.designSystemSweep
    // The Apply door as a function, for the `/v1` layer (S3): one implementation, no re-dispatch.
    app.applyDoor = sites.applyDoor
    // `/v1` (`api/route.js`, S3): the public REST layer on the api host, answered behind the api
    // host gate above (no cookie reaches it) and before the dsh catch-all. It is handed the door,
    // the door's OWN key resolver, the site-key canonicaliser and the audit listing — four things
    // that live in `sites/`, which `api/` may not import (module graph). On every other hostname
    // `/v1/*` is not on the allowlist of anything and falls to the workspace door as before.
    // Account tokens (device flow, `lib/account-token.js`): the resolver every account door mounts on
    // (`/v1/me` here; `/v1/demos*` takes `app.requireAccountToken`).
    const requireAccountToken =
      app.requireAccountToken ??
      accountTokenResolver({
        pool: deps.pool,
        pepper: deps.config.apiKeyPepper,
        audience: deps.config.apiOrigin,
        ...(deps.now ? { now: deps.now } : {})
      })
    app.requireAccountToken = requireAccountToken
    const api = apiRoutes({
      pool: deps.pool,
      door: sites.applyDoor,
      resolvePrincipal: sites.resolveKeyPrincipal,
      requireAccountToken,
      canonicalSiteKey,
      listApplies: appliesOfSession,
      readDesign: (siteKey) => readSiteDesign(deps.pool, siteKey),
      isApiHost: onApiHost,
      ...(deps.now ? { now: deps.now } : {})
    })
    // Every `/v1` handler steps aside off the API host (`api/route.js`), by this same predicate.
    const offApiHost = { stepsAside: (c) => !onApiHost(c) }
    for (const route of api.routes) owners.set(route.handler, offApiHost)
    app.route('/', api)
    // ChatGPT uses the same site-bound principal and the same REST/Apply implementation.
    // OAuth consent uses the application session; MCP and token paths require their own credentials.
    const oauth = oauthRoutes({
      config: deps.config,
      pool: deps.pool,
      seats: { accountByEmail, grantFor },
      listSites: async (accountId) =>
        (await sitesOfAccount(deps.pool, accountId)).filter(
          (seat) => seat.status === 'accepted' && permissionsFor(seat.role).content
        ),
      resolvePrincipal: sites.resolveKeyPrincipal,
      isApiHost: (c) => onMcpHost(c, deps.config),
      ...(deps.mcpClientFetch ? { clientFetch: deps.mcpClientFetch } : {}),
      ...(deps.now ? { now: deps.now } : {})
    })
    app.route('/', oauth)
    const mcp = mcpRoutes({
      config: deps.config,
      api,
      document: buildOpenApi({
        origin: deps.config.apiOrigin,
        applyActions: APPLY_ACTIONS,
        toolsetOf: applyToolsetLabel,
        publicApi: true
      }),
      resolvePrincipal: oauth.resolvePrincipal,
      isApiHost: (c) => onMcpHost(c, deps.config)
    })
    for (const route of mcp.routes)
      owners.set(route.handler, { stepsAside: (c) => !onMcpHost(c, deps.config) })
    app.route('/', mcp)
  }
  // `/fleet/git-token` and `/github/push` — no seat, no cookie: both doors authenticate a signed
  // caller (a host's own secret, or GitHub's webhook secret) rather than a browser session.
  if (deps.config && deps.pool) {
    app.route(
      '/',
      githubRoutes({
        pool: deps.pool,
        config: deps.config,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      })
    )
  }
  // The doors a shard calls on its master (`shards/doors.js`): signed with that shard's own secret,
  // no session read. Master only. The signature clock is the real one, never a test's `deps.now`.
  if (shardBook)
    app.route(
      '/',
      shardDoors({
        pool: deps.pool,
        config: deps.config,
        book: shardBook,
        zone: shardZone,
        reservedLabels: siteLabelsReserved,
        events: shardEvents({
          pool: deps.pool,
          config: deps.config,
          dns: shardDns,
          hostnames: shardHostnames,
          signal
        }),
        customHostnames: shardCustomHostnames({
          pool: deps.pool,
          config: deps.config,
          hostnames: shardHostnames
        }),
        check: shardCheck({ pool: deps.pool, signal, tags: shardTags, masterHead: shardMigrationHead })
      })
    )
  // /ops › Shards' API (`shards/ops-routes.js`): the /ops door, before `opsRoutes`' page wildcard.
  if (shardBook)
    app.route(
      '/',
      shardOpsRoutes({
        pool: deps.pool,
        config: deps.config,
        book: shardBook,
        admit: (c) => admit(c, { pool: deps.pool, config: deps.config }),
        denied,
        tags: shardTags,
        masterHead: shardMigrationHead,
        dnsOn: Boolean(shardDns)
      })
    )
  // The shard sweeps `cron.js` runs (`server.js` hands them over): silence every minute, DNS hourly.
  app.shardSweeps = shardBook
    ? {
        silent: () => sweepSilentShards({ pool: deps.pool, signal }),
        reconcile: () => reconcileDns({ pool: deps.pool, config: deps.config, dns: shardDns, signal })
      }
    : null
  // Mail sent BY customer sites (`mail/site-mail/route.js`): the shim's `POST /_site-mail`, its
  // /ops screen and the site admin's own doors. Mounted after host routing on purpose — a request
  // naming a site hostname has already gone to that site — and `isPublicHost` keeps the relay off
  // Tracy's own public hostname: the shim dials `tracy-web` by its address on the `tracy` network.
  // The staff door and the seat book are other domains, so they are handed in from here.
  if (deps.config && deps.pool) {
    app.route(
      '/',
      siteMailRoutes({
        pool: deps.pool,
        config: deps.config,
        admit,
        denied,
        seats: { accountByEmail, grantFor, actingOwner },
        isPublicHost: (c) =>
          hostKind(c.req.header('host') ?? new URL(c.req.url).host, deps.config).kind === 'tracy' ||
          Boolean(c.req.header('cf-ray') || c.req.header('cf-connecting-ip')),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...deps.siteMail
      })
    )
  }
  // Task 2 (Plan 4): `/ops` — Tracy's own operations surface, ported from `workers/harness`. A
  // second, dedicated `workspacesRoutes()` instance (rather than reaching into the one mounted
  // above) so `ops/route.js`'s `/api/ops/team*` relay has its own `/tracy-admin/*` cluster to call
  // without `ops/` importing across the module-graph boundary (test/module-graph.test.mjs) — the
  // only cost is a second in-memory removal-codes map, which only this surface's own callers ever
  // touch.
  if (deps.config && deps.pool) {
    // A Tracy door like every `/api/ops` one: mounted here, behind the hostname router and the
    // cross-site request guard above, never before them (#1037).
    // Public: the unsubscribe link of real invitation mail; its token is the whole authority.
    app.route('/', invitationsUnsubscribeRoutes({ pool: deps.pool, keys: app.invitationsRealKeys }))
    app.route(
      '/api/ops/invitations/real',
      invitationsRealRoutes({
        pool: deps.pool,
        config: deps.config,
        keys: app.invitationsRealKeys,
        admit: (c) => admit(c, { pool: deps.pool, config: deps.config }),
        ...(deps.fetchImpl ? { fetcher: deps.fetchImpl } : {})
      })
    )
    app.route(
      '/api/ops/invitations',
      invitationsRoutes({
        pool: deps.pool,
        config: deps.config,
        admit: (c) => admit(c, { pool: deps.pool, config: deps.config })
      })
    )
    app.route(
      '/',
      opsRoutes({
        prefetch: app.dubaiPrefetch ?? null,
        // The place pictures of a brief revision are read through the same objects Website Opportunities uses.
        objects: placeMediaObjectsFor(deps.config, deps.fetchImpl ?? fetch),
        pool: deps.pool,
        config: deps.config,
        doorHealth,
        host: deps.host,
        fetchImpl: deps.fetchImpl,
        visionTests: createQualityVisionTests({
          pool: deps.pool,
          secret: deps.config.sessionSecret,
          fetchImpl: deps.fetchImpl,
          now: deps.now
        }),
        // The warm-stock modules, handed to `ops` from here because a domain may not import
        // another domain (`test/module-graph.test.mjs`) and this file is the composition root.
        inventory: { ...inventoryStore, eligibleQuickstarts, recordDemoAttestations, jobKeysFor },
        // The Beta screens count by the Vietnam day; a test pins the clock through here.
        ...(deps.now ? { now: deps.now } : {}),
        // The slot roles of a release (Content coverage, ADR 0038); a test hands in its own answer.
        ...(deps.rolesOf ? { rolesOf: deps.rolesOf } : {}),
        // The Slot fit of a release (Content coverage, ADR 0039); a test hands in its own answer.
        ...(deps.fitOf ? { fitOf: deps.fitOf } : {}),
        // The committed content coverage of a release (Content coverage); a test hands in its own answer.
        ...(deps.coverageOf ? { coverageOf: deps.coverageOf } : {}),
        workspaces: {
          app: workspacesRoutes({
            pool: deps.pool,
            config: deps.config,
            mail: { send: deps.mail.send, inviteMail, addedToWorkspace, removalCodeMail },
            seats: {
              accountByEmail,
              ensureAccount,
              grantFor,
              actingEditor,
              actingOwner,
              liveSiteKeys
            },
            now: deps.now
          }),
          tracyAdminWorkspace,
          acceptWorkspaceGrant,
          accountByEmail
        },
        // The Settings screen states the forbidden site names; `ops/` cannot import `sites/`
        // (module-graph), and the set cannot move to `lib/` because a parity test pins it against
        // the plugin's own copy — so it is handed over here, like every other cross-domain need.
        /**
         * Put the keys the provider book holds where the agent and the seeder read them.
         *
         * 🔒 IT SENDS ONLY WHAT `resolveAll` WOULD SPEND — enabled providers whose key this process
         * can open. A disabled provider, or one whose key did not survive a `SESSION_SECRET`
         * rotation, must not be pushed: the machine would then be holding a credential this screen
         * no longer shows, which is the worst kind of drift.
         *
         * ⚠ THE NAMES ARE THE ONES dsh AND THE SEEDER ALREADY READ, not the provider ids: the
         * credential file is an env-shaped map (`refs:`), and `model.mjs`'s `providerOf` looks for
         * exactly `OPENROUTER_API_KEY` and `DEEPSEEK_API_KEY` in that order. A third vendor has no
         * name to be pushed under yet — it can still serve `web`, which this process spends itself.
         */
        pushKeys: async ({ pool, secret }) => {
          const { pushModelKeys } = await import('./lib/llm-push.js')
          return pushModelKeys({
            pool,
            secret,
            config: deps.config,
            hostCall: deps.host.hostCall,
            fetchImpl: deps.fetchImpl ?? fetch
          })
        },
        // With the zone's own names for customers' own domains (`config.ownDomainLabels`).
        reservedLabels: new Set([
          ...RESERVED_LABELS,
          ...Object.values(deps.config?.ownDomainLabels ?? { connect: 'connect', origin: 'origin' })
        ]),
        // The SAME object `readConfig` read (server.js), not `process.env`: the Settings screen
        // reports which keys of a half-configured block are absent, and reading a second
        // environment would let it describe a deployment this app is not running as.
        env: deps.env,
        ...(deps.opsStaticDir ? { staticDir: deps.opsStaticDir } : {}),
        // Same shape and same reason as `opsStaticDir`: a test needs to point the configuration
        // reader at a fixture directory without the image's layout existing on a laptop.
        ...(deps.opsSnapshotDir ? { snapshotDir: deps.opsSnapshotDir } : {})
      })
    )
  }
  // Tracy's icon for a page that declares none: a browser then asks for `/favicon.ico`, and the
  // catch-all below would read that as a site address (measured on dev 11/10: 302 to
  // `/favicon-ico-…/join`, then 404). Customer hostnames were answered above and never get here.
  app.get('/favicon.ico', (c) =>
    c.body(TRACY_ICON_SVG, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' })
  )
  // Catch-all, always last: anything not claimed above belongs to a host's dsh.
  if (deps.config && deps.sites) {
    const workspace = workspaceRoutes({
      modelAccounts: modelAccounts
        ? async (email, site) => modelAccounts.catalog((await modelAccounts.account(email)).id, site)
        : undefined,
      config: deps.config,
      sites: deps.sites,
      seatDoor: deps.seatDoor,
      // Plan B6: the identity store holds the template waiting on an account; the workspace only
      // peeks at the root, writes it from the web template page and consumes it on the app's, so
      // it gets three functions, not the store.
      ...(deps.identity?.peekDesktopIntent
        ? {
            intents: {
              peek: (email) => deps.identity.peekDesktopIntent(email),
              put: async (email, template, platform) => {
                const account = await deps.identity.accountByEmail(email)
                if (account) await deps.identity.putDesktopIntent(account.id, template, platform)
              },
              take: (email, template) => deps.identity.takeDesktopIntent(email, template)
            }
          }
        : {}),
      now: deps.now,
      // The one page this domain draws itself, handed over here for the same reason the mail
      // templates are: `bar/` is a sibling domain and the module graph lets a domain reach only
      // `lib/` and `db/`.
      pages: {
        noSites: noSitesPage,
        workspaceUnavailable: workspaceUnavailablePage,
        templateLanding: templateLandingPage,
        templateNotOnTracy: templateNotOnTracyPage,
        templateLookupFailed: templateLookupFailedPage
      },
      // Task 9: the bare-root landing for a signed-in viewer with no site named by the path, the
      // Referer, or the cookie — the same cross-domain reason `defaultSiteFor` is threaded into
      // `identityRoutes` above. `pool` is needed here too: `defaultSiteFor` takes it directly
      // (same convention every other injected seats function follows).
      //
      // `accountByEmail`/`grantFor` are Plan 2's addition: the exact pair `../lib/role-on-site.js`'s
      // `roleOnSite` needs to answer "does this viewer hold a live seat on this site" before
      // `workspace/route.js` mints anything — the same two functions `bar/route.js` is wired
      // with above, for the same question about a different surface.
      //
      // `pendingInvitesFor` is the one state between "has no sites" and "has a site" — see that
      // store function's own note on why the empty-handed page would otherwise say something
      // untrue to somebody with an invitation sitting in their inbox.
      //
      // `unfinishedImportFor`: an accepted seat whose import never finished is not a workspace
      // (`lib/import-pending.js`); a person holding only such seats lands on the import recovery page.
      //
      // `rolePolicy`/`permissionsFor` + `workspaceRolePolicyForSite` (13/09): the seat mint now
      // sends the seat book's RESOLVED toolsets to the door (ADR 0001 §3) through the same
      // `lib/role-policy.js` precedence the Apply door reads, so what a role may do inside dsh
      // and what it may do through Apply are one answer.
      ...(deps.pool
        ? {
            pool: deps.pool,
            seats: {
              defaultSiteFor,
              unfinishedImportFor,
              accountByEmail,
              grantFor,
              pendingInvitesFor,
              rolePolicy,
              permissionsFor
            },
            workspaces: { workspaceRolePolicyForSite }
          }
        : {})
    })
    for (const route of workspace.routes) owners.set(route.handler, WORKSPACE_PROXY)
    app.route('/', workspace)
  }
  return app
}

/**
 * URL builders the notification letters use (spec #809), so a letter never assembles an origin.
 * `manage()` opens Settings › Notifications: `?settings=notifications` on the app's root, which
 * carries the query to the person's default site, where `@tracy/dsh-settings` reads it on load,
 * opens Settings on that section and strips it from the address.
 *
 * 🔒 NO FALLBACK ORIGIN. Every link is built on `config.origin` (`TRACY_ORIGIN`, which `readConfig`
 * already requires and refuses to start without). It used to fall back to production's address, so
 * a dev or staging letter could silently send a reader to production. Missing, this throws — the
 * same answer `config.js` gives a missing `TRACY_ORIGIN` — and `buildApp` calls it at startup.
 * @param {{origin?: string} | undefined} config
 */
function notificationLinks(config) {
  const origin = String(config?.origin ?? '').replace(/\/+$/, '')
  if (!origin) throw new Error('notification links need config.origin (TRACY_ORIGIN is required)')
  return {
    team: (siteKey, member = null) => siteTeamUrl(siteKey, { member, origin }),
    site: (siteKey) => `${origin}/${siteKey}`,
    // The comment's own deep link, same shape as its ⋮ Copy link (`commentDeepLink` in the fork).
    comment: (siteKey, commentId, page = '/') => {
      const path = typeof page === 'string' && page.startsWith('/') ? page : '/'
      const query = new URLSearchParams({ open: 'browser', page: path, mode: 'edit', comment: commentId })
      return `${origin}/${encodeURIComponent(siteKey)}/?${query.toString().replace(/%2F/gi, '/')}`
    },
    manage: () => `${origin}/?settings=notifications`
  }
}

/**
 * The objects Website Opportunities reads and writes place pictures through: `media/…` keys in the
 * shared bucket (`PLACE_MEDIA_S3_*`), every other key in this deployment's artifact store.
 */
export function placeMediaObjectsFor(config, fetchImpl) {
  return routePlaceMediaObjects({
    local: storeObjects(config.artifactStore ?? null, fetchImpl),
    shared: storeObjects(config.placeMediaStore ?? null, fetchImpl)
  })
}

/**
 * The artifact store as the assistant and Website Opportunities need it: put, read and delete one
 * object by a key the caller chose. Null without a store: staff photos are then refused with a note in
 * the topic, and opportunity media are kept as references only.
 * @param {{ endpoint: string, bucket: string, accessKey: string, secretKey: string } | null} store
 * @param {typeof fetch} fetchImpl
 */
export function storeObjects(store, fetchImpl) {
  if (!store) return null
  const TTL_S = 300
  return {
    // A URL the browser may follow itself: only a TLS store (R2) is reachable from outside; a local
    // MinIO behind the docker network is not, so its bytes are streamed through the door instead.
    async publicUrl(key) {
      return store.endpoint.startsWith('https:')
        ? presign(store, { method: 'GET', key, expiresIn: TTL_S })
        : null
    },
    async put(key, bytes, type) {
      const url = await presign(store, { method: 'PUT', key, expiresIn: TTL_S })
      const res = await fetchImpl(url, {
        method: 'PUT',
        headers: { 'content-type': type },
        body: bytes
      }).catch(() => null)
      return Boolean(res?.ok)
    },
    async get(key) {
      const url = await presign(store, { method: 'GET', key, expiresIn: TTL_S })
      return fetchImpl(url, { method: 'GET' }).catch(() => null)
    },
    /** `{size}` of the object, or null when it is missing or the store did not answer. */
    async head(key) {
      const url = await presign(store, { method: 'HEAD', key, expiresIn: TTL_S })
      const res = await fetchImpl(url, { method: 'HEAD' }).catch(() => null)
      if (!res?.ok) return null
      const size = Number(res.headers.get('content-length'))
      return Number.isFinite(size) ? { size } : null
    },
    async delete(key) {
      const res = await signedCall(store, { method: 'DELETE', key }, fetchImpl).catch(() => null)
      return Boolean(res?.ok || res?.status === 404)
    }
  }
}
