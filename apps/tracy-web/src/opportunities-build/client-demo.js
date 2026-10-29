/** Client-submitted demo chat: reserve identity and evidence; never dispatch an agent prompt. */
import { nameHeldOf, siteNameOf } from 'website-opportunities/domain/held-name.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { mintSession } from '../lib/session.js'
import {
  agentDemoCollected,
  agentDemoInventoryPolicy,
  checkedResearch,
  DEMO_CHECKS,
  inventoryRoutes,
  isTemplatePost,
  postCoverage,
  postKey,
  postsWithoutPicture,
  postFactsOf,
  postDraftsOf,
  postTopicNames,
  templatePostTitles,
  templatePostsLeft
} from './agent-demo.js'
import { liveReadinessOf } from './live-readiness.js'
import { deterministicBuildId, readinessOfBuild, suggestedLabel, startBuild, settleBuild } from './builds.js'
import { revisionForAction } from './revisions.js'
import { logoResearchDoor, logoResearchNote } from './logo-research.js'
import { withBuildChoice } from './build-choice.js'
import { buildPlaced, insertBuild, saveBuildLabel } from './build-store.js'
import { deferToMeasure, reusableLookPages } from './demo-look.js'
import { visionLabelOf } from './demo-photo-labels.js'
import { slotPhotoEvidence } from './slot-photo-evidence.js'
import { demoActionOf } from './demo-actions.js'
import { handOff, pictureWorth, poorPicture, videoFrameIds } from './handoff.js'
import { baselineForHost, baselineTrust, briefOf, summary } from './demo-qa.js'
import { planSweep, routePath, siteLocaleOf, sweepOf } from './residue-sweep.js'
import { currentPostRoutes, postMoves } from './post-routes.js'
import { contactOf, pinnedCopy } from 'website-opportunities/domain/pinned-copy.mjs'
import { tradeWords } from 'website-opportunities/domain/trade-words.mjs'
import { isPlaceholderText } from 'website-opportunities/domain/editorial-guide.mjs'
import { neutralWords } from 'website-opportunities/domain/neutral-copy.mjs'
import { checkResearchSourced } from './demo-sourced.js'

/** The research's phone, email, address and website as plain strings, for the sweep's contact swap. */
function contactFacts(brief) {
  const out = {}
  for (const [kind, fact] of Object.entries(contactOf(brief))) if (kind !== 'hours') out[kind] = fact.value
  const site = brief?.business?.website
  if (typeof site === 'string' && site.trim() !== '') out.website = site.trim()
  return out
}
export const CLIENT_DEMO = 'client-send/1'
/** `prepare`'s answer while the demo's logo research may still answer: ask again later (`retryAt`). */
export const LOGO_RESEARCH_PENDING = 'DEMO_LOGO_RESEARCH_PENDING'
const CMS_NAMES = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }
const error = (code, status = 409) => Object.assign(new Error(code), { code, status })

/** How many `tracy_demo check` runs a build has (`agent-demo.js`, where the brief says it too). */
export { DEMO_CHECKS }
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const ended = new Set(['aborted', 'blocked', 'error', 'interrupted', 'max-tokens'])
/** This process: a running check whose row names it but which it no longer runs died with a restart. */
const BOOT = randomUUID()
/**
 * How long the host's QA may read the inventory's routes past its pages (`inventoryRoutes`): the baseline inside the
 * agent's first check, the check inside dsh's 10 min wait beside the look and the sweep.
 */
const BASELINE_ROUTES_MS = 90_000
const CHECK_ROUTES_MS = 150_000
/** How long the look may start batches: every route at `LOOK_PARALLEL` calls at once, inside the same wait. */
const LOOK_MS = 150_000
/**
 * 🔒 THE EYE SEES EVERY PAGE AND A FEW OF EACH SITE'S POSTS (local measure 28/10/2026). A look ran out of `LOOK_MS` on 9 of
 * a Joomla site's 29 pages, 20 of them template posts of one layout, and the next check looked at the same 9 again:
 * `looks-finished` could never pass, and a WordPress build spent $16 of vision on it. Every page is looked at, then
 * `LOOK_POSTS` template posts, those the last look did not see first, so successive checks see different posts; the data
 * checks still read every post. The look's time follows what it looks at, per page, within its bounds.
 */
export const LOOK_POSTS = 2
const LOOK_MS_PER_PAGE = 25_000
const LOOK_MS_MAX = 300_000

/**
 * The pages a look looks at, in order: every page that is not a template post as given, then up to `LOOK_POSTS` posts,
 * those `seen` does not name first. `posts` names the template posts' paths.
 * @param {string[]} pages @param {Set<string>} posts @param {string[]} [seen]
 * @returns {{ pages: string[], postsLeft: number }}
 */
export function lookSample(pages, posts, seen = []) {
  const plain = pages.filter((page) => !posts.has(page))
  const asPost = pages.filter((page) => posts.has(page))
  const ordered = [
    ...asPost.filter((page) => !seen.includes(page)),
    ...asPost.filter((page) => seen.includes(page))
  ]
  const picked = ordered.slice(0, LOOK_POSTS)
  return {
    pages: [...plain, ...asPost.filter((page) => picked.includes(page))],
    postsLeft: asPost.length - picked.length
  }
}
/** A look's time for `n` pages. */
export const lookBudgetMs = (n) => Math.min(LOOK_MS_MAX, Math.max(LOOK_MS, n * LOOK_MS_PER_PAGE))
/** The paths a build's template posts answer at: their frozen routes and where they moved since (`postRoutes`). */
function templatePostPaths(build, postRoutes = []) {
  const records = build.content?.agentDemo?.structure?.inventory?.records ?? []
  const paths = new Set()
  for (const record of records)
    if (isTemplatePost(record, records))
      for (const route of record.routes ?? []) {
        const p = typeof route === 'string' ? route : route?.pattern
        if (typeof p === 'string') paths.add(p)
      }
  for (const moved of postRoutes)
    for (const p of [moved?.was, moved?.route]) if (typeof p === 'string') paths.add(p)
  return paths
}

/** The frozen inventory's routes for one QA run, with the time they may take; nothing without an inventory. */
function qaRoutes(build, routeBudgetMs) {
  const routes = inventoryRoutes(build.content?.agentDemo?.structure?.inventory)
  return routes.length ? { routes, routeBudgetMs } : {}
}

/**
 * 🔒 THE QA READS THE ROUTES THE SITE HAS NOW (product owner, 26/10/2026): a rewritten template post takes a slug
 * from its new title, so its frozen route is the old one. Each template post route is read where the live inventory
 * says the post answers now (`post-routes.js`), every other frozen route as it was; `postRoutes` names each post's
 * old and current route, so the host reports one that answers 404 or cannot be found (`pages-load`).
 * @param {Record<string, any>} build @param {{records?: Array<Record<string, any>>} | null} live
 * @param {string} platform @param {number} routeBudgetMs
 */
function currentQaRoutes(build, live, platform, routeBudgetMs) {
  const frozen = build.content?.agentDemo?.structure?.inventory
  const records = Array.isArray(frozen?.records) ? frozen.records : []
  const moves = postMoves(records, Array.isArray(live?.records) ? live.records : [], platform, (r) =>
    isTemplatePost(r, records)
  )
  const { routes, postRoutes } = currentPostRoutes(inventoryRoutes(frozen), moves)
  return routes.length || postRoutes.length
    ? { routes, routeBudgetMs, ...(postRoutes.length ? { postRoutes } : {}) }
    : {}
}

/** A check running longer than this (on any process) is taken as lost: dsh stops waiting at 10 min. */
const CHECK_STALE_MS = 15 * 60_000
/** The process running a check says so this often; a check silent for CHECK_SILENT_MS lost its process. */
const CHECK_BEAT_MS = 20_000
const CHECK_SILENT_MS = 70_000
/**
 * A check's answer as a jsonb parameter. 🔒 A NUL NEVER REACHES JSONB (local 25/10/2026): the sweep's `shown` keys are
 * `<page>\u0000<words>` (dsh `demo-lifecycle.mjs` splits them there), postgres refuses `\u0000` in jsonb, so the
 * check's save failed unheard and every later status read the check as lost: the demo's check never answered. A
 * stored string reads U+FFFD instead (as `live-sync.js` `noNul`); `doneCheck` keeps the exact answer beside it.
 * @param {unknown} value
 */
const checkJson = (value) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'string' ? v.replaceAll('\0', '\uFFFD') : v))
/**
 * A background check done with its answer: `result` for the readers of the row (`wo-ops.js`), `resultText` the answer
 * exactly as JSON text, NULs escaped inside it, which `check.status` hands back to dsh.
 * @param {Record<string, unknown>} job @param {unknown} result
 */
const doneCheck = (job, result) => ({ ...job, state: 'done', result, resultText: JSON.stringify(result) })
/**
 * The agent's plan with the structure it was checked against. 🔒 `plan.save` KEEPS THE STRUCTURE BESIDE THE PLAN,
 * NEVER IN IT (`agent-demo.js`), so every reader of the template's posts (`templatePostsLeft`, `templatePostTitles`,
 * `postCoverage`) read none from the saved plan: the sweep never dated a post the check did not open (The Living Room
 * local, 25/10/2026: eight posts kept 2021).
 * @param {{plan: Record<string, any>, structure?: unknown}} agentDemo
 */
