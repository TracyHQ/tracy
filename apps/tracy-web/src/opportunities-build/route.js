/**
 * Tracy's demo builder for Website Opportunities (ADR 0036): the build doors and the demo half of the
 * open doors' answers. The open layer (`website-opportunities/src/route.js`) receives this object as `deps.builder`
 * and never imports this directory; without it the open doors answer with no demo data.
 *
 * Every door reads the signed-in person through the open router's `caller` and touches only that
 * account's rows: another account's revision, build or action answers 404, like one that does not exist.
 */
import { json } from '../lib/http.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { woRuntime } from '../lib/wo-ops.js'
import { pinsOf, readTemplateCards, templateChoices } from '../lib/wo-revision-choice.js'
import { findResearchOf, usableResearch } from 'website-opportunities/src/find-research.js'
import {
  insertOpportunity,
  jobsOfOpportunity,
  opportunityOf,
  readPreference,
  savePreference
} from 'website-opportunities/src/store.js'
import { AGENT_DEMO } from './agent-demo.js'
import { BRIEF_BUILD } from './brief-build-path.js'
import { withBuildChoice } from './build-choice.js'
import {
  buildOf,
  buildsOfOpportunity,
  reconcileBuild,
  revisionOf,
  revisionsOf,
  siteOfBuild
} from './build-store.js'
import { settleBuild, suggestedLabel } from './builds.js'
import {
  acceptDemoActions,
  templateRankingOf,
  demoActionShape,
  demoActionOf,
  demoActionsOf,
  demoProgress,
  readDemoUsage
} from './demo-actions.js'
import { qaShape } from './demo-qa.js'
import { reopenDemo, startDemoClock, touchDemo } from './demo-retention.js'
import { withHandoffLock } from './handoff.js'
import { handOffToAgent } from './handoff-service.js'
import { demoJourneySql } from './journey-sql.js'
import { isOwnSiteAction, ownSiteOn, ownSiteRoutes } from './own-site.js'
import { QUALITY_PROTOCOL, qualityModeOf } from './quality-protocol.js'
import { qualityEvidenceRoutes } from './quality-route.js'
import { createRevision, currentResearchKey, labellingUnsettled, resolveRevisionCms } from './revisions.js'

const BASE = '/api/website-opportunities'

/**
 * @param {object} deps the open router's own deps (`app.js`), read at request time: `clientDemo` and
 *   `quality` may be set after this builder is made.
 * @returns {{
 *   routes: (app: import('hono').Hono, ctx: object) => void,
 *   settingsOf: (domain: any, accountId: string | null) => Promise<object>,
 *   saveSettings: (domain: any, accountId: string, sent: any) => Promise<{status: number, body: object}>,
 *   listedDemoOf: (accountId: string, ids: string[]) => Promise<Map<string, object>>,
 *   detailOf: (opp: object, accountId: string) => Promise<object>,
 *   demoFactsOf: (accountId: string, ids: string[]) => Promise<Map<string, {built: boolean,
 *     liveSiteKey: string | null, queuedActionId: string | null}>>,
 *   demoJourneySql: typeof demoJourneySql,
 *   templateChoicesOf: (settings: object) => Promise<object>,
 *   templateCards: () => Promise<any>
 * }}
 */
