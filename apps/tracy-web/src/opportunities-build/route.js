/**
 * Tracy's demo builder for Website Opportunities (ADR 0036): the build doors and the demo half of the
 * open doors' answers. The open layer (`website-opportunities/src/route.js`) receives this object as `deps.builder`
 * and never imports this directory; without it the open doors answer with no demo data.
 *
 * Every door reads the signed-in person through the open router's `caller` and touches only that
 * account's rows: another account's revision, build or action answers 404, like one that does not exist.
 */
import { withChainRuns, withTemplateEstimates } from './chain-progress.js'
import { json } from '../lib/http.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { woRuntime } from '../lib/wo-ops.js'
import { pinsOf, readTemplateCards, templateChoices } from '../lib/wo-revision-choice.js'
import { findResearchOf, usableResearch } from 'website-opportunities/src/find-research.js'
import { demoPageSpeedOf } from 'website-opportunities/src/pagespeed.js'
import {
  insertOpportunity,
  jobsOfOpportunity,
  opportunityOf,
  readPreference,
  savePreference
} from 'website-opportunities/src/store.js'
import { AGENT_DEMO } from './agent-demo.js'
import { withBuildChoice } from './build-choice.js'
import {
  buildOf,
  buildsOfOpportunity,
  reconcileBuild,
  revisionOf,
  revisionsOf,
  siteOfBuild
} from './build-store.js'
import { savedSiteLabel, settleBuild, suggestedLabel } from './builds.js'
import { siteLabelRoutes } from './site-label-route.js'
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
import { latestPreviewOf } from './demo-preview.js'
import { demoBuildRunning, prepareOpportunityDelete } from './demo-removal.js'
import { withHandoffLock } from './handoff.js'
import { handOffToAgent } from './handoff-service.js'
import { demoJourneySql } from './journey-sql.js'
import { isOwnSiteAction, ownSiteOn, ownSiteRoutes } from './own-site.js'
import { QUALITY_PROTOCOL, qualityModeOf } from './quality-protocol.js'
import { qualityEvidenceRoutes } from './quality-route.js'
import {
  briefIsCurrent,
  createRevision,
  currentResearchState,
  labelsIncomplete,
  readsResearchKey,
  resolveRevisionCms
} from './revisions.js'
import { randomUUID } from 'node:crypto'
import { briefJobShape, createBriefJobs } from './brief-jobs.js'
import { editRevision, readBriefEdits } from './brief-edits.js'
import { researched, researchStateOf } from 'website-opportunities/src/research-state.js'
import {
  APPROVAL_NEXT,
  approvalOf,
  approveBrief,
  briefGateOf,
  buildGateOf
} from 'website-opportunities/src/approval.js'

const BASE = '/api/website-opportunities'

/** `at`: the later of the latest revision and the latest brief job that ended done, of the opportunity `$1` (#537). */
const LATEST_BRIEF_AT_SQL = `select greatest(
    (select max(created_at) from wo_revision where opportunity_id = $1),
    (select max(updated_at) from wo_brief_job where opportunity_id = $1 and state = 'done')) as at`

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
 *   templateCards: () => Promise<any>,
 *   prepareDelete: (opp: object, accountId: string) => Promise<{ok: boolean, siteRemoved?: boolean}>,
 *   demoBuildRunning: (opp: object, accountId: string) => Promise<boolean>
 * }}
 */