const checkedPlan = (agentDemo) => ({ ...agentDemo.plan, structure: agentDemo.structure })
/**
 * 🔒 A SWEEP GOES ON WHILE EACH ROUND CLEARS SOMETHING, AND NEVER PAST SWEEP_ROUNDS_MAX (product owner, lrsweep rig
 * round 6, 24/10/2026). Two fixed rounds of at most SWEEP_MAX_CALLS calls left a real ja-diner site with 14 template
 * texts: the cap, not a refusal, was what stopped it. So a round is followed by another as long as the check after it
 * plans fewer calls than the check before it (`planSweep` `left`): a round that clears nothing would plan the same
 * calls again, and stops. The bound keeps one check, which runs inside the agent's turn (each round is a whole-site
 * read, minutes), from running on without end when every round clears a little: 6 rounds of SWEEP_MAX_CALLS clear more
 * than a template site shows (the rig planned ~260, JA Restaurant on WordPress ~830 on 29/10/2026), so reaching it
 * means the sweep is not converging, and it is reported unresolved with what is left, never passed over.
 */
export const SWEEP_ROUNDS_MAX = 6

/**
 * Whether the check just measured answers with its sweep, or is counted as it stands; `stopped` says why a sweep
 * that still plans calls ends (`bound`, `no-progress`). `swept` is the build's `qa.residueSweeps`.
 * @param {{attempt?: number, n?: number, left?: number} | null | undefined} swept
 * @param {number} attempts
 * @param {{left?: number} | null} sweep
 * @returns {{go: boolean, rounds: number, stopped?: 'bound' | 'no-progress'}}
 */
export function sweepDecision(swept, attempts, sweep) {
  const rounds = swept?.attempt === attempts ? (swept.n ?? 0) : 0
  if (!sweep) return { go: false, rounds }
  if (rounds >= SWEEP_ROUNDS_MAX) return { go: false, rounds, stopped: 'bound' }
  if (rounds > 0 && !((sweep.left ?? 0) < (swept?.left ?? Infinity)))
    return { go: false, rounds, stopped: 'no-progress' }
  return { go: true, rounds }
}
/**
 * The look a sweep round carries instead of looking: the last look as it stands, with every page read anew since then
 * (not `reused`) named unlooked and its faults dropped, so a later check keeps only verdicts newer than each page's
 * last change. With no look before, the round is plainly not looked at.
 */
export function lookCarried(last, readPages, reused) {
  const changed = readPages.filter((page) => !reused.has(page))
  if (!last || !last.looked)
    return {
      id: 'looks-finished',
      pass: false,
      looked: false,
      measured: 'not looked at in a sweep round; the check after the sweep looks',
      expected:
        'a vision model saw no visible fault from top to footer on every page at desktop and phone width',
      detail: []
    }
  const unlooked = [
    ...(Array.isArray(last.unlooked) ? last.unlooked : []).filter((u) => !changed.includes(u?.page)),
    ...changed.map((page) => ({ page, why: 'CHANGED_SINCE_LOOK', viewports: ['desktop', 'phone'] }))
  ]
  return {
    ...last,
    pass: false,
    looked: unlooked.length ? 'partly' : true,
    seen: (Array.isArray(last.seen) ? last.seen : []).filter((page) => !changed.includes(page)),
    detail: (Array.isArray(last.detail) ? last.detail : []).filter((f) => !changed.includes(f?.page)),
    unlooked,
    measured: `the last look, carried while the sweep runs; ${changed.length} page(s) read anew since`
  }
}
/**
 * Whether the sweep has the brand writer wear the business's imported logo: a header with no logo of the business
 * (`header-brand` `LOGO_NOT_IN_HEADER`), a CMS whose logo dsh's tools do not set (not WordPress), and not worn
 * already in this build.
 * @param {any[]} checks @param {{platform: string, logo: {url: string} | null, worn?: string | null}} at
 */
export function businessLogoDue(checks, { platform, logo, worn = null }) {
  if (platform === 'wordpress' || !logo || worn === logo.url) return false
  const brand = checks.find((c) => c?.id === 'header-brand')
  return Boolean(brand && !brand.pass && (brand.detail ?? []).some((d) => d?.code === 'LOGO_NOT_IN_HEADER'))
}
/**
 * Whether the next check may keep the last read of every page whose document did not change (`incremental`): after a
 * counted check, and after a sweep round of the current one. A ROUND'S CHECK READS ONLY WHAT THE SWEEP CHANGED
 * (dev 27/10/2026): ja-diner's first check read and looked at the whole site after each of its 6 rounds, ~60 min in
 * one tool call, though each round wrote some pages only. The host fingerprints each page as served and reads again
 * only those whose document changed, so a page the sweep wrote, or one showing a shared part it wrote (a footer, a
 * menu, a post list), is read and looked at anew and every other keeps its last read (`demo-qa-browser.js`). A pass
 * found that way is still confirmed by a full read before it counts (`measure`), so a passing check means what it did.
 * @param {{clientCheckAttempts?: number, residueSweeps?: {attempt?: number, n?: number}} | null | undefined} qa
 */
export function checkIsIncremental(qa) {
  const attempts = qa?.clientCheckAttempts ?? 0
  const swept = qa?.residueSweeps
  return attempts > 0 || (swept?.attempt === attempts && (swept.n ?? 0) > 0)
}
/**
 * The template category names the sweep rounds of the current counted check sent a rename for (`planSweep`
 * `renamedBefore`); a new counted check starts with none.
 * @param {{clientCheckAttempts?: number, residueSweeps?: {attempt?: number, renamed?: string[]}} | null | undefined} qa
 * @returns {string[]}
 */
export function renamedBeforeOf(qa) {
  const swept = qa?.residueSweeps
  return swept?.attempt === (qa?.clientCheckAttempts ?? 0) && Array.isArray(swept.renamed)
    ? swept.renamed
    : []
}
/** A turn record closed this recently may still be reopened by a turn-stopping steer (see `endedUnchecked`). */
const STEER_GRACE_MS = 120_000
const QA_FAILURES = new Set(['DEMO_BASELINE_UNAVAILABLE', 'AGENT_DEMO_ENDED_UNCHECKED'])
const qaFailure = (qa) => (QA_FAILURES.has(qa.reason) ? qa.reason : 'QA_NEEDS_REVIEW')