export function createWebsiteBuilder(deps) {
  const { config, pool, request, ensureAccount, loadDomain, objects } = deps
  const now = deps.now ?? Date.now
  const origin = String(config.origin ?? '').replace(/\/+$/, '')
  const runtime = () => woRuntime(pool, config)
  const templateCards = () => readTemplateCards(request, origin)

  const demoSettings = async () => (await runtime()).settings
  const qualityMode = (accountId) => qualityModeOf(pool, accountId, { available: deps.quality?.available })
  async function acceptActions(args) {
    if (args.entries.some((entry) => entry.workflow === AGENT_DEMO || entry.workflow === BRIEF_BUILD))
      return acceptDemoActions(pool, { ...args, protocol: 'legacy' })
    let mode
    try {
      mode = await qualityMode(args.accountId)
    } catch (error) {
      return {
        status: 409,
        body: {
          code: error.code ?? 'QUALITY_UNAVAILABLE',
          next: 'Review the editorial configuration before starting this action.'
        }
      }
    }
    let protocol = mode === 'off' ? 'legacy' : QUALITY_PROTOCOL
    for (const entry of args.entries.filter((e) => e.revisionId)) {
      const revision = await revisionOf(pool, args.accountId, entry.revisionId)
      if (revision?.brief?.editorial?.protocol === QUALITY_PROTOCOL) protocol = QUALITY_PROTOCOL
      else if (protocol === QUALITY_PROTOCOL)
        return {
          status: 409,
          body: {
            code: 'QUALITY_NEW_REVISION_REQUIRED',
            next: 'Create a new demo action to prepare its editorial revision.'
          }
        }
    }
    return acceptDemoActions(pool, { ...args, protocol, allowConcurrent: deps.quality?.allowConcurrent })
  }
  /** A build that has its site starts its demo clock (`demo-retention.js`); answers the row as it is now. */
  async function clocked(build) {
    if (!build?.site_key || build.demo_expires_at || build.demo_deleted_at) return build
    return (await startDemoClock(pool, build.id, { now: now(), settings: await demoSettings() })) ?? build
  }

  /** Each CMS with whether a build can use it here: a template offered on that CMS. */
  async function cmsOptions(domain) {
    const templates = await templateCards()
    return domain.CMS.map((cms) => {
      if ('error' in templates) return { cms, available: false, reason: templates.error }
      // A demo is only finished once the restaurant's pictures are on it (`handoff.js`).
      if (!domain.HANDOFF_FOLDER?.[cms]) return { cms, available: false, reason: 'HANDOFF_UNSUPPORTED' }
      const offered = templates.cards.some((card) => (card.platforms ?? []).some((p) => p?.platform === cms))
      return offered ? { cms, available: true } : { cms, available: false, reason: 'NO_TEMPLATE_FOR_CMS' }
    })
  }

  async function settingsOf(domain, accountId) {
    const pref = accountId ? await readPreference(pool, accountId) : null
    const { settings } = await runtime()
    const { cms, cmsSource } = resolveRevisionCms(domain, pref, new Date(now()), settings)
    return {
      cms,
      cmsSource,
      options: await cmsOptions(domain),
      qualityMode: pref?.quality_mode ?? 'off',
      qualityAvailable: (await deps.quality?.available(accountId)) ?? false
    }
  }

  /** PUT settings after the open door's checks: the CMS and quality mode, then the new settings. */
  async function saveSettings(domain, accountId, sent) {
    const refusal = (status, code, next, extra = {}) => ({ status, body: { code, next, ...extra } })
    const cms = domain.parseCms(sent?.cms)
    if (!cms) return refusal(422, 'INVALID_CMS', `Send {"cms": one of ${domain.CMS.join(', ')}}.`)
    const option = (await cmsOptions(domain)).find((o) => o.cms === cms)
    if (!option?.available)
      return refusal(422, 'CMS_UNAVAILABLE', 'Pick a CMS whose option says available.', {
        reason: option?.reason ?? null
      })
    if (sent?.qualityMode !== undefined && !['off', 'shadow', 'apply'].includes(sent.qualityMode))
      return refusal(422, 'QUALITY_MODE_INVALID', 'Choose off, shadow, or apply.')
    if (sent?.qualityMode && sent.qualityMode !== 'off' && !(await deps.quality?.available(accountId)))
      return refusal(
        409,
        'QUALITY_UNAVAILABLE',
        'Editorial preparation is not available for this account on this runtime.'
      )
    await savePreference(pool, accountId, cms, sent?.qualityMode)
    return { status: 200, body: await settingsOf(domain, accountId) }
  }

  /**
   * The demo columns of listed rows, by opportunity id: `latestRevision`, `sites`, `latestBuild`,
   * `demoAction` and `demo`. A customer's own business (`own-site.js`) is not listed, so it has none.
   */
  async function listedDemoOf(accountId, ids) {
    if (!accountId || !ids.length) return new Map()
    const { rows } = await pool.query(
      `select o.id,
       (select to_jsonb(a) from wo_demo_action a where a.opportunity_id = o.id and a.account_id = $1
          order by a.accepted_at desc, a.id desc limit 1) as demo_action,
       (select jsonb_build_object('id', r.id, 'n', r.n, 'createdAt', r.created_at,
                 'cms', lb.choice->'cms', 'template', lb.choice->'template')
          from wo_revision r left join lateral (select b.choice from wo_build b join wo_revision br on br.id = b.revision_id
            where br.opportunity_id = o.id order by b.created_at desc limit 1) lb on true
          where r.opportunity_id = o.id order by r.n desc limit 1) as latest_revision,
       coalesce((select jsonb_agg(distinct b.site_key) from wo_build b join wo_revision r on r.id = b.revision_id
          where r.opportunity_id = o.id and b.site_key is not null and b.state <> 'deleted'), '[]'::jsonb) as sites,
       (select jsonb_build_object('id', b.id, 'state', b.state, 'siteKey', b.site_key,
                 'done', coalesce(sc.state = 'done' and b.state <> 'deleted', false), 'siteState', sc.state,
                 'address', st.address, 'label', b.label, 'qa', b.qa->>'state', 'createdAt', b.created_at,
                 'expiresAt', b.demo_expires_at, 'frozenAt', b.demo_frozen_at,
                 'deletedAt', b.demo_deleted_at)
          from wo_build b join wo_revision r on r.id = b.revision_id
          left join site_creation sc on sc.account_id = b.account_id and sc.build_id = b.build_id::text
          left join site st on st.site_key = b.site_key
          where r.opportunity_id = o.id order by b.created_at desc, b.id desc limit 1) as latest_build
     from wo_opportunity o
     where o.account_id = $1 and o.id = any($2::uuid[]) and not (o.candidate ? 'ownSite')`,
      [accountId, ids]
    )
    const { settings } = await runtime()
    for (const r of rows) r.demo_action = r.demo_action ? demoActionShape(r.demo_action) : null
    return new Map(
      rows.map((r) => [
        r.id,
        {
          latestRevision: r.latest_revision ?? null,
          sites: r.sites ?? [],
          latestBuild: r.latest_build ?? null,
          demoAction: r.demo_action,
          demo: listedDemo(r.latest_build, settings.demoFreezeGraceDays, config, r.demo_action)
        }
      ])
    )
  }

  /**
   * What Find needs of each of the account's opportunities: whether any demo was ever built, the site
   * of its latest live demo, and its latest queued demo action.
   */
  /** The Build form's choices: each CMS's templates and the one `/ops/wo` pins there. */
  async function templateChoicesOf(settings) {
    return templateChoices(await templateCards(), settings)
  }

  async function demoFactsOf(accountId, ids) {
    if (!accountId || !ids.length) return new Map()
    const { rows } = await pool.query(
      `select o.id,
         exists (select 1 from wo_build b join wo_revision r on r.id = b.revision_id where r.opportunity_id = o.id) as built,
         (select b.site_key from wo_build b join wo_revision v on v.id = b.revision_id
           where v.opportunity_id = o.id and b.account_id = $1 and b.site_key is not null
             and b.state in ('completed','done') and b.demo_deleted_at is null
           order by b.created_at desc limit 1) as live_site_key,
         (select a.id from wo_demo_action a where a.opportunity_id = o.id and a.account_id = $1 and a.status = 'queued'
           order by a.accepted_at desc limit 1) as queued_action_id
       from wo_opportunity o where o.account_id = $1 and o.id = any($2::uuid[])`,
      [accountId, ids]
    )
    return new Map(
      rows.map((r) => [
        r.id,
        { built: r.built, liveSiteKey: r.live_site_key, queuedActionId: r.queued_action_id }
      ])
    )
  }

  /**
   * The brief of the current research when one exists (`current: true`), else the latest with `current: false`;
   * `current: null` when that cannot be told (no domain, or a public demo whose request row is gone), which must not
   * make the Details page unreadable.
   */
  async function briefStatus(opp, revisions) {
    if (!revisions.length) return null
    const domain = await loadDomain().catch(() => null)
    const key = domain
      ? await currentResearchKey(pool, opp, domain).catch((error) => {
          if (error?.code === 'DEMO_REQUEST_MISSING') return undefined
          throw error
        })
      : null
    const same = key ? revisions.find((r) => r.research_hash === key) : null
    const shown = same ?? revisions[0]
    const known = Boolean(domain) && key !== undefined
    // 🔒 A brief made while its photos were still being looked at is never "up to date": the labels it lacked may have
    // arrived, and only a Refresh reads them (`labellingUnsettled`), so the page must offer one.
    const settled = !labellingUnsettled({ assetLabelling: { status: same?.labelling_status } })
    // The shown brief was made while the photos were still being looked at (labelling or stalled): the page says so,
    // and while the labelling still runs it shows how far it is, so the person knows when a Refresh is worth it.
    const madeWhileLabelling = labellingUnsettled({ assetLabelling: { status: shown.labelling_status } })
    const progress = madeWhileLabelling
      ? await deps.photoLabelling
          ?.progress({ accountId: opp.account_id, opportunityId: opp.id })
          .catch(() => null)
      : null
    return {
      id: shown.id,
      n: shown.n,
      createdAt: shown.created_at,
      current: known ? Boolean(same) && settled : null,
      madeWhileLabelling,
      labelling:
        progress?.state === 'running' && progress.total > 0
          ? { looked: progress.looked, total: progress.total }
          : null
    }
  }

  /** The demo half of `GET /:id`: its demo, progress, revisions, brief, action, usage and builds. */
  async function detailOf(opp, accountId) {
    const [revisions, builds] = await Promise.all([
      revisionsOf(pool, opp.id),
      buildsOfOpportunity(pool, opp.id)
    ])
    // Opening the page is using the demo: each live demo gets a new term from now.
    const settings = await demoSettings()
    for (const [i, b] of builds.entries())
      if (b.demo_expires_at && !b.demo_frozen_at && !b.demo_deleted_at)
        builds[i] = (await touchDemo(pool, b.id, { now: now(), settings })) ?? b
    return {
      demo: (await listedDemoOf(accountId, [opp.id])).get(opp.id)?.demo ?? null,
      progress: demoProgress(builds[0]),
      revisions: revisions.map((r) => ({ id: r.id, n: r.n, createdAt: r.created_at })),
      brief: await briefStatus(opp, revisions),
      demoAction: (await demoActionsOf(pool, accountId, [opp.id]))[opp.id] ?? null,
      usage: await readDemoUsage(pool, accountId, settings.demoBuildsPerAccountPerDay, now()),
      builds: builds.map(buildShape)
    }
  }

  /**
   * Mount the build doors on the open router's app. `ctx` carries that router's own helpers, so a
   * refusal, a session and a switch read exactly as on its other doors.
   */
  function routes(app, ctx) {
    const { caller, refuse, notFound, featureOn, featureOff, domainOr, domainDeps, body, UUID, REQUEST_ID } =
      ctx
    app.route(
      '/',
      qualityEvidenceRoutes({
        pool,
        config,
        now,
        readEvidence: deps.quality?.readEvidence,
        cancelRun: deps.quality?.cancelRun
      })
    )
    /** A customer's own-site action (`own-site.js`) keeps its chat doors while Build from my business is on. */
    const ownActionOpen = async (accountId, actionId) =>
      (await ownSiteOn(pool)) && (await isOwnSiteAction(pool, accountId, actionId))
    const demoStateRefusal = (c, build) => {
      if (build.demo_deleted_at)
        return refuse(c, 409, 'DEMO_DELETED', 'This demo was deleted: press Rebuild to make it again.')
      if (build.demo_frozen_at)
        return refuse(c, 409, 'DEMO_FROZEN', 'This demo is frozen: press Reopen first.')
      return null
    }
    /** The opportunity's latest build that got a site: the demo the demo doors act on. */
    async function latestDemoOf(c, who) {
      const id = c.req.param('id')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp) return { refusal: notFound(c, 'opportunity') }
      const demo = (await buildsOfOpportunity(pool, opp.id)).find((b) => b.site_key)
      if (!demo) return { refusal: refuse(c, 404, 'NO_DEMO', 'Build a demo site first.') }
      return { opp, demo }
    }

    // ── Revisions ─────────────────────────────────────────────────────────────────────────────
    app.get(`${BASE}/revisions/:revId`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('revId')
      const revision = who.accountId && UUID.test(id) ? await revisionOf(pool, who.accountId, id) : null
      if (!revision) return notFound(c, 'revision')
      if (c.req.query('format') === 'md') {
        c.header('content-type', 'text/markdown; charset=utf-8')
        return c.body(revision.brief_md)
      }
      const { rows: builds } = await pool.query(
        'select * from wo_build where revision_id = $1 and account_id = $2 order by created_at desc',
        [revision.id, who.accountId]
      )
      // The name a build without a label would get now, for the Build form to show; null without the domain,
      // which must not make the revision unreadable.
      const domain = await loadDomain().catch(() => null)
      const settings = await demoSettings()
      return json(c, {
        revision: revisionShape(revision),
        demoAction:
          (await demoActionsOf(pool, who.accountId, [revision.opportunity_id]))[revision.opportunity_id] ??
          null,
        usage: await readDemoUsage(pool, who.accountId, settings.demoBuildsPerAccountPerDay, now()),
        builds: builds.map(buildShape),
        suggestedLabel: domain ? await suggestedLabel({ pool, config, domain, revision }) : null
      })
    })

    app.get(`${BASE}/builds/:buildId`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('buildId')
      const found = who.accountId && UUID.test(id) ? await buildOf(pool, who.accountId, id) : null
      if (!found) return notFound(c, 'build')
      // The host's ending is asked while it provisions: a failed provision reads `failed`, with its reason.
      const build = await clocked(
        await settleBuild({
          pool,
          request,
          origin,
          cookie: c.req.header('cookie') ?? '',
          build: found
        })
      )
      const { site, siteJob } = await siteOfBuild(pool, build)
      return json(c, { build: buildShape(build), site, siteJob })
    })

    // Pictures onto the provisioned site + the agent's prompt; repeatable, resumes where it stopped.
    app.post(`${BASE}/builds/:buildId/handoff`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('buildId')
      const found = who.accountId && UUID.test(id) ? await buildOf(pool, who.accountId, id) : null
      if (!found) return notFound(c, 'build')
      if (!(await featureOn())) return featureOff(c)
      const demoRefusal = demoStateRefusal(c, found)
      if (demoRefusal) return demoRefusal
      // 🔒 One press at a time per build: a second press while the first still uploads or reads the baseline
      // (it can outlive the proxy's 100 s) would make a second chat and send the prompt twice.
      const held = await withHandoffLock(pool, found.id, () => runHandoff(c, who, found))
      if (held.locked) return held.value
      return refuse(
        c,
        409,
        'HANDOFF_IN_PROGRESS',
        'This demo is being handed to its agent; wait, then press again.',
        {
          handoff: found.handoff ?? null,
          qa: qaShape(found.qa)
        }
      )
    })

    /** One hand-off press, under the build's hand-off lock. */
    async function runHandoff(c, who, found) {
      const build = await reconcileBuild(pool, found)
      await touchDemo(pool, build.id, { now: now(), settings: await demoSettings() })
      const stored = await revisionOf(pool, who.accountId, build.revision_id)
      if (!stored) return notFound(c, 'revision')
      const revision = withBuildChoice(stored, build.choice)
      const domain = await domainOr(c)
      if (domain instanceof Response) return domain
      const result = await handOffToAgent({
        ...deps,
        pool,
        request,
        objects,
        domain,
        origin,
        cookie: c.req.header('cookie') ?? '',
        build,
        revision,
        email: who.email,
        now
      })
      return json(c, result.body, result.status)
    }

    app.get(`${BASE}/builds/:buildId/handoff`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('buildId')
      const found = who.accountId && UUID.test(id) ? await buildOf(pool, who.accountId, id) : null
      if (!found) return notFound(c, 'build')
      if (!found.handoff)
        return refuse(c, 404, 'HANDOFF_NOT_STARTED', 'Press "Hand to the agent" once the site is ready.')
      // The QA gate holds no baseline yet: the page must not send the prompt either (the sweep sends it).
      const { prompt: _prompt, ...waiting } = found.handoff
      const handoff =
        found.qa && !found.qa.baseline && found.handoff.state === 'ready' ? waiting : found.handoff
      return json(c, { handoff, qa: qaShape(found.qa), site: { key: found.site_key } })
    })

    // One press is persisted before any brief, site or agent session is created.
    app.get(`${BASE}/demo/usage`, async (c) => {
      const who = await caller(c, { create: true })
      if (who instanceof Response) return who
      return json(c, {
        usage: await readDemoUsage(
          pool,
          who.accountId,
          (await demoSettings()).demoBuildsPerAccountPerDay,
          now()
        )
      })
    })

    for (const operation of ['prepare', 'send'])
      app.post(`${BASE}/demo/actions/:actionId/chat/${operation}`, async (c) => {
        const who = await caller(c)
        if (who instanceof Response) return who
        if (!(await featureOn()) && !(await ownActionOpen(who.accountId, c.req.param('actionId'))))
          return featureOff(c)
        if (!UUID.test(c.req.param('actionId')) || !who.accountId) return notFound(c, 'action')
        if (!deps.clientDemo)
          return refuse(c, 503, 'DEMO_CHAT_UNAVAILABLE', 'The demo chat service is unavailable.')
        try {
          const result = await deps.clientDemo[operation]({
            accountId: who.accountId,
            actionId: c.req.param('actionId'),
            body: await body(c)
          })
          return json(c, result)
        } catch (error) {
          return refuse(
            c,
            error.status ?? 409,
            error.code ?? 'DEMO_CHAT_UNAVAILABLE',
            'The demo chat could not be prepared or reserved.',
            // DEMO_LOGO_RESEARCH_PENDING names when to ask again; the page waits until then.
            typeof error.retryAt === 'string' ? { retryAt: error.retryAt } : {}
          )
        }
      })

    app.get(`${BASE}/demo/actions/:actionId`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      // No feature check here before either: an action is readable by its owner whatever the switches say.
      const id = c.req.param('actionId')
      const action = UUID.test(id) && who.accountId ? await demoActionOf(pool, who.accountId, id) : null
      if (!action) return notFound(c, 'action')
      return json(c, { action })
    })

    // How the template picker groups the cards before a build of these opportunities: by their one trade, Tracy's
    // own recommendation first (`templateRanking`). `ranking` is null when the trade is unknown or not shared.
    app.get(`${BASE}/demo/template-ranking`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      if (!(await featureOn())) return featureOff(c)
      const ids = [
        ...new Set(
          String(c.req.query('ids') ?? '')
            .split(',')
            .filter(Boolean)
        )
      ]
      if (!ids.length || ids.length > 100 || ids.some((id) => !UUID.test(id)))
        return refuse(c, 400, 'INVALID_IDS', 'Send 1 to 100 opportunity ids as ids=<id>,<id>.')
      const ranking = await templateRankingOf(pool, {
        accountId: who.accountId,
        opportunityIds: ids,
        templates: await templateCards()
      })
      return json(c, { ranking })
    })

    app.post(`${BASE}/demo/builds/bulk`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      if (!(await featureOn())) return featureOff(c)
      const b = await body(c)
      if (
        !REQUEST_ID.test(String(b?.requestId ?? '')) ||
        !Array.isArray(b?.ids) ||
        !b.ids.length ||
        b.ids.length > 100 ||
        b.ids.some((id) => !UUID.test(String(id))) ||
        new Set(b.ids).size !== b.ids.length
      )
        return refuse(c, 400, 'INVALID_BATCH', 'Send a requestId and 1–100 distinct opportunity ids.')
      const result = await acceptActions({
        accountId: who.accountId,
        entries: b.ids.map((id) => ({
          opportunityId: id,
          requestId: `${b.requestId}:${id}`,
          selection: b.selection,
          workflow: b.workflow,
          chatMode: b.chatMode
        })),
        requireSelection: true,
        templates: await templateCards(),
        pins: pinsOf(await demoSettings()),
        limit: (await demoSettings()).demoBuildsPerAccountPerDay,
        now
      })
      return json(c, result.body, result.status)
    })

    app.post(`${BASE}/:id/demo/build`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      if (!(await featureOn())) return featureOff(c)
      const id = c.req.param('id')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp) return notFound(c, 'opportunity')
      const b = await body(c)
      if (!REQUEST_ID.test(String(b?.requestId ?? '')) || (b.retryOf && !UUID.test(String(b.retryOf))))
        return refuse(
          c,
          400,
          'INVALID_REQUEST_ID',
          'Send a requestId, and the failed action id as retryOf to resume it.'
        )
      if (b.label !== undefined && typeof b.label !== 'string')
        return refuse(c, 400, 'INVALID_LABEL', 'Send the site name as "label", or leave it out.')
      if (b.fromFind === true) {
        const [research] = await findResearchOf(
          pool,
          [{ provider: opp.provider, providerId: opp.provider_id }],
          who.accountId
        )
        if (!usableResearch(research) && !(research?.completed_at && research?.own_profile))
          return refuse(c, 409, 'RESEARCH_REQUIRED', 'Research this place before building a demo.')
      }
      // 🔒 A BUILD FROM THE RESEARCH NEEDS THE RESEARCH (local stand 24/10/2026): an agent build was accepted while its
      // research stood paused on a website timeout, froze 0 sources and 0 photos, and the agent built a site of
      // template words. A paused or failed research is resumed or run again first; a Retry continues its own build.
      if ((b.workflow === AGENT_DEMO || b.workflow === BRIEF_BUILD) && !b.retryOf) {
        const latest = (await jobsOfOpportunity(pool, opp.id)).find((j) => j.kind === 'research')
        if (latest?.state !== 'completed')
          return refuse(
            c,
            409,
            'RESEARCH_NOT_DONE',
            'Finish this place’s research first: resume it, or research again.',
            {
              research: latest ? { id: latest.id, state: latest.state } : null
            }
          )
      }
      const result = await acceptActions({
        accountId: who.accountId,
        entries: [
          {
            opportunityId: id,
            requestId: b.requestId,
            retryOf: b.retryOf ?? null,
            selection: b.selection,
            workflow: b.workflow,
            chatMode: b.chatMode,
            ...(b.label === undefined ? {} : { label: b.label.trim() })
          }
        ],
        requireSelection: true,
        templates: b.retryOf ? null : await templateCards(),
        pins: pinsOf(await demoSettings()),
        limit: (await demoSettings()).demoBuildsPerAccountPerDay,
        now
      })
      return json(c, result.body, result.status)
    })

    app.post(`${BASE}/:id/revisions`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('id')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp) return notFound(c, 'opportunity')
      if (!(await featureOn())) return featureOff(c)
      try {
        if ((await qualityMode(who.accountId)) !== 'off')
          return refuse(
            c,
            409,
            'QUALITY_USE_DEMO_ACTION',
            'Create a demo action to prepare its durable editorial Site brief.'
          )
      } catch (error) {
        return refuse(
          c,
          409,
          error.code ?? 'QUALITY_UNAVAILABLE',
          'Review the editorial configuration before preparing a revision.'
        )
      }
      const domain = await domainOr(c)
      if (domain instanceof Response) return domain
      // Refresh: the brief of the current research, the latest one when nothing changed. No template: a build chooses.
      const result = await createRevision(pool, {
        accountId: who.accountId,
        opportunityId: opp.id,
        domain,
        now,
        pictureLabels: deps.pictureLabels ?? null
      })
      if ('error' in result && result.error === 'NOT_FOUND') return notFound(c, 'opportunity')
      if ('error' in result)
        return refuse(c, 422, 'BRIEF_INVALID', 'Run the research again: the brief did not pass its schema.', {
          errors: result.errors
        })
      if (result.reused) return json(c, { revision: revisionShape(result.revision) }, 200)
      return json(c, { revision: revisionShape(result.revision) }, 201)
    })

    // ── A demo's life (`demo-retention.js`) ─────────────────────────────────────────────────────
    app.post(`${BASE}/:id/demo/reopen`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const found = await latestDemoOf(c, who)
      if (found.refusal) return found.refusal
      if (found.demo.demo_deleted_at) return demoStateRefusal(c, found.demo)
      const reopened = await reopenDemo(pool, found.demo.id, { now: now(), settings: await demoSettings() })
      if (!reopened) return refuse(c, 409, 'DEMO_NOT_FROZEN', 'This demo is not frozen: nothing to reopen.')
      return json(c, { demo: demoOf(reopened) })
    })

    app.post(`${BASE}/:id/demo/extend`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const found = await latestDemoOf(c, who)
      if (found.refusal) return found.refusal
      const stateRefusal = demoStateRefusal(c, found.demo)
      if (stateRefusal) return stateRefusal
      const extended = await touchDemo(pool, found.demo.id, { now: now(), settings: await demoSettings() })
      if (!extended) return refuse(c, 409, 'DEMO_KEPT', 'This demo is kept for good: it has no expiry.')
      return json(c, { demo: demoOf(extended) })
    })

    // The deleted demo made again from the same revision, through the same build path as the first.
    app.post(`${BASE}/:id/demo/rebuild`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const found = await latestDemoOf(c, who)
      if (found.refusal) return found.refusal
      if (!(await featureOn())) return featureOff(c)
      const b = (await body(c)) ?? {}
      if (!REQUEST_ID.test(String(b.requestId ?? '')))
        return refuse(
          c,
          400,
          'INVALID_REQUEST_ID',
          'Send a requestId of 8–100 letters, digits, ".", "_", ":" or "-".'
        )
      // A press repeated with the same requestId answers the build it already made.
      const { rows: same } = await pool.query(
        'select * from wo_build where account_id = $1 and request_id = $2',
        [who.accountId, b.requestId]
      )
      const old = same[0] ? null : found.demo
      if (old && !old.demo_deleted_at && old.state !== 'deleted')
        return refuse(c, 409, 'DEMO_NOT_DELETED', 'This demo still exists: reopen or extend it instead.')
      const revision = await revisionOf(pool, who.accountId, (same[0] ?? found.demo).revision_id)
      if (!revision) return notFound(c, 'revision')
      const domain = await domainOr(c)
      if (domain instanceof Response) return domain
      const label =
        typeof b.label === 'string' && b.label.trim()
          ? b.label.trim()
          : String(found.demo.receipt?.body?.label ?? found.demo.site_key.split('.')[0])
      const accepted = await acceptActions({
        accountId: who.accountId,
        limit: (await demoSettings()).demoBuildsPerAccountPerDay,
        now,
        entries: [
          {
            opportunityId: found.opp.id,
            revisionId: revision.id,
            requestId: b.requestId,
            label,
            automatic: true,
            // Built again as it was: the deleted build's CMS, template and workflow.
            selection: selectionOfChoice((same[0] ?? found.demo).choice)
          }
        ]
      })
      if (accepted.status >= 300) return json(c, accepted.body, accepted.status)
      const build = (
        await pool.query('select * from wo_build where account_id = $1 and request_id = $2', [
          who.accountId,
          b.requestId
        ])
      ).rows[0]
      // The runner writes the build with its choice; until then the action alone answers.
      return json(c, { ...accepted.body, build: build ? buildShape(build) : null }, 202)
    })

    // Add site's Build from my business: the customer's own business, researched and built like a demo.
    ownSiteRoutes(app, {
      pool,
      config,
      now,
      ensureAccount,
      domainOr,
      domainDeps,
      runtime: ctx.runtime,
      body,
      candidateFields: ctx.candidateFields,
      linkFields: ctx.linkFields,
      linkRequestOf: ctx.linkRequestOf,
      saveListingSource: ctx.saveListingSource,
      insertOpportunity,
      opportunityOf,
      jobsOfOpportunity,
      jobShape: ctx.jobShape,
      startResearch: ctx.startResearch,
      acceptActions,
      templateCards
    })
  }

  return {
    routes,
    settingsOf,
    saveSettings,
    listedDemoOf,
    detailOf,
    demoFactsOf,
    demoJourneySql,
    templateChoicesOf,
    templateCards
  }
}