export function createWebsiteBuilder(deps) {
  const { config, pool, request, ensureAccount, loadDomain, objects } = deps
  const now = deps.now ?? Date.now
  const origin = String(config.origin ?? '').replace(/\/+$/, '')
  const runtime = () => woRuntime(pool, config)
  const templateCards = () => readTemplateCards(request, origin)

  const demoSettings = async () => (await runtime()).settings
  // The Content brief as a background job (#524): the brief step labels the photographs, then writes the brief.
  const briefJobs = createBriefJobs({
    pool,
    log: deps.log ?? console,
    make: async ({ accountId, opportunityId, onStep }) => {
      const label = deps.pictureLabels ?? null
      return createRevision(pool, {
        accountId,
        opportunityId,
        domain: await loadDomain(),
        now,
        pictureLabels: label
          ? async (input) => {
              onStep('labelling')
              try {
                return await label(input)
              } finally {
                onStep('writing')
              }
            }
          : null
      })
    }
  })
  const qualityMode = (accountId) => qualityModeOf(pool, accountId, { available: deps.quality?.available })
  async function acceptActions(args) {
    if (args.entries.some((entry) => entry.workflow === AGENT_DEMO))
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
       (${LATEST_BRIEF_AT_SQL.replaceAll('$1', 'o.id')}) as brief_at,
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
                 'deletedAt', b.demo_deleted_at, 'built', b.built,
                 'chain', (select jsonb_build_object('at', sb.created_at, 'minutes', sb.timings->'chain'->'totalMinutes',
                             'usd', sb.timings->'chain'->'totalUsd', 'ending', sb.timings->'chain'->>'ending')
                             from site_brief sb left join site s on s.site_key = sb.site_key
                            where sb.site_key = b.site_key and (s.created_at is null or sb.created_at >= s.created_at)
                            order by sb.created_at desc limit 1),
                 'findings', (select jsonb_agg(distinct f->>'id') from jsonb_array_elements(
                     case when jsonb_typeof(b.qa->'rounds'->-1->'failed') = 'array'
                       then b.qa->'rounds'->-1->'failed' else '[]'::jsonb end) f where f->>'id' is not null),
                 'previewAt', (select p.captured_at from wo_build_preview p where p.build_id = b.id))
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
    await withChainRuns(
      pool,
      rows.map((r) => r.demo_action),
      { now: now() }
    )
    return new Map(
      rows.map((r) => [
        r.id,
        {
          latestRevision: r.latest_revision ?? null,
          // When a brief was last made or made again (`latestBriefAt`), for the card's approval (#537).
          latestBriefAt: r.brief_at ?? null,
          sites: r.sites ?? [],
          latestBuild: latestBuildShape(r.latest_build),
          demoAction: r.demo_action,
          demo: listedDemo(r.latest_build, settings.demoFreezeGraceDays, config, r.demo_action, r.id)
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
    return withTemplateEstimates(pool, templateChoices(await templateCards(), settings))
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
    const live = domain
      ? await currentResearchState(pool, opp, domain).catch((error) => {
          if (error?.code === 'DEMO_REQUEST_MISSING') return undefined
          throw error
        })
      : null
    const key = live?.key ?? null
    // The newest brief of the current research, a seller's edit of it included (`brief-edits.js`), with its labels
    // complete: one whose labels are absent, failed or pending offers Refresh (#555, #556), as does the brief of older
    // research. A labelled brief may sit in the relabelled slot of the key (`researchKeySlots`).
    const same = key
      ? revisions.find(
          (r) =>
            readsResearchKey({ researchHash: r.research_hash, editedFromHash: r.edited_from_hash }, key) &&
            !labelsIncomplete({ assetLabelling: r.asset_labelling, labelledShare: r.labelled_share })
        )
      : null
    const shown = same ?? revisions[0]
    const known = Boolean(domain) && live !== undefined
    // A brief of a reading made under older rules is not current either (#524). The brief job cannot read the
    // business again, so `sameResearch` says whether a Refresh would change anything: when the brief already
    // matches this research, only Research again brings the reading up to the latest rules.
    const readingOld = live?.readingOld === true
    // A quality-v1 brief has no hash: it is current while its frozen evidence is the research now (`briefIsCurrent`).
    let current = Boolean(same)
    if (known && live && !same && !readingOld && !shown.research_hash && !shown.edited_from_hash) {
      const { rows } = await pool.query('select research, brief from wo_revision where id = $1', [shown.id])
      if (rows[0]) current = await briefIsCurrent(pool, opp, domain, { research_hash: null, ...rows[0] })
    }
    return {
      id: shown.id,
      n: shown.n,
      createdAt: shown.created_at,
      current: known ? current && !readingOld : null,
      ...(shown.edited_by === 'seller' ? { editedBySeller: true } : {}),
      ...(readingOld ? { readingOld: true, sameResearch: Boolean(same) } : {})
    }
  }

  /**
   * When a Content brief of an opportunity was last made or made again, or null before the first: the latest revision,
   * or a later brief job that ended done. A job that found the same research answers an existing revision (`reused`),
   * so without the job's time a brief marked stale by a Profile edit that left the research as it was (an edit undone)
   * would stay stale however often it is made again.
   */
  async function latestBriefAt(opportunityId) {
    const { rows } = await pool.query(LATEST_BRIEF_AT_SQL, [opportunityId])
    return rows[0]?.at ?? null
  }

  /** The seller's approvals of one opportunity (#537, `approval.js`), read now. */
  async function approvalFor(opp) {
    const [research, briefAt] = await Promise.all([researchStateOf(pool, opp.id), latestBriefAt(opp.id)])
    return approvalOf({ opportunity: opp, research, latestBriefAt: briefAt })
  }

  /** A demo action with its chain progress (`chain-progress.js`), when its build runs the step chain. */
  async function withChainRun(action) {
    await withChainRuns(pool, [action], { now: now() })
    return action
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
      revisions: revisions.map((r) => ({
        id: r.id,
        n: r.n,
        createdAt: r.created_at,
        ...(r.edited_by === 'seller' ? { editedBySeller: true } : {})
      })),
      brief: await briefStatus(opp, revisions),
      // The latest Content brief job (#524): a running one shows its progress after a reload, a failed one its reason.
      briefJob: briefJobShape(await briefJobs.latestOf(opp.id)),
      demoAction: await withChainRun((await demoActionsOf(pool, accountId, [opp.id]))[opp.id] ?? null),
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
    /**
     * The 409 of a build whose brief is not approved yet (#537), or null. Only the classic brief path is gated: with the
     * quality protocol on (`quality-protocol.js`) a demo action prepares its own durable brief, which no seller reviews
     * here. A batch names every refused opportunity in `ids`.
     */
    async function buildGateRefusal(c, accountId, opps) {
      let mode
      try {
        mode = await qualityMode(accountId)
      } catch {
        return null
      }
      if (mode !== 'off') return null
      const refused = []
      for (const opp of opps) {
        const gate = buildGateOf(await approvalFor(opp))
        if (gate) refused.push({ id: opp.id, code: gate })
      }
      if (!refused.length) return null
      const code = refused[0].code
      return refuse(c, 409, code, APPROVAL_NEXT[code], opps.length > 1 ? { ids: refused } : {})
    }

    // The seller approves the latest Content brief (#537): it unlocks Build demo. A brief made from an older Profile is made
    // again first.
    app.post(`${BASE}/:id/brief/approve`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('id')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp) return notFound(c, 'opportunity')
      const before = await approvalFor(opp)
      if (before.brief === 'none') return refuse(c, 409, 'NO_BRIEF', APPROVAL_NEXT.NO_BRIEF)
      if (before.brief === 'stale') return refuse(c, 409, 'BRIEF_STALE', APPROVAL_NEXT.BRIEF_STALE)
      if (before.profile !== 'approved')
        return refuse(c, 409, 'PROFILE_NOT_APPROVED', APPROVAL_NEXT.PROFILE_NOT_APPROVED)
      const row = await approveBrief(pool, who.accountId, opp.id)
      if (!row) return notFound(c, 'opportunity')
      return json(c, { opportunity: ctx.opportunityShape(row), approval: await approvalFor(row) })
    })

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
        suggestedLabel: domain ? await suggestedLabel({ pool, config, domain, revision }) : null,
        // Site name on Tracy (#519): the label the person saved on the opportunity, or null.
        siteLabel: await savedSiteLabel(pool, revision.opportunity_id)
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
            // DEMO_LOGO_RESEARCH_PENDING and DEMO_PICTURE_LABELS_PENDING name when to ask again; the page waits.
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
      const opps = (await Promise.all(b.ids.map((id) => opportunityOf(pool, who.accountId, id)))).filter(
        Boolean
      )
      const bulkRefusal = await buildGateRefusal(c, who.accountId, opps)
      if (bulkRefusal) return bulkRefusal
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
      // The brief on screen (#553): the build uses exactly it, or is refused when it is not current.
      if (b.revisionId !== undefined && (!UUID.test(String(b.revisionId)) || b.retryOf))
        return refuse(
          c,
          400,
          'INVALID_REVISION_ID',
          'Send the shown brief’s id as "revisionId", or leave it out; a Retry keeps its own brief.'
        )
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
      if (b.workflow === 'agent-demo/1' && !b.retryOf) {
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
      // 🔒 A demo is built from an approved brief (#537): a retry continues its own accepted build, and a Find quick build
      // (`fromFind`) is its own flow with no Details page to approve on.
      if (!b.retryOf && b.fromFind !== true) {
        const refusal = await buildGateRefusal(c, who.accountId, [opp])
        if (refusal) return refusal
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
            ...(b.label === undefined ? {} : { label: b.label.trim() }),
            ...(b.revisionId === undefined ? {} : { briefRevisionId: b.revisionId })
          }
        ],
        // Whether the shown brief reads the place's research now, inside the acceptance transaction (`BRIEF_STALE`).
        briefCurrent: async (client, opportunityId, revision) => {
          const place = (
            await client.query('select * from wo_opportunity where id = $1 and account_id = $2', [
              opportunityId,
              who.accountId
            ])
          ).rows[0]
          return place ? briefIsCurrent(client, place, await loadDomain(), revision) : false
        },
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
      // 🔒 A brief is made from THIS card's research (#524): locked until it finished.
      if (!researched(await researchStateOf(pool, opp.id)))
        return refuse(
          c,
          409,
          'RESEARCH_NOT_DONE',
          'Press Research first: the brief is made from its results.'
        )
      // 🔒 The seller approves the Profile before a brief is made from it (#537); an approved brief is final (R23).
      const approval = await approvalFor(opp)
      const briefGate = briefGateOf(approval)
      if (briefGate) return refuse(c, 409, briefGate, APPROVAL_NEXT[briefGate])
      if (approval.brief === 'approved') return refuse(c, 409, 'BRIEF_APPROVED', APPROVAL_NEXT.BRIEF_APPROVED)
      const b = (await body(c)) ?? {}
      if (b.requestId !== undefined && !REQUEST_ID.test(String(b.requestId)))
        return refuse(
          c,
          400,
          'INVALID_REQUEST_ID',
          'Send a requestId of 8–100 letters, digits, ".", "_", ":" or "-", or leave it out.'
        )
      // Refresh: the brief of the current research, the latest one when nothing changed. No template: a build chooses.
      // It runs in the background (`brief-jobs.js`): poll `GET …/:id/brief-jobs/:jobId`.
      const started = await briefJobs.start({
        accountId: who.accountId,
        opportunityId: opp.id,
        requestId: b.requestId ?? `brief-${randomUUID()}`
      })
      if (started.reused)
        return refuse(c, 409, 'REQUEST_ID_REUSED', 'Send a new requestId for another opportunity.')
      return json(c, { job: briefJobShape(started.job) }, 202)
    })

    // The seller's edits of a Content brief (#524): a new revision marked edited, which Build then builds from. Locked
    // once the brief is approved (#537 R23): a change after approval is a new card of the same place.
    app.post(`${BASE}/:id/revisions/:revId/edits`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('id')
      const revId = c.req.param('revId')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp || !UUID.test(revId)) return notFound(c, 'brief')
      if ((await approvalFor(opp)).brief === 'approved')
        return refuse(c, 409, 'BRIEF_APPROVED', APPROVAL_NEXT.BRIEF_APPROVED)
      const read = readBriefEdits(await body(c))
      if ('error' in read)
        return refuse(
          c,
          400,
          'INVALID_EDITS',
          'Send "edits" as a list of {"path", "value"}: a text of the brief and its new words, 1 to 2000 characters.'
        )
      const domain = await domainOr(c)
      if (domain instanceof Response) return domain
      const result = await editRevision(pool, {
        accountId: who.accountId,
        opportunityId: opp.id,
        revisionId: revId,
        edits: read.edits,
        domain,
        now
      })
      if (result.error === 'NOT_FOUND') return notFound(c, 'brief')
      if (result.error === 'UNKNOWN_PATH')
        return refuse(c, 400, 'UNKNOWN_PATH', `This brief has no text at ${result.path}.`)
      if (result.error)
        return refuse(c, 422, 'BRIEF_INVALID', 'These words do not fit the brief.', { errors: result.errors })
      return json(c, { revision: revisionShape(result.revision) }, 201)
    })

    // The Content brief job (#524): its step while it runs; once done, the revision it made.
    app.get(`${BASE}/:id/brief-jobs/:jobId`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('id')
      const jobId = c.req.param('jobId')
      const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
      if (!opp || !UUID.test(jobId)) return notFound(c, 'brief job')
      const job = await briefJobs.read(who.accountId, opp.id, jobId)
      if (!job) return notFound(c, 'brief job')
      const revision = job.revision_id ? await revisionOf(pool, who.accountId, job.revision_id) : null
      return json(c, { job: briefJobShape(job), ...(revision ? { revision: revisionShape(revision) } : {}) })
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

    // The picture of the latest demo's home page (#537, `demo-preview.js`): image bytes, or 404 when none was taken.
    // The Details answer names it with its capture time (`demo.preview.url`), so a new picture is a new address.
    app.get(`${BASE}/:id/demo/preview`, async (c) => {
      const who = await caller(c)
      if (who instanceof Response) return who
      const id = c.req.param('id')
      const picture = who.accountId && UUID.test(id) ? await latestPreviewOf(pool, who.accountId, id) : null
      if (!picture) return notFound(c, 'preview')
      return new Response(new Uint8Array(picture.bytes), {
        status: 200,
        headers: {
          'content-type': picture.contentType,
          'content-length': String(picture.bytes.length),
          'cache-control': 'private, max-age=86400',
          'last-modified': new Date(picture.capturedAt).toUTCString(),
          'x-content-type-options': 'nosniff'
        }
      })
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

    // Site name on Tracy (#519): the label a demo of this opportunity is built under.
    siteLabelRoutes(app, { pool, config, loadDomain, caller, refuse, notFound, body, UUID, opportunityOf })

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
      templateCards,
      // Read at call time: the client demo service is set after this builder is made.
      warmPictureLabels: (args) => deps.clientDemo?.warmPictureLabels?.(args)
    })
  }

  return {
    routes,
    settingsOf,
    saveSettings,
    listedDemoOf,
    detailOf,
    latestBriefAt,
    demoFactsOf,
    demoJourneySql,
    // Settles every Content brief job this process runs (tests, shutdown).
    briefJobsIdle: () => briefJobs.idle(),
    templateChoicesOf,
    templateCards,
    // Before an opportunity is deleted: its live demo sites torn down (`demo-removal.js`), with `deps.demoTeardown`.
    prepareDelete: (opp, accountId) =>
      prepareOpportunityDelete(pool, opp, accountId, { now: now(), teardown: deps.demoTeardown ?? null }),
    // A demo still being built holds the delete back (409 `DEMO_BUILD_RUNNING`), before anything is changed.
    demoBuildRunning: (opp, accountId) => demoBuildRunning(pool, opp, accountId)
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
function listedDemo(b, graceDays, config, action = null, opportunityId = null) {
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
    build: { status, startedAt: startedAt ?? null },
    // The Your site card (#537, option A), new fields only: what the finished build took, the failing QA checks of its
    // last round (check ids), and its home page picture (`demo-preview.js`).
    built: builtOfListed(b),
    // The demo's own mobile PageSpeed, measured once its build completed (`demo-pagespeed.js`): `{score, measuredAt}`,
    // else `{reason}` (`not_measured` while none is kept).
    pagespeed: demoPageSpeedOf(b.built && typeof b.built === 'object' ? b.built.pagespeed : null),
    findings: Array.isArray(b.findings) ? b.findings.slice(0, 10) : [],
    preview:
      b.previewAt && opportunityId
        ? {
            url: `${BASE}/${opportunityId}/demo/preview?v=${Date.parse(b.previewAt)}`,
            capturedAt: new Date(b.previewAt).toISOString()
          }
        : null
  }
}