export function createClientDemoService(deps) {
  const { pool, config, request, loadDomain } = deps
  const now = deps.now ?? Date.now
  const origin = String(config.origin).replace(/\/+$/, '')
  const runningChecks = new Map()
  async function locked(actionId, fn) {
    const lock = await pool.connect()
    try {
      await lock.query('select pg_advisory_lock(hashtextextended($1,0))', [`wo-client-chat:${actionId}`])
      return await fn()
    } finally {
      await lock
        .query('select pg_advisory_unlock(hashtextextended($1,0))', [`wo-client-chat:${actionId}`])
        .catch(() => {})
      lock.release()
    }
  }
  async function load(accountId, actionId) {
    const action = (
      await pool.query('select * from wo_demo_action where account_id=$1 and id=$2', [accountId, actionId])
    ).rows[0]
    if (!action) throw error('NOT_FOUND', 404)
    if (action.selection?.chatMode !== CLIENT_DEMO || action.selection?.workflow !== 'agent-demo/1')
      throw error('DEMO_CHAT_MODE_INVALID')
    if (action.status !== 'queued') throw error('AGENT_DEMO_ACTION_CLOSED')
    const account = (await pool.query('select email from account where id=$1', [accountId])).rows[0]
    if (!account) throw error('NOT_FOUND', 404)
    const cookie = `tracy_sess=${await mintSession(account.email, config.sessionSecret, now())}`
    const build =
      (
        await pool.query('select * from wo_build where account_id=$1 and request_id=$2', [
          accountId,
          action.build_request_id
        ])
      ).rows[0] ?? null
    if (build?.site_key && !(await deps.checkDemoGrant?.(accountId, build.site_key)))
      throw error('AGENT_DEMO_NOT_GRANTED', 403)
    const stored =
      (
        await pool.query('select * from wo_revision where account_id=$1 and id=$2', [
          accountId,
          action.revision_id
        ])
      ).rows[0] ?? null
    // The brief names no template: a build's choice is how this demo reads it (`build-choice.js`).
    const revision = build?.choice ? withBuildChoice(stored, build.choice) : null
    return { action, account, cookie, build, revision }
  }
  function answer(state) {
    const held = state.build.content.agentDemo.clientChat
    const brief = held.briefs[state.action.id]
    if (!brief) throw error('DEMO_CHAT_NOT_PREPARED')
    return {
      chat: {
        siteKey: state.build.site_key,
        sessionId: state.action.session_id,
        href: `/${encodeURIComponent(state.build.site_key)}/s/${encodeURIComponent(state.action.session_id)}`
      },
      brief,
      submission: held.submissions?.[state.action.id] ?? null
    }
  }
  async function prepare({ accountId, actionId }) {
    return locked(actionId, async () => {
      let state = await load(accountId, actionId)
      const domain = await loadDomain()
      if (!state.revision) {
        const made = await (deps.revisionForAction ?? revisionForAction)(pool, {
          action: state.action,
          domain,
          templates: async () => {
            const response = await request('/api/templates', { headers: { origin } })
            const templates = response.ok ? await response.json() : null
            if (!Array.isArray(templates?.templates)) throw error('TEMPLATES_UNREADABLE', 503)
            return templates.templates
          },
          ops: (await deps.runtime()).settings,
          now,
          // 🔒 Asked as the demo's account, through the same door an operator presses (logo-research.js).
          logoResearch: { research: logoResearchDoor({ request, origin, cookie: state.cookie }) },
          pictureLabels: deps.pictureLabels ?? null,
          photoLabelling: deps.photoLabelling ?? null
        })
        // 🔒 Never waited for here: this runs inside HTTP requests (`/v1/demos`). The caller asks again, and the
        // runner's `reconcile` prepares it once the research is done or its minute is over.
        if (made.pending)
          throw Object.assign(error(LOGO_RESEARCH_PENDING), { retryAt: new Date(made.retryAt).toISOString() })
        if (made.error) throw error(made.error)
        state.revision = made.revision
      }
      // A blocked brief claims no site and no chat (#50): the same verdict `startBuild` honours.
      if (!state.build && readinessOfBuild(state.revision, domain)?.verdict === 'block')
        throw error('BRIEF_NOT_READY')
      if (!state.build)
        state.build = (
          await insertBuild(pool, {
            accountId,
            revisionId: state.revision.id,
            requestId: state.action.build_request_id,
            buildId: deterministicBuildId(accountId, state.revision.id, state.action.build_request_id),
            choice: state.revision.build_choice
          })
        ).row
      if (!state.build.label)
        state.build = await saveBuildLabel(
          pool,
          state.build.id,
          state.action.label || (await suggestedLabel({ pool, config, domain, revision: state.revision }))
        )
      const response = await request('/api/sites/claim', {
        method: 'POST',
        headers: { cookie: state.cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: state.revision.cms,
          design: state.revision.template.design,
          quickstart: state.revision.template.quickstart,
          ...(state.revision.template.release
            ? { expectedQuickstartRelease: state.revision.template.release }
            : {}),
          label: state.build.label,
          buildId: state.build.build_id,
          workflow: 'agent-demo/1'
        })
      })
      const claim = await response.json()
      if (
        !response.ok ||
        !claim.siteKey ||
        !String(claim.next ?? '').includes(`/s/${encodeURIComponent(state.action.session_id)}`)
      )
        throw error(claim.code ?? 'DEMO_SESSION_UNAVAILABLE', response.status >= 500 ? 503 : 409)
      const bundle = checkedResearch(state.revision)
      const ownSite = state.action.selection?.ownSite === true
      // A business name the brief holds off the site is named nowhere the agent builds from: its neutral identity is.
      const business = nameHeldOf(state.revision.brief)
        ? (siteNameOf(state.revision.brief) ?? 'this business')
        : (bundle.profile?.name ?? state.revision.brief?.business?.name ?? 'this business')
      // The message a person sees as theirs is one plain sentence, a customer's own site's (`own-site.js`) as a demo's:
      // the steps travel in the research catalogue (`agent-demo.js` `clientSendSteps`), which the `tracy_demo` tool's
      // own description says to read first (tracy-site-tools) — no tool call in the person's words.
      const retry = state.action.retry_of
        ? ' This is a Retry in the same site and chat: read the existing job, plan and import receipts first and reconcile unknown writes rather than starting a duplicate site.'
        : ''
      const text = ownSite
        ? `Build the complete website of ${business} from what Tracy found about it: its real photos, facts and reviews on every page.`
        : `Build a complete demo website for ${business} on ${CMS_NAMES[state.revision.cms] ?? state.revision.cms} from what Tracy found about it: its real photos, facts and reviews on every page.${retry}`
      const prior = state.build.content?.agentDemo ?? {}
      const clientChat = {
        ...prior.clientChat,
        chatMode: CLIENT_DEMO,
        sessionId: state.action.session_id,
        briefs: {
          ...prior.clientChat?.briefs,
          [actionId]: prior.clientChat?.briefs?.[actionId] ?? { text, hash: sha(text) }
        },
        submissions: prior.clientChat?.submissions ?? {},
        preparedAt: prior.clientChat?.preparedAt ?? new Date(now()).toISOString()
      }
      const saved = await pool.query(
        `update wo_build set site_key=$2,content=jsonb_set(coalesce(content,'{}'::jsonb),'{agentDemo}',coalesce(content->'agentDemo','{}'::jsonb)||jsonb_build_object('clientChat',$3::jsonb)),updated_at=now() where id=$1 returning *`,
        [state.build.id, claim.siteKey, JSON.stringify(clientChat)]
      )
      state.build = saved.rows[0]
      return { action: await demoActionOf(pool, accountId, actionId), ...answer(state) }
    })
  }
  async function send({ accountId, actionId, body }) {
    return locked(actionId, async () => {
      const state = await load(accountId, actionId)
      if (!state.build?.content?.agentDemo?.clientChat) throw error('DEMO_CHAT_NOT_PREPARED')
      const view = answer(state)
      if (
        body?.sessionId !== state.action.session_id ||
        body.briefHash !== view.brief.hash ||
        typeof body.nativeRequestId !== 'string' ||
        !/^[A-Za-z0-9_.:-]{1,200}$/.test(body.nativeRequestId)
      )
        throw error('DEMO_SUBMISSION_INVALID')
      const held = state.build.content.agentDemo.clientChat
      if (held.submissions[actionId])
        return { action: await demoActionOf(pool, accountId, actionId), ...view }
      const submission = held.submissions[actionId] ?? {
        nativeRequestId: body.nativeRequestId,
        state: 'reserved',
        at: new Date(now()).toISOString()
      }
      const qa = {
        ...state.build.qa,
        workflow: 'agent-demo/1',
        chatMode: CLIENT_DEMO,
        state: 'client-running',
        sessionId: state.action.session_id,
        by: state.account.email,
        since: new Date(state.action.accepted_at).toISOString(),
        expectedRequestIds: [submission.nativeRequestId],
        clientCheckAttempts: 0,
        rounds: [],
        repairs: 0,
        baselineTries: state.build.qa?.baseline ? state.build.qa.baselineTries : 0,
        baselineError: null,
        machinePassed: false,
        humanAccepted: false,
        reason: null
      }
      // A Retry keeps the untouched baseline, never the previous turn's check job or verdict.
      delete qa.clientCheck
      delete qa.clientChecks
      await pool.query(
        `update wo_build set content=jsonb_set(content,'{agentDemo,clientChat}',$2::jsonb),qa=$3::jsonb where id=$1`,
        [
          state.build.id,
          JSON.stringify({ ...held, submissions: { ...held.submissions, [actionId]: submission } }),
          JSON.stringify(qa)
        ]
      )
      return { action: await demoActionOf(pool, accountId, actionId), ...view, submission }
    })
  }
  /**
   * The demo's site provisioned (`startBuild`, idempotent by the action's request id), asked by the agent's
   * `provision.start` only: 🔒 a chat sent reserves the request, and only the agent's tool inside that real turn
   * installs a site (a reservation whose turn never comes costs no container). Plan "10/10" §7 S4 (26/10/2026) keeps
   * this and moves the wait instead: the brief has the agent start the install first and read the research while it
   * runs (it waited 40–140 s on `provision.wait` doing nothing).
   */
  async function startProvision(state, accountId, proof) {
    const held = await pool.query(
      `update wo_build set content=jsonb_set(content,'{agentDemo,clientChat,provisionRequested}',$2::jsonb)
      where id=$1 and exists(select 1 from wo_demo_action where id=$3 and status='queued') returning id`,
      [state.build.id, JSON.stringify(proof), state.action.id]
    )
    if (!held.rowCount) throw error('AGENT_DEMO_ACTION_CLOSED')
    const result = await startBuild({
      pool,
      request,
      origin,
      cookie: state.cookie,
      domain: await loadDomain(),
      config,
      accountId,
      revision: state.revision,
      requestId: state.action.build_request_id,
      label: state.build.label,
      demoActionId: state.action.id
    })
    if (result.status >= 300) throw error(result.body.code ?? 'PROVISION_FAILED')
    return result
  }
  async function stopped(state) {
    const expected =
      state.build?.content?.agentDemo?.clientChat?.submissions?.[state.action.id]?.nativeRequestId
    if (!expected) return null
    return (
      (
        await pool.query(
          `select coalesce(end_reason, 'lost') as end_reason from site_turn
      where site_key=$1 and session_id=$2 and rpc_id=any($3::text[])
      and ((state in ('closed','stale') and end_reason in ('aborted','blocked','error','interrupted','max-tokens'))
        or (state = 'stale' and end_reason is null)) order by opened_at desc limit 1`,
          [state.build.site_key, state.action.session_id, state.build.qa?.expectedRequestIds ?? [expected]]
        )
      ).rows[0]?.end_reason ?? null
    )
  }
  /**
   * 🔒 A STALE TURN IS LOST, NOT FAILED (27/10/2026): the reaper marks a turn stale when its dsh stopped reporting past
   * the turn's bound, and it records no end reason. The action fails as AGENT_DEMO_TURN_LOST so Retry appears, and no
   * cause is invented for it.
   */
  async function stopCode(state) {
    const reason = await stopped(state)
    if (reason === 'lost') return 'AGENT_DEMO_TURN_LOST'
    return ended.has(reason) ? 'AGENT_DEMO_TURN_STOPPED' : null
  }
  async function throwIfStopped(state) {
    const stop = await stopCode(state)
    if (stop) throw error(stop)
  }
  /**
   * 🔒 A TURN THAT ENDED WITHOUT A PASSING CHECK ENDS THE BUILD (HideOut 41cfe7d9, 24/10/2026): the agent closed its
   * turn `completed` after one failed check and the job read "fill" until the 2 h timeout. Its last expected turn
   * closed normally, no turn of the chat is open (an owner follow-up keeps it) and no check still runs.
   *
   * 🔒 …AND STAYED CLOSED (Levain local round 18, 25/10/2026): tracy-site-tabs closes the turn record when the agent
   * stops, before a turn-stopping steer (the visual check, `checkAgainStep`) sends it on and reopens the record. A poll
   * in those seconds failed a build whose agent was still writing, and every later write was AGENT_DEMO_ACTION_CLOSED.
   * A steer lands within the visual check's 30 s budget, so a close younger than `STEER_GRACE_MS` is not an end yet.
   */
  async function endedUnchecked(state) {
    const qa = state.build?.qa
    if (!qa?.expectedRequestIds?.length || qa.machinePassed || qa.state === 'failed') return false
    if (qa.clientCheck?.state === 'running' && !checkLost(qa.clientCheck)) return false
    const turns = (
      await pool.query(
        `select state,end_reason,rpc_id,closed_at <= now() - make_interval(secs => $3) as settled
      from site_turn where site_key=$1 and session_id=$2 order by opened_at desc`,
        [state.build.site_key, state.action.session_id, STEER_GRACE_MS / 1000]
      )
    ).rows
    if (turns.some((t) => t.state === 'open')) return false
    const last = turns.find((t) => qa.expectedRequestIds.includes(t.rpc_id))
    return last?.state === 'closed' && last.end_reason === 'completed' && last.settled === true
  }
  async function reconcile(action) {
    const state = await load(action.account_id, action.id)
    const stop = await stopCode(state)
    if (stop) return { terminal: true, state: 'failed', error: stop }
    // 🔒 A demo whose brief waits for its logo research is prepared here once that is settled, so its build starts
    // whether or not anyone reads the demo again (logo-research.js). Before the Retry guard below: an action with no
    // build has sent no brief yet, so that guard would return first and the build would never start.
    if (!state.build && state.action.selection?.logoResearch?.state === 'requested')
      await prepare({ accountId: action.account_id, actionId: action.id }).catch((failure) => {
        if (failure?.code !== LOGO_RESEARCH_PENDING)
          (deps.log ?? console).warn(
            `client demo ${action.id} not prepared after its logo research: ${failure?.code ?? failure}`
          )
      })
    /**
     * 🔒 A RETRY STARTS CLEAN (27/10/2026): a Retry reuses its build, which still carries the previous attempt's
     * check, turns and provision until this action's own brief is sent (`send` writes a fresh `qa`). Nothing on the
     * build speaks for this action before then, and a provision failure speaks for it only when it started it.
     */
    if (!state.build?.content?.agentDemo?.clientChat?.submissions?.[state.action.id])
      return { state: 'awaiting-agent', step: state.build ? 'build' : 'brief' }
    if (await endedUnchecked(state)) {
      // Written only while this action is still the live one: a worker that outlived a Retry leaves the build alone.
      await pool.query(
        `update wo_build set qa=qa||'{"state":"failed","reason":"AGENT_DEMO_ENDED_UNCHECKED"}'::jsonb
      where id=$1 and exists (select 1 from wo_demo_action where id=$2 and status='queued')`,
        [state.build.id, state.action.id]
      )
      return { terminal: true, state: 'failed', error: 'AGENT_DEMO_ENDED_UNCHECKED' }
    }
    // 🔒 AN EARLIER ACTION'S VERDICT IS NOT ITS RETRY'S (The Living Room local, 25/10/2026): the build's QA still read
    // the turn that ended unchecked, so the Retry closed with QA_NEEDS_REVIEW before its chat could be prepared, and
    // the demo could never go again. `send` stamps `qa.since` with the sending action's `accepted_at`, so a verdict
    // older than this Retry is the earlier action's and ends neither rule below (`send` resets QA).
    const earlier = (qa) =>
      Boolean(
        action.retry_of && qa?.since && new Date(action.accepted_at).getTime() > new Date(qa.since).getTime()
      )
    // A failed check ends the action even before any provision job exists (27/10/2026).
    if (state.build?.qa?.state === 'failed' && !earlier(state.build.qa))
      return { terminal: true, state: 'failed', error: qaFailure(state.build.qa) }
    if (!state.build?.site_job_id) return { state: 'awaiting-agent', step: state.build ? 'build' : 'brief' }
    const build = await settleBuild({ pool, request, origin, cookie: state.cookie, build: state.build })
    if (
      build.state === 'deleted' ||
      (['failed', 'refused'].includes(build.state) && build.receipt?.demoActionId === state.action.id)
    )
      return { terminal: true, state: 'failed', error: build.receipt?.failure?.code ?? 'PROVISION_FAILED' }
    if (['failed', 'refused'].includes(build.state)) return { state: 'awaiting-agent', step: 'build' }
    if (build.qa?.state === 'failed' && !earlier(build.qa))
      return {
        terminal: true,
        state: 'failed',
        error: qaFailure(build.qa)
      }
    if (build.qa?.machinePassed && build.qa?.state === 'needs-review')
      return { terminal: true, state: 'completed', step: 'check' }
    return {
      state: build.state,
      step: build.state === 'done' ? (build.qa?.baseline ? 'fill' : 'check') : 'build'
    }
  }
  /**
   * 🔒 AN UNREAD STARTING INVENTORY IS A BASELINE TRY (Bebop 4d53fccd, 24/10/2026): every read hit the inventory's
   * time cap, `baselineTries` stayed 0, the agent read again forever and told the person to create a new site.
   */
  async function inventoryFailed(state, body) {
    const tries = (state.build.qa?.baselineTries ?? 0) + 1
    const last = tries >= 3
    await pool.query(
      `update wo_build set qa=qa||$2::jsonb where id=$1 and coalesce(jsonb_typeof(qa->'baseline'),'null')='null'`,
      [
        state.build.id,
        JSON.stringify({
          baselineTries: tries,
          baselineError: body.code,
          ...(last ? { state: 'failed', reason: 'DEMO_BASELINE_UNAVAILABLE' } : {})
        })
      ]
    )
    return {
      ready: false,
      state: last ? 'failed' : 'baseline-unavailable',
      code: last ? 'DEMO_BASELINE_UNAVAILABLE' : body.code,
      message: last
        ? 'Tracy could not read the site’s starting content in time, three times. The build stops here for a person to look at; tell the person and do not create a new site.'
        : `${body.code === 'AGENT_DEMO_INVENTORY_LIMIT' ? 'The site is too large to read in time' : 'Tracy could not read the site’s content just now'}; try again later with provision.status. Keep working on this site; do not create a new site.`,
      detail: body
    }
  }
  async function ready(state) {
    if (state.build.state !== 'done')
      return { ready: false, state: state.build.state, jobId: state.build.site_job_id }
    if (state.build.qa?.baseline && state.build.content?.agentDemo?.structureHash)
      return { ready: true, state: 'ready', structureHash: state.build.content.agentDemo.structureHash }
    if ((state.build.qa?.baselineTries ?? 0) >= 3)
      return { ready: false, state: 'failed', code: 'DEMO_BASELINE_UNAVAILABLE' }
    const domain = await loadDomain()
    const result = await handOff({
      pool,
      request,
      origin,
      cookie: state.cookie,
      domain,
      build: state.build,
      revision: state.revision,
      objects: deps.objects,
      readNativeInventory: deps.readNativeInventory,
      email: state.account.email
    })
    if (result.status >= 300 && String(result.body.code).startsWith('AGENT_DEMO_INVENTORY_'))
      return inventoryFailed(state, result.body)
    if (result.status >= 300) return { ready: false, code: result.body.code, detail: result.body }
    const site = (await pool.query('select * from site where site_key=$1', [state.build.site_key])).rows[0]
    await throwIfStopped(state)
    const resultQa = await deps.demoQa(site, {
      pages: ['/'],
      discover: true,
      // Every route's template words and pictures, so the checks after know them on every route.
      ...qaRoutes(state.build, BASELINE_ROUTES_MS),
      ...briefOf(state.revision)
    })
    const trust = baselineTrust(resultQa)
    const qa = {
      ...state.build.qa,
      state: !trust.ok && (state.build.qa?.baselineTries ?? 0) >= 2 ? 'failed' : 'client-running',
      baselineTries: (state.build.qa?.baselineTries ?? 0) + 1,
      ...(trust.ok
        ? { baseline: resultQa.body.baseline, baselineChecks: resultQa.body.checks ?? [] }
        : { baselineError: trust.why })
    }
    await pool.query(
      `update wo_build set qa=$2::jsonb where id=$1 and coalesce(jsonb_typeof(qa->'baseline'),'null')='null'`,
      [state.build.id, JSON.stringify(qa)]
    )
    return {
      ready: trust.ok,
      state: trust.ok ? 'ready' : 'baseline-unavailable',
      ...(trust.ok
        ? {}
        : { reason: trust.why, ...(qa.state === 'failed' ? { code: 'DEMO_BASELINE_UNAVAILABLE' } : {}) })
    }
  }
  async function operation(auth, params, { build, signal = null }) {
    if (params.operation === 'check.status') return checkStatus(build)
    return locked(build.action_id, async () => {
      const state = await load(auth.accountId, build.action_id)
      if (auth.siteKey !== state.build.site_key || auth.sessionId !== state.action.session_id)
        throw error('AGENT_DEMO_NOT_GRANTED')
      await throwIfStopped(state)
      if (params.operation === 'provision.start') {
        const result = await startProvision(state, auth.accountId, {
          actionId: state.action.id,
          nativeRequestId: build.current_rpc_id,
          turnId: auth.turnId,
          at: new Date(now()).toISOString()
        })
        return {
          ok: true,
          state: result.body.build.state,
          siteKey: state.build.site_key,
          jobId: result.body.build.site_job_id
        }
      }
      state.build = await settleBuild({ pool, request, origin, cookie: state.cookie, build: state.build })
      if (params.operation === 'provision.status')
        return { ok: true, ...(await ready(state)), jobId: state.build.site_job_id }
      // `sweepBatches`: the dsh sends a page's sweep words as one call and sets a refused pair aside (`planSweep`).
      const sweep = { batches: params.sweepBatches === true }
      if (params.operation === 'check.start') return checkStart(auth, state, sweep)
      if (params.operation !== 'check') throw error('AGENT_DEMO_BAD_OPERATION')
      checkAllowed(state)
      const outcome = await measure(auth, state, sweep)
      await throwIfStopped(state)
      // 🔒 A CHECK NOBODY HEARD IS NOT COUNTED (pilot 24/10/2026): the agent's call gave up waiting at its
      // timeout while this check ran on, so it was counted, the agent called again, and three counted checks
      // left it one answer. A caller gone before the result is saved costs no attempt. (An older dsh's road;
      // a current one starts the check and polls it, `check.start`.)
      if (signal?.aborted) throw error('AGENT_DEMO_CHECK_UNHEARD')
      return { ok: true, ...(await settle(state, outcome)) }
    })
  }
  function checkAllowed(state) {
    if ((state.build.qa?.clientCheckAttempts ?? 0) >= DEMO_CHECKS) throw error('DEMO_CHECK_BUDGET_EXHAUSTED')
    if (!state.build.qa?.baseline || !state.build.content?.agentDemo?.plan)
      throw error('AGENT_DEMO_PLAN_REQUIRED')
  }
  /** Each photo of the build's research by its subject, where a label says it; never fails a check run. */
  async function sourceSubjectsOf(pool, state) {
    try {
      const rows = await buildPlaced(pool, state.build.account_id, state.revision)
      return Object.fromEntries(
        rows
          .map((row) => [row.id, visionLabelOf(row)?.subject])
          .filter(([, subject]) => typeof subject === 'string')
      )
    } catch {
      return {}
    }
  }
  /** Reads, shoots and looks at the site: minutes on a whole site. Saves nothing. */
  /**
   * One check of the site: incremental after the first and after a sweep round (pages whose document did not change
   * keep their last read, plan "10/10" §7 S6; `checkIsIncremental`), and a pass found that way is confirmed by a full
   * read before it counts — the last check that passes a build has read every page anew (council 26/10/2026).
   * 🔒 A KEPT READ IS NEVER THE EVIDENCE FOR A COUNTED FAILURE (review 27/10/2026): a page's fingerprint is its
   * document as loaded, before lazy content scrolls in, and the look keeps the last look's faults on kept pages
   * (`keptLook`), so an incremental check can fail on what a write already changed. A failing incremental check that
   * would be counted (no sweep round follows it, `sweepDecision`) is read again in full, and that read is the answer;
   * one a sweep round follows costs no attempt and is measured again after the round.
   */
  async function measure(auth, state, sweep = {}) {
    const incremental = checkIsIncremental(state.build.qa)
    // 🔒 AN INCREMENTAL READ LEAVES THE LOOK TO THE FULL ONE (29/10/2026): its look is never the answer — a pass is
    // confirmed by a full read, a counted failure is read again in full, and a round that sweeps is not looked at — so
    // a WordPress check looked twice, ~190 s each. The verdicts are the same; the full read looks.
    const first = await measureOnce(auth, state, incremental, { ...sweep, look: !incremental })
    if (!incremental) return first
    const attempts = state.build.qa?.clientCheckAttempts ?? 0
    if (!first.pass && sweepDecision(state.build.qa?.residueSweeps, attempts, first.sweep).go) return first
    return measureOnce(auth, state, false, sweep)
  }
  async function measureOnce(auth, state, incremental, { batches = false, look = true } = {}) {
    const started = now()
    const site = (await pool.query('select * from site where site_key=$1', [state.build.site_key])).rows[0]
    // 🔒 The live records first: the QA reads each template post where it answers now (`currentQaRoutes`), and a
    // rewritten post takes a slug from its new title. The photo labels are read beside them (plan "10/10" §7 S3).
    const [inventory, sourceSubjects] = await Promise.all([
      deps.readNativeInventory({
        site,
        email: state.account.email,
        structure: state.build.content.agentDemo.structure
      }),
      sourceSubjectsOf(pool, state)
    ])
    const inventoryAt = now()
    const structure = deps.compareNativeInventory(
      state.build.content.agentDemo.structure.inventory,
      inventory,
      agentDemoInventoryPolicy(state.revision, site.platform)
    )
    // The business's own logo where the research found one; else its name, drawn as a wordmark in the theme's type.
    const logo = importedLogo(state.build, state.revision.brief?.brand)
    // 🔒 No wordmark of a business name the brief holds off the site: its neutral identity instead (`held-name.mjs`).
    const name = nameHeldOf(state.revision.brief)
      ? siteNameOf(state.revision.brief)
      : (checkedResearch(state.revision).profile?.name ?? state.revision.brief?.business?.name)
    const routesNow = currentQaRoutes(state.build, inventory, site.platform, CHECK_ROUTES_MS)
    const measured = await deps.demoQa(site, {
      pages: ['/'],
      discover: true,
      incremental,
      baseline: baselineForHost(state.build.qa.baseline),
      ...routesNow,
      ...briefOf(state.revision),
      ...(!logo && typeof name === 'string' && name.trim() ? { wordmark: name.trim() } : {}),
      // The business's own logo, laid in the template logo's box by the page reader (`fittedLogo`).
      ...(logo ? { logoPicture: logo.url } : {}),
      // …and worn by the sweep's brand writer, under that writer's own file name (`businessLogoDue`).
      ...(logo && state.build.qa?.brandLogoWorn === logo.url ? { logoWorn: true } : {}),
      // A heading repeating a template post's title is residue the sweep plans, not the page's frame.
      templateTitles: templatePostTitles(checkedPlan(state.build.content.agentDemo)),
      // `collected-used`: everything the research collected is on the site, not only nothing false.
      ...agentDemoCollected(state.revision, state.build),
      // `photos-fit`: what each photo shows, from the labels `media.look` made (`demo-photo-labels.js`).
      sourceSubjects,
      // `photos-match-slots`, `faces-named`: each placed photo's slot and what the brief says it shows (#140).
      ...slotPhotoEvidence(state.revision, state.build)
    })
    const readAt = now()
    if (!measured.ok || !Array.isArray(measured.body?.checks)) throw error('DEMO_QA_UNAVAILABLE')
    const readPages = [
      ...(Array.isArray(measured.body.pages) ? measured.body.pages : ['/']),
      ...(Array.isArray(measured.body.routes) ? measured.body.routes : [])
    ]
    const reused =
      incremental && Array.isArray(measured.body.reused) ? new Set(measured.body.reused) : new Set()
    const lastLook = incremental
      ? (state.build.qa?.clientCheck?.result?.checks ?? []).find((c) => c?.id === 'looks-finished')
      : null
    const sourced = checkResearchSourced(state.build.content.agentDemo.structure.inventory, inventory, {
      research: checkedResearch(state.revision),
      business: state.revision.brief?.business ?? null
    })
    // Each template picture named with the record (and WordPress block) that holds it.
    const read = deps.picturesWhere
      ? deps.picturesWhere(measured.body.checks, inventory)
      : measured.body.checks
    // Words the host measured over a photo are judged by that measure, never also by the look (`deferToMeasure`).
    const contrast = read.find((c) => c?.id === 'contrast-readable')
    const head = [
      ...read,
      structure,
      sourced,
      // A post counts as written by what its page shows, on every route QA read.
      postsWritten(checkedPlan(state.build.content.agentDemo), checkedResearch(state.revision), {
        checks: read,
        read: [
          ...(Array.isArray(measured.body.pages) ? measured.body.pages : []),
          ...(Array.isArray(measured.body.routes) ? measured.body.routes : [])
        ],
        records: Array.isArray(inventory?.records) ? inventory.records : []
      })
    ]
    // The look's verdict (`looks-finished`) goes after these, once the sweep is planned (below).
    const checks = [...head, ...[logoResearchNote(state.action.selection?.logoResearch)].filter(Boolean)]
    const records = Array.isArray(inventory?.records) ? inventory.records : []
    const plan = planSweep(measured.body.residue ?? null, {
      // A template post's date becomes the build day.
      buildDate: new Date(state.build.created_at ?? now()).toISOString().slice(0, 10),
      platform: site.platform,
      inventory: records,
      contactPath: contactPathOf(records),
      // A link written with the site's own address is a link to one of its pages.
      ...(URL.canParse(site.address ?? '') ? { origin: new URL(site.address).origin } : {}),
      // A template picture becomes one of the business's own the build imported.
      pictures: sweepPicturesOf(checks),
      // The template pictures the QA passed as the theme's design: named, unresolved, until the owner decides.
      design: checks.find((check) => check.id === 'no-demo-pictures')?.unresolved ?? [],
      // A template category the page still names takes a name from the written posts' research topics.
      categories: templateCategoriesOf(checks),
      // …and one an earlier round of this counted check sent a rename for, still shown, is reported, not sent again.
      renamedBefore: renamedBeforeOf(state.build.qa),
      topicNames: postTopicNames(checkedPlan(state.build.content.agentDemo), checkedResearch(state.revision)),
      // The logo is the logo's, never a photo laid in a picture's place.
      media: importedMedia(state.build, checkedResearch(state.revision)).filter((m) => m.url !== logo?.url),
      // Every template post, not only the one the check opens, with the fields the agent's plan wrote on it.
      templatePosts: templatePostsLeft(checkedPlan(state.build.content.agentDemo)),
      logo,
      fittedLogo: measured.body.fittedLogo ?? null,
      wordmark: measured.body.wordmark ? { ...measured.body.wordmark, name } : null,
      // A page lead the agent's write missed takes the research's own line (`planSweep`).
      leadLine: pinnedCopy(state.revision.brief ?? {})['hero.lead']?.value ?? null,
      // A post body left as the template's takes its own material and the research facts related to it.
      postFacts: postFactsOf(checkedResearch(state.revision)),
      // A template post the agent left takes a post written from the next research topic, never "Coming soon".
      postDrafts: postDraftsOf(checkedPlan(state.build.content.agentDemo), checkedResearch(state.revision)),
      // A template dish's neutral name speaks of what the business offers (`placeholderFor`).
      itemKind: tradeWords(state.revision.brief?.business?.trade).itemKind,
      // …in the site's language, the one the build wrote its slot fills in.
      locale: siteLocaleOf(state.build),
      // A short heading naming the template's business takes the business's name (`planSweep`).
      name: typeof name === 'string' ? name : null,
      // A template's own address, phone, email or website takes the research's (`planSweep`).
      contact: contactFacts(state.revision.brief ?? {}),
      // A lead or a description is the agent's to write while counted checks remain after this one.
      checksLeft: Math.max(0, DEMO_CHECKS - (state.build.qa?.clientCheckAttempts ?? 0) - 1),
      // The term descriptions are read and cleared once a build (`planSweep`).
      sweepTerms: state.build.qa?.residueSweeps?.terms !== true,
      batches
    })
    const thin = leadsThin(Math.max(plan.thinLeads ?? 0, state.build.qa?.residueSweeps?.thinLeads ?? 0))
    if (thin) checks.push(thin)
    // 🔒 THE BUSINESS'S OWN LOGO IS WORN BY THE BRAND WRITER TOO (local measure 28/10/2026): a Joomla T4 header keeps its
    // logo in the template's site settings, the agent's tool has no door to them, and every check of a Death & Co
    // build named the Fresco logo in all seven headers. Where the header shows no logo of the business and the build
    // imported it, the sweep has the brand writer wear it as it wears a drawn wordmark (`wornLogo`), once a build.
    const logoCall = businessLogoDue(read, {
      platform: site.platform,
      logo,
      worn: state.build.qa?.brandLogoWorn
    })
      ? await businessLogoCall(state, logo)
      : null
    if (logoCall) plan.calls = [...plan.calls, logoCall]
    const worn = await wornLogo(plan, {
      platform: site?.platform,
      wear: deps.wearLogo ? (input) => deps.wearLogo(state.build, site, input) : null,
      now
    })
    if (
      logoCall &&
      !worn.calls.includes(logoCall) &&
      !worn.unresolved?.some((u) => u.file === logoCall.params.find)
    )
      await pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
        state.build.id,
        JSON.stringify({ brandLogoWorn: logo.url })
      ])
    const sweep = sweepOf(worn)
    const lookStarted = now()
    // 🔒 A ROUND THAT SWEEPS IS NOT LOOKED AT (28/10/2026). Its answer is the sweep's calls and is not counted; dsh runs
    // them and checks again, and that check looks. A look here (up to `LOOK_MS_MAX`, every page at both widths) was thrown
    // away, up to six times in one check. The last look is carried instead, every page read anew since it named
    // unlooked, so no later check keeps a verdict on a page that changed after it was looked at (`lookCarried`).
    const sweeping = sweepDecision(
      state.build.qa?.residueSweeps,
      state.build.qa?.clientCheckAttempts ?? 0,
      sweep
    ).go
    // What a visitor sees: the pages the QA read, shot at both widths and looked at (`demo-look.js`). In an incremental
    // check a page whose document did not change keeps the faults the last look found on it (plan "10/10" §7 S6).
    let kept = []
    let fresh = []
    let judged = null
    if (sweeping || !look) judged = lookCarried(lastLook, readPages, reused)
    else {
      kept = reusableLookPages(lastLook, readPages, reused)
      const sample = lookSample(
        readPages.filter((p) => !kept.includes(p)),
        templatePostPaths(state.build, routesNow.postRoutes),
        Array.isArray(lastLook?.seen) ? lastLook.seen : []
      )
      fresh = sample.pages
      const lookNow = deps.demoLook
        ? await deps.demoLook(site, {
            pages: fresh.length ? fresh : ['/'],
            accountId: auth.accountId,
            opportunityId: state.action.opportunity_id,
            budgetMs: lookBudgetMs(fresh.length || 1),
            buildId: state.build.id,
            // The words a card with no source keeps (`neutralNote`), in English and in the site's language.
            neutral: [...new Set([...neutralWords('en'), ...neutralWords(siteLocaleOf(state.build))])]
          })
        : null
      const look = lookNow && kept.length ? keptLook(lookNow, lastLook, kept) : lookNow
      judged = look ? deferToMeasure(look, contrast?.measuredOver) : null
      if (judged && sample.postsLeft > 0)
        judged = {
          ...judged,
          measured: `${judged.measured}; ${sample.postsLeft} more template posts left to the data checks (the eye sees ${LOOK_POSTS} a check)`
        }
    }
    if (judged) checks.splice(head.length, 0, judged)
    // Where a check's minutes go, one line per check (28/10/2026: nothing said it before).
    const secs = (ms) => (ms / 1000).toFixed(1)
    console.info(
      `[demo-check] ${site.site_key} ${incremental ? 'incremental' : 'full'}${sweeping ? ' sweep round' : ''}: inventory ${secs(inventoryAt - started)}s, page reads ${secs(readAt - inventoryAt)}s (${readPages.length} page(s), ${reused.size} unchanged), ${sweeping ? 'look skipped' : !look ? 'look left to the full read' : `look ${secs(now() - lookStarted)}s (${fresh.length} page(s) looked at, ${kept.length} kept)`}`
    )
    return {
      checks: checksForAgent(checks),
      pass: checks.length > 0 && checks.every((check) => check.pass === true && !check.skipped),
      sweep,
      // What a sweep with no call to run still names unresolved (a slot the replace job refuses to empty, a linked
      // title with no sourced words): kept on the check's answer, so the QA lists it (`sweepUnresolvedOf`).
      unswept: worn.calls.length === 0 ? worn.unresolved : []
    }
  }
  /**
   * The sweep's call that has the brand writer wear the business's logo: only when `header-brand` found a header with
   * no logo of the business, and the logo's bytes are the research's own; null otherwise.
   */
  async function businessLogoCall(state, logo) {
    const id = state.revision.brief?.brand?.logo
    if (typeof id !== 'string' || !deps.objects) return null
    try {
      const row = (await buildPlaced(pool, state.build.account_id, state.revision)).find((r) => r.id === id)
      const stored = row?.object_key ? await deps.objects.get(row.object_key) : null
      if (!stored?.ok) return null
      const bytes = Buffer.from(await stored.arrayBuffer())
      return { action: 'logo', params: { png: bytes.toString('base64'), path: '/', find: logo.url } }
    } catch {
      return null
    }
  }
  /** This look with the faults the last look found on the pages kept unchanged (`kept`), judged as one. */
  function keptLook(now, last, kept) {
    const carried = (Array.isArray(last?.detail) ? last.detail : []).filter((f) => kept.includes(f?.page))
    const detail = [...(Array.isArray(now.detail) ? now.detail : []), ...carried]
    return {
      ...now,
      pass: now.pass === true && carried.length === 0,
      detail,
      kept,
      seen: [...new Set([...(Array.isArray(now.seen) ? now.seen : []), ...kept])],
      measured: `${now.measured ?? ''}; ${kept.length} unchanged pages keep the last look (${carried.length} faults)`
    }
  }
  /**
   * 🔒 RESIDUE THE SWEEP CLEARS COSTS NO ATTEMPT (product owner, 24/10/2026). A check that found template words,
   * prices, dates or links the sweep replaces answers with the sweep's calls instead of being counted, whatever else
   * failed; dsh runs them and checks again (`demo-lifecycle.mjs`). Rounds go on while each clears something, up to
   * {@link SWEEP_ROUNDS_MAX} per counted check (`sweepDecision`), so a sweep that stops clearing ends in a counted
   * check the agent repairs, its stop reported unresolved.
   */
  async function settle(state, outcome, job = null) {
    const attempts = state.build.qa?.clientCheckAttempts ?? 0
    const swept = state.build.qa?.residueSweeps
    const { go, rounds, stopped } = sweepDecision(swept, attempts, outcome.sweep)
    if (!go)
      return saveCheck(
        state,
        outcome.checks,
        outcome.pass,
        job,
        stopped
          ? sweepStopped(outcome.sweep, stopped, rounds)
          : outcome.unswept?.length > 0
            ? { calls: [], unresolved: outcome.unswept, shown: [] }
            : null
      )
    const result = {
      pass: false,
      needsReview: false,
      checks: outcome.checks,
      sweep: {
        calls: outcome.sweep.calls,
        unresolved: outcome.sweep.unresolved,
        shown: outcome.sweep.shown ?? []
      }
    }
    await pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
      state.build.id,
      checkJson({
        residueSweeps: {
          attempt: attempts,
          n: rounds + 1,
          left: outcome.sweep.left ?? 0,
          // Kept past the round that wrote the placeholder, so the check that passes still says so.
          thinLeads: Math.max(swept?.thinLeads ?? 0, outcome.sweep.thinLeads ?? 0),
          terms: swept?.terms === true || outcome.sweep.calls.some((call) => call.action === 'terms'),
          renamed: [...new Set([...renamedBeforeOf(state.build.qa), ...(outcome.sweep.renamed ?? [])])]
        },
        ...(job ? { clientCheck: doneCheck(job, result) } : {})
      })
    ])
    return result
  }
  /** Counts one check and keeps its answer; `job` also marks the background check `id` done with it. */
  async function saveCheck(state, checks, pass, job = null, sweep = null) {
    const attempts = state.build.qa?.clientCheckAttempts ?? 0
    const result = { pass, needsReview: pass, checks, ...(sweep ? { sweep } : {}) }
    // Counted as the server QA counts its rounds, so every reader of `qa.rounds`/`qa.repairs` sees the checks.
    const rounds = state.build.qa?.rounds ?? []
    const repaired = attempts > 0 && state.build.qa?.machinePassed === false
    const live = liveReadinessOf(state.revision?.brief?.readiness, checks)
    await pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
      state.build.id,
      checkJson({
        state: pass ? 'needs-review' : attempts >= DEMO_CHECKS - 1 ? 'failed' : 'client-running',
        clientCheckAttempts: attempts + 1,
        rounds: [
          ...rounds,
          {
            n: rounds.length + 1,
            at: new Date(now()).toISOString(),
            checks: summary(checks),
            failed: checks.filter((c) => !c.pass && !c.skipped),
            ...(sweep?.stopped ? { sweepStopped: sweep.stopped } : {}),
            // What the live site shows of the brief (#50, `live-readiness.js`).
            ...(live ? { readiness: live } : {})
          }
        ],
        repairs: (state.build.qa?.repairs ?? 0) + (repaired ? 1 : 0),
        machinePassed: pass,
        humanAccepted: false,
        clientChecks: checks,
        ...(job ? { clientCheck: doneCheck(job, result) } : {})
      })
    ])
    return result
  }
  /**
   * 🔒 THE CHECK RUNS ON HERE, ITS CALLER POLLS (dev 24/10/2026). dsh reaches the Apply door through the
   * public origin, and Cloudflare cuts a request at ~100 s (524) while a whole site's check runs minutes:
   * every check was cut, and the unheard rule above then dropped its result, so a demo never finished.
   * `check.start` answers at once with the running check (a second start joins it, never runs another);
   * `check.status` reads it. Its row (`qa.clientCheck`) is the truth, kept alive by its process's beat
   * (any replica reads it); one whose process restarted reads as lost, uncounted, and the next start runs
   * a new one. A result is counted once, when it is saved, heard or not.
   */
  async function checkStart(auth, state, sweep = {}) {
    const job = state.build.qa?.clientCheck
    if (job?.state === 'running' && !checkLost(job)) return { ok: true, running: true, checkId: job.id }
    checkAllowed(state)
    const started = {
      id: randomUUID(),
      state: 'running',
      runner: BOOT,
      startedAt: new Date(now()).toISOString()
    }
    await pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
      state.build.id,
      JSON.stringify({ clientCheck: started })
    ])
    const run = runCheck(auth, state, started, sweep).finally(() => runningChecks.delete(started.id))
    runningChecks.set(started.id, run)
    return { ok: true, running: true, checkId: started.id }
  }
  async function runCheck(auth, state, job, sweep = {}) {
    const beat = setInterval(() => {
      pool
        .query(
          `update wo_build set qa=jsonb_set(qa,'{clientCheck,beatAt}',to_jsonb($2::text)) where id=$1 and qa->'clientCheck'->>'id'=$3`,
          [state.build.id, new Date(now()).toISOString(), job.id]
        )
        .catch(() => {})
    }, CHECK_BEAT_MS)
    beat.unref?.()
    let outcome
    try {
      outcome = await measure(auth, state, sweep)
    } catch (failure) {
      outcome = { code: failure.code ?? 'DEMO_QA_UNAVAILABLE' }
    } finally {
      clearInterval(beat)
    }
    try {
      await locked(state.build.action_id, async () => {
        const fresh = (await pool.query('select * from wo_build where id=$1', [state.build.id])).rows[0]
        if (fresh?.qa?.clientCheck?.id !== job.id) return
        const code = outcome.code ?? (await stopCode(state))
        if (code) {
          await pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
            state.build.id,
            checkJson({ clientCheck: { ...job, state: 'error', code } })
          ])
          return
        }
        await settle({ ...state, build: fresh }, outcome, job)
      })
    } catch (failure) {
      ;(deps.log ?? console).warn(`client demo check ${job.id} not saved: ${failure.message}`)
    }
  }
  function checkLost(job) {
    return (
      (job.runner === BOOT && !runningChecks.has(job.id)) ||
      now() - Date.parse(job.beatAt ?? job.startedAt) > CHECK_SILENT_MS ||
      now() - Date.parse(job.startedAt) > CHECK_STALE_MS
    )
  }
  async function checkStatus(build) {
    const row = (await pool.query('select qa from wo_build where id=$1', [build.id])).rows[0]
    const job = row?.qa?.clientCheck
    if (!job) throw error('AGENT_DEMO_CHECK_NOT_STARTED')
    if (job.state === 'running') {
      if (checkLost(job)) throw error('DEMO_CHECK_LOST')
      return { ok: true, running: true, checkId: job.id }
    }
    if (job.state === 'error') throw error(job.code ?? 'DEMO_QA_UNAVAILABLE')
    return { ok: true, checkId: job.id, ...(job.resultText ? JSON.parse(job.resultText) : job.result) }
  }
  return { prepare, send, operation, reconcile }
}