/**
 * The Demo column's facts (tasks/todo-wo-demo-retention.md "Demo column"): the latest build's site and
 * clock, and how the build itself stands. Null for a row never built.
 *
 * A latest action that has not completed is the column's news too, by the rule the stage SQL (`journey-sql.js`)
 * and the client's `demoActionOpen` share: a Retry reuses its build, so a build still provisioning reads failed
 * once its action failed, and Building is timed from the queued action's own `acceptedAt` (27/10/2026). The build
 * row itself stays as the host left it: the Retry provisions on that same row.
 */
function listedDemo(b, graceDays, config, action = null) {
  if (!b) return null
  const frozen = b.frozenAt ? Date.parse(b.frozenAt) : Number.NaN
  const own = b.state === 'refused' || b.siteState === 'failed' ? 'failed' : b.done ? 'done' : 'building'
  // Open = not completed (`demoActionOpen`); an open action is either still queued or failed (`demoActionShape`).
  const running = action != null && action.state !== 'completed' && action.state !== 'failed'
  const failed = action?.state === 'failed'
  const status = running ? 'building' : failed && own === 'building' ? 'failed' : own
  const startedAt = (running ? action.acceptedAt : null) ?? b.createdAt
  return {
    siteKey: b.siteKey ?? null,
    url: b.address ?? (b.label && config?.siteDomain ? bornSiteAddress(b.label, config) : null),
    expiresAt: b.expiresAt ?? null,
    frozenAt: b.frozenAt ?? null,
    deletedAt: b.deletedAt ?? null,
    deletesAt:
      Number.isFinite(frozen) && !b.deletedAt && Number.isInteger(graceDays)
        ? new Date(frozen + graceDays * 86_400_000).toISOString()
        : null,
    qa: b.qa ?? null,
    build: { status, startedAt: startedAt ?? null }
  }
}