/** A listed row's latest build without the parts only its `demo` reads (`listedDemo`). */
function latestBuildShape(b) {
  if (!b) return null
  const { built: _built, chain: _chain, findings: _findings, previewAt: _previewAt, ...rest } = b
  return rest
}

/**
 * What a finished build took: the facts kept when its action completed, else (a build finished before they were kept)
 * its own step chain measurement, ended at its start plus its minutes. Null when neither says.
 */
function builtOfListed(b) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  if (b.built && typeof b.built === 'object')
    return { at: b.built.at ?? null, minutes: num(b.built.minutes), usd: num(b.built.usd) }
  const chain = b.chain
  const minutes = num(chain?.minutes)
  if (!b.done || !chain || chain.ending !== 'complete' || minutes === null) return null
  const start = Date.parse(chain.at)
  const usd = num(chain.usd)
  return {
    at: Number.isFinite(start) ? new Date(start + minutes * 60_000).toISOString() : null,
    minutes: Math.round(minutes * 10) / 10,
    usd: usd === null ? null : Math.round(usd * 100) / 100
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
    ...(choice?.quickstartWorkflow === AGENT_DEMO ? { workflow: AGENT_DEMO } : {}),
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
    createdAt: r.created_at,
    ...(r.brief?.edited?.by === 'seller' ? { editedBySeller: true } : {})
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