/**
 * A counted check's sweep that ended with changes still planned: no calls to run, why it stopped, and what is left,
 * reported unresolved; `shown` stays so dsh can check the last round's `cleared` rows against it.
 * @param {{calls: any[], unresolved?: any[], left?: number, shown?: string[]}} sweep
 * @param {'bound' | 'no-progress'} why
 * @param {number} rounds
 */
export function sweepStopped(sweep, why, rounds) {
  const left = sweep.left ?? sweep.calls.length
  return {
    calls: [],
    stopped: { why, rounds, left },
    unresolved: [
      ...(sweep.unresolved ?? []),
      {
        field: 'sweep',
        why:
          why === 'bound'
            ? `the sweep reached its bound of ${SWEEP_ROUNDS_MAX} rounds with ${left} changes still planned`
            : `the sweep's round ${rounds} cleared nothing: ${left} changes still planned`
      }
    ],
    shown: sweep.shown ?? []
  }
}

/**
 * The template pictures the sweep plans from: every one the check still found (`pictures`, `demo-qa.js`
 * `PICTURES_MAX`), not the repair prompt's twenty (`detail`); a tracy-host from before `pictures` sends `detail` only.
 * @param {{id: string, pass?: boolean, pictures?: object[], detail?: object[]}[]} checks
 */