/** The demo of a build row as the list and the demo doors answer it. */
function demoOf(b) {
  return {
    siteKey: b.site_key,
    expiresAt: b.demo_expires_at ?? null,
    touchedAt: b.demo_touched_at ?? null,
    frozenAt: b.demo_frozen_at ?? null,
    deletedAt: b.demo_deleted_at ?? null
  }
}

/** A build's frozen choice as a demo action's selection, for building it again. */
function selectionOfChoice(choice) {
  const t = choice?.template ?? {}
  return {
    ...(choice?.quickstartWorkflow === AGENT_DEMO || choice?.quickstartWorkflow === BRIEF_BUILD
      ? { workflow: choice.quickstartWorkflow }
      : {}),
    cms: choice?.cms,
    design: t.design,
    quickstart: t.quickstart,
    version: t.version,
    ...(t.release ? { release: t.release } : {})
  }
}

function revisionShape(r) {
  return {
    id: r.id,
    opportunityId: r.opportunity_id,
    n: r.n,
    brief: r.brief,
    assetManifest: r.asset_manifest,
    createdAt: r.created_at
  }
}

function buildShape(b) {
  return {
    id: b.id,
    revisionId: b.revision_id,
    requestId: b.request_id,
    buildId: b.build_id,
    // What this demo was built with; the brief it came from names neither.
    cms: b.choice?.cms ?? null,
    template: b.choice?.template ?? null,
    siteKey: b.site_key,
    label: b.label ?? null,
    siteJobId: b.site_job_id,
    state: b.state,
    receipt: b.receipt,
    handoff: b.handoff
      ? { state: b.handoff.state, placed: Object.keys(b.handoff.placed ?? {}).length, at: b.handoff.at }
      : null,
    qa: b.qa
      ? {
          state: b.qa.state,
          repairs: b.qa.repairs ?? 0,
          rounds: (b.qa.rounds ?? []).length,
          reason: b.qa.reason ?? null
        }
      : null,
    demo: b.site_key ? demoOf(b) : null,
    createdAt: b.created_at,
    updatedAt: b.updated_at
  }
}