export function sweepPicturesOf(checks) {
  const failed = checks.find((check) => check.id === 'no-demo-pictures' && !check.pass)
  return failed?.pictures ?? failed?.detail ?? []
}

/** The template categories and tags the page still names (`no-demo-words` findings with a `category` link). */
export function templateCategoriesOf(checks) {
  const words = checks.find((check) => check.id === 'no-demo-words' && !check.pass)
  return (words?.categories ?? words?.detail ?? []).filter((f) => typeof f?.category === 'string')
}

/**
 * The checks as the agent reads them: the sweep's full picture and passage lists stay with the planner, `detail` goes on.
 * @param {Record<string, any>[]} checks
 */
export function checksForAgent(checks) {
  return checks.map(({ pictures: _pictures, passages: _passages, ...check }) => check)
}

/** The business's photos the build imported (`agentDemo.imports`), each with its site address and shape. */
export function importedMedia(build, bundle) {
  const assets = new Map((bundle?.media ?? []).map((asset) => [asset.id, asset]))
  const frames = videoFrameIds(bundle?.media ?? [])
  return Object.values(build?.content?.agentDemo?.imports ?? {})
    .filter((receipt) => receipt?.state === 'written' && typeof receipt.path === 'string' && receipt.path)
    .map((receipt) => {
      const asset = assets.get(receipt.assetId)
      // 🔒 The sweep's frames rank the research's own reading of each photo (`handoff.js` `pictureWorth`), not a second one.
      const seen = { labels: asset?.labels ?? null, videoFrame: frames.has(receipt.assetId) }
      return {
        url: receipt.path,
        id: receipt.mediaId ?? null,
        width: receipt.derivative?.width ?? asset?.width ?? null,
        height: receipt.derivative?.height ?? asset?.height ?? null,
        worth: pictureWorth(seen),
        poor: poorPicture(seen)
      }
    })
}

/**
 * 🔒 A LOGO dsh HAS NO WRITER FOR IS WORN HERE (product owner, round 5, 24/10/2026). dsh's sweep sets a logo on
 * WordPress only and answers any other CMS `NEEDS_LOGO_DOOR`; Joomla's and EmDash's brand writers live in tracy-web
 * (`brief-engines/brand.js`). So on those CMSs the wordmark the planner drew is worn through that writer before the
 * calls leave, and its call is dropped; a writer that did not take it leaves the logo unresolved with its reason.
 * A research logo goes the same way once the page reader laid it in the template logo's box (`fittedLogo`, a png);
 * one it could not read (a media URL, no bytes) still goes to dsh and comes back unresolved.
 * @param {{calls: Array<{action: string, params: Record<string, any>}>, unresolved: Array<Record<string, any>>}} plan
 * @param {{platform?: string, wear: ((input: {png: string, applyId: string}) => Promise<{written?: string[], skipped?: Array<{where: string, reason: string}>}>) | null, now: () => number}} options
 */
export async function wornLogo(plan, { platform, wear, now }) {
  if (platform === 'wordpress' || typeof wear !== 'function') return plan
  const at = plan.calls.findIndex((c) => c.action === 'logo' && typeof c.params?.png === 'string')
  if (at < 0) return plan
  const { params } = plan.calls[at]
  const calls = plan.calls.filter((_, i) => i !== at)
  const result = await wear({ png: params.png, applyId: `sweep-logo-${now().toString(36)}` }).catch(
    (failure) => ({
      written: [],
      skipped: [{ where: 'logo', reason: String(failure?.message ?? failure) }]
    })
  )
  if ((result?.written ?? []).some((where) => String(where).startsWith('logo'))) return { ...plan, calls }
  const reason =
    (result?.skipped ?? []).find((s) => /logo/.test(String(s?.where)))?.reason ?? 'no logo spot took it'
  return {
    ...plan,
    calls,
    unresolved: [
      ...plan.unresolved,
      {
        page: params.path,
        file: params.find,
        field: 'picture',
        why: `the brand writer did not wear the wordmark: ${reason}`
      }
    ]
  }
}

/**
 * The business's logo as the build imported it: the brief's chosen logo (`brand.logo`, the place's research), or null
 * when the research found none or its import was not written.
 * @param {any} build @param {any} brand
 * @returns {{url: string, id: number | string | null} | null}
 */
export function importedLogo(build, brand) {
  const chosen = typeof brand?.logo === 'string' ? brand.logo : null
  if (!chosen) return null
  const receipt = Object.values(build?.content?.agentDemo?.imports ?? {}).find(
    (r) => r?.assetId === chosen && r.state === 'written' && typeof r.path === 'string' && r.path
  )
  return receipt ? { url: receipt.path, id: receipt.mediaId ?? null } : null
}

/**
 * 🔒 THIN RESEARCH IS A NOTE FOR THE OPERATOR, NEVER TEXT ON THE SITE (product owner, 24 and 25/10/2026): template
 * posts are written from the research's topics, split to one fact each while posts remain (`splitTopics`); posts past
 * its last fact keep the template's, are reported by the sweep, and the reviewer is told how many
 * (`editorial-guide.mjs` `thinResearch`). No post says "Coming soon".
 */
/**
 * The check's note on page leads the research could not word: the sweep left them empty because
 * the agent's line did not land and the research has no sourced lead (`planSweep` `thinLeads`). A pass that says so,
 * like thin posts; null when every lead is worded.
 * @param {number} count
 */
export function leadsThin(count) {
  if (!(count > 0)) return null
  return {
    id: 'page-leads',
    pass: true,
    measured: `${count} page lead${count === 1 ? '' : 's'} left empty`,
    expected: "every page lead written from the business's research",
    warning: `thin research: ${count} page lead${count === 1 ? '' : 's'} left empty — the agent's line did not land and the research has no sourced lead (bio) to use.`
  }
}

/**
 * The template posts whose page QA read and found free of the template's body: no passage there that only post pages
 * show (the footer every page shares is the frame's). Null when the check lists no passages (a host from before).
 * @param {{routes?: unknown[]}[]} posts @param {{checks?: object[], read?: string[]}} shown
 */
function postsShownWritten(posts, { checks = [], read = [] } = {}) {
  const words = checks.find((check) => check?.id === 'no-demo-words')
  if (!words || (!words.pass && !Array.isArray(words.passages))) return null
  const routesOf = (record) => (record.routes ?? []).map(routePath).filter((path) => path !== null)
  const postRoutes = new Set(posts.flatMap(routesOf))
  const others = new Set(read.filter((path) => !postRoutes.has(path)))
  const body = (words.passages ?? []).filter((p) => !(p.pages ?? []).some((page) => others.has(page)))
  const opened = new Set(read)
  return posts.filter((record) =>
    routesOf(record).some((path) => opened.has(path) && !body.some((p) => (p.pages ?? []).includes(path)))
  )
}

/** A live post's stored title and body, on WordPress, Joomla or EmDash. */
const postTextOf = (record) => {
  const data = record?.data ?? {}
  const field = (name) => (typeof name === 'string' ? data[name] : undefined)
  return [
    data.post_title ?? field(record?.titleField) ?? data.title,
    data.post_content ?? data.introtext ?? field(record?.bodyField) ?? data.content ?? data.body
  ]
}

/**
 * Template posts written, counted by what each one's page shows once QA has read it (build 13, 25/10/2026: the plan
 * wrote 22 bodies and every page still showed the template's lorem); by the plan's rows when QA lists no passages.
 * 🔒 A post whose live title or body is only a placeholder ("Coming soon") is not written and fails the check
 * (product owner, 25/10/2026; build 15 wrote "Coming soon" into 17 posts and this check passed "5 of 22").
 * @param {object} plan @param {object} bundle
 * @param {{checks?: object[], read?: string[], records?: object[]}} [shown] - `records`: the live inventory
 */
export function postsWritten(plan, bundle, shown = {}) {
  const posts = postCoverage(plan, bundle)
  const live = new Map((shown.records ?? []).map((record) => [postKey(record), record]))
  const placeholders = posts.own
    .filter((record) => postTextOf(live.get(postKey(record))).some(isPlaceholderText))
    .map(postKey)
  const shownWritten = postsShownWritten(posts.own, shown)
  const onPage = shownWritten && shownWritten.filter((record) => !placeholders.includes(postKey(record)))
  const stillTemplate = onPage
    ? posts.writtenPosts.filter((record) => !onPage.includes(record)).map(postKey)
    : []
  // A written post still showing the template's photo: the agent is told which, and the sweep features an imported
  // one where it does not (product owner, 25/10/2026).
  const unpictured = postsWithoutPicture(plan)
  const warnings = [
    placeholders.length
      ? `${listed(placeholders)} ${placeholders.length === 1 ? 'shows' : 'show'} only filler as ${placeholders.length === 1 ? 'its' : 'their'} title or body: compose each one from a research topic's facts (title, body and excerpt); a fact the research does not hold is left out, never written as filler.`
      : null,
    posts.thin?.message,
    stillTemplate.length
      ? `${listed(stillTemplate)} ${stillTemplate.length === 1 ? 'is' : 'are'} written in the plan but still show the template's text on their page: write each one's body from a research topic.`
      : null,
    unpictured.length
      ? `${listed(unpictured)} ${unpictured.length === 1 ? 'is' : 'are'} written with no picture of its own: set each one's featured picture to an imported photo (on WordPress its _thumbnail_id meta).`
      : null
  ].filter(Boolean)
  return {
    id: 'posts-written',
    pass: placeholders.length === 0,
    measured: onPage
      ? `${onPage.length} of ${posts.templatePosts} template posts show the business's own text on their page (${posts.written} written in the plan) from ${posts.topics} research topics`
      : `${posts.written} of ${posts.templatePosts} template posts written from ${posts.topics} research topics`,
    expected: 'a new post of the business for each template post while the research has a topic for it',
    ...(placeholders.length ? { placeholders } : {}),
    ...(unpictured.length ? { unpictured } : {}),
    ...(warnings.length ? { warning: warnings.join(' ') } : {})
  }
}

/** Twenty names, then how many more. */
const listed = (names) =>
  `${names.slice(0, 20).join(', ')}${names.length > 20 ? ` and ${names.length - 20} more` : ''}`

/** The site's Contact page by its address (`/contact`, `/contact-us/`): where booking and template links go. */
export function contactPathOf(records) {
  for (const record of records)
    for (const route of record.routes ?? []) {
      const path = routePath(route)
      if (path !== null && /^contact/i.test(path.split('/').filter(Boolean).at(-1) ?? '')) return path
    }
  return null
}
