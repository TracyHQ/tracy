import { AGENT_DEMO, isAgentDemo, checkedResearch } from './agent-demo.js'
import { quickstartReleaseMatches } from '../lib/quickstart-selection.js'
/**
 * Building a site from a revision (plan §10 items 4–5): through the REAL create door, `POST /api/sites`,
 * with the caller's own cookie — the same seat, quota, label and template rules as the Add site form.
 *
 * 🔒 THE SERVER READS THE SNAPSHOT. Platform, quickstart and design come from the build's choice laid over the
 * brief (`build-choice.js`), frozen on the row when it is written; a `cms` or `platform` in a body is never read. One request id is one build: the row is written
 * BEFORE the create door is called, the create door is idempotent on `buildId` (derived from account,
 * revision and request id), and its receipt is recorded before this door answers. A row left without
 * a site (the process died mid-call) is reconciled from `site_creation`, else asked again with the
 * same `buildId` — which the create door answers with the site it already made.
 *
 * 🔒 ONE LIVE BUILD PER (BRIEF, CHOICE) (run 1–3 on wo2, 19/10/2026: a reload minted a new request id and the next
 * press made a second site). One brief feeds demos on other CMSs and templates; a request id it has not seen with the
 * same choice is refused `BUILD_EXISTS` while another such build is not `refused`/`failed`. A FAILED build is asked again by its own request id: same
 * `buildId`, same label, and the create door replaces the failed attempt on the same site.
 */
import { createHash } from 'node:crypto'
import { siteLabelRefusal } from '../lib/site-label-rules.js'
import {
  endBuild,
  endedBuilds,
  insertBuild,
  liveBuildOf,
  loseStaleRequest,
  reconcileBuild,
  saveBuildLabel,
  saveBuildReceipt,
  withRevisionLock
} from './build-store.js'
import { templateRefusal } from './revisions.js'
import { choiceKey } from './build-choice.js'
import { QUALITY_PROTOCOL } from './quality-protocol.js'

const ABOUT_MAX = 300

/** A UUID-shaped id that is a pure function of its inputs (sha256, version-4 layout bits). */
export function deterministicBuildId(accountId, revisionId, requestId) {
  const h = createHash('sha256').update(`wo-build:${accountId}:${revisionId}:${requestId}`).digest()
  h[6] = (h[6] & 0x0f) | 0x40
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** The one-paragraph `about` the create door accepts (≤ 300 characters): name and one line. */
export function aboutOf(revision) {
  const brief = revision.brief ?? {}
  const name = brief.business?.name ?? ''
  const firstCopy = (brief.sitemap ?? [])
    .flatMap((page) => page?.sections ?? [])
    .map((s) => (typeof s?.copy === 'string' ? s.copy : ''))
    .find((copy) => copy.trim())
  const line = (firstCopy ?? brief.business?.address ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
  return [name, line]
    .map((s) => String(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('. ')
    .slice(0, ABOUT_MAX)
}

/** The create door's own cap on a typed site name (`SITE_LABEL_RE`, 6–30). */
const SITE_LABEL_MAX = 30

/**
 * The name the server gives a demo when the person typed none: the place's name as a site label
 * (`siteLabelFor`), `-demo` added when the create door's own rule would refuse it (too short, reserved),
 * then the first free of `<base>`, `<base>-2`… across every name this deployment holds — its sites,
 * the shard directory, live label holds and custom names (the same books `holdLabel` reads).
 *
 * Asked BEFORE the create door, never retried with a new name under the same `buildId`: the door
 * hashes the typed label into the build, so a second name for one build answers IDEMPOTENCY_CONFLICT.
 */
export async function suggestedLabel({ pool, config, domain, revision }) {
  let base = domain.siteLabelFor(revision.brief?.business?.name, { max: SITE_LABEL_MAX })
  if (siteLabelRefusal(base) !== null) base = `${base.slice(0, SITE_LABEL_MAX - 8).replace(/-+$/, '')}-demo`
  const prefix = config.siteAddressPrefix ?? ''
  const like = `${prefix}${base}%`
  const { rows } = await pool.query(
    `select label from site where label like $1
     union select label from directory_site where label like $1
     union select label from label_registry where label like $1 and expires_at > now()
     union select split_part(name, '.', 1) from site_name where name like $2`,
    [like, `${like}.${config.siteDomain}`]
  )
  return domain.nextSiteLabel(base, new Set(rows.map((r) => r.label.slice(prefix.length))))
}

/** Whether the deployment still offers the revision's template on its CMS. */
export function templateOffered(cards, revision) {
  const t = revision.template
  return cards.some(
    (card) =>
      card?.id === t.design &&
      (card.platforms ?? []).some(
        (p) =>
          p?.platform === revision.cms &&
          p.tag === t.quickstart &&
          (!t.release || quickstartReleaseMatches(t.release, p.release))
      )
  )
}

/**
 * Start (or find) the build of one request.
 * @param {{
 *   pool: import('pg').Pool,
 *   request: (path: string, init: RequestInit) => Promise<Response>,
 *   origin: string, cookie: string, accountId: string, revision: any, requestId: string,
 *   label: string, config: any, domain: any, demoActionId?: string | null
 * }} args
 *   `label` empty: the request's earlier choice, else `suggestedLabel`.
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function startBuild({
  pool,
  request,
  origin,
  cookie,
  accountId,
  revision,
  requestId,
  label,
  config,
  domain,
  demoActionId = null,
  qualityLease = null
}) {
  const refusal = templateRefusal(revision.template)
  if (refusal)
    return {
      status: 409,
      body: {
        code: refusal,
        next: 'Create a new revision with a template this deployment offers for the revision’s CMS.'
      }
    }
  const buildId = deterministicBuildId(accountId, revision.id, requestId)
  const existing = await pool.query('select * from wo_build where account_id = $1 and request_id = $2', [
    accountId,
    requestId
  ])
  let row = existing.rows[0] ?? null
  if (row && row.revision_id !== revision.id)
    return {
      status: 409,
      body: { code: 'REQUEST_ID_REUSED', next: 'Send a new requestId for a build of another revision.' }
    }
  if (row) {
    row = await settleBuild({ pool, request, origin, cookie, build: row })
    // A refused, failed or unanswered request is asked again with the same buildId; the create door answers a
    // site it already made instead of making a second one, so a site key here proves nothing yet.
    if (!RETRIED.includes(row.state)) return { status: 202, body: { build: row } }
    // A stopped build is not built again beside a live one of the same revision.
    if (row.state !== 'requesting') {
      const live = await liveBuildOf(pool, revision.id, requestId, choiceKey(revision.build_choice))
      if (live) return buildExists(live)
    }
  }
  if (!row || (row.state === 'requesting' && !row.receipt)) {
    const templates = await readJson(request, '/api/templates', { headers: { origin } })
    if (!templates.ok || !Array.isArray(templates.body?.templates))
      return {
        status: 503,
        body: {
          code: 'TEMPLATES_UNREADABLE',
          next: 'Try again in a minute: the template list could not be read.'
        }
      }
    if (!templateOffered(templates.body.templates, revision))
      return {
        status: 409,
        body: {
          code: 'TEMPLATE_UNAVAILABLE',
          next: 'The revision’s template is no longer offered here: create a new revision.'
        }
      }
  }
  if (!row) {
    await settleEndedBuilds(pool, { revisionId: revision.id })
    const placed = await withRevisionLock(pool, revision.id, async (client) => {
      const live = await liveBuildOf(client, revision.id, requestId, choiceKey(revision.build_choice))
      if (live) return { live }
      return {
        row: (
          await insertBuild(client, {
            accountId,
            revisionId: revision.id,
            requestId,
            buildId,
            choice: revision.build_choice
          })
        ).row
      }
    })
    if (placed.live) return buildExists(placed.live)
    row = placed.row
  }
  // A failed build keeps its name: the create door hashes the label into the build, and retries it on the same site.
  const chosen =
    (row.state === 'failed' && row.label) ||
    label ||
    row.label ||
    (await suggestedLabel({ pool, config, domain, revision }))
  if (row.label !== chosen) row = await saveBuildLabel(pool, row.id, chosen)
  const agentDemo = isAgentDemo(revision)
  if (agentDemo) checkedResearch(revision)
  const quality = revision.brief?.editorial?.protocol === QUALITY_PROTOCOL
  if (quality && (!demoActionId || !qualityLease?.token))
    throw Object.assign(new Error('QUALITY_ACTION_FENCE'), { code: 'QUALITY_ACTION_FENCE' })
  const { brief, pagePlan } =
    quality || agentDemo
      ? { brief: null, pagePlan: null }
      : await siteBrief({ request, origin, cookie, revision, domain })
  const answer = await readJson(request, '/api/sites', {
    method: 'POST',
    headers: {
      cookie,
      origin,
      'content-type': 'application/json',
      ...(quality
        ? {
            'X-Tracy-WO-Action': demoActionId,
            'X-Tracy-WO-Fence': String(qualityLease.token)
          }
        : {})
    },
    body: JSON.stringify({
      platform: revision.cms,
      design: revision.template.design,
      quickstart: revision.template.quickstart,
      ...(revision.template.release ? { expectedQuickstartRelease: revision.template.release } : {}),
      label: chosen,
      buildId: row.build_id,
      ...(agentDemo ? { workflow: AGENT_DEMO } : {}),
      ...(quality || agentDemo ? {} : { brief })
    })
  })
  // The plan that chose the pages travels with the receipt, so the hand-off and QA read the same one.
  const receipt = {
    status: answer.status,
    body: answer.body,
    at: new Date().toISOString(),
    ...(demoActionId ? { demoActionId } : {}),
    ...(pagePlan ? { pagePlan } : {})
  }
  const saved = await saveBuildReceipt(pool, row.id, {
    state: answer.ok ? 'provisioning' : 'refused',
    receipt,
    siteKey: answer.ok && typeof answer.body?.siteKey === 'string' ? answer.body.siteKey : null,
    siteJobId: answer.ok && typeof answer.body?.jobId === 'string' ? answer.body.jobId : null
  })
  const build = await reconcileBuild(pool, saved)
  if (answer.ok) return { status: 202, body: { build } }
  return {
    status: answer.status >= 500 ? 502 : answer.status,
    body: {
      code: answer.body?.code ?? 'SITE_CREATE_REFUSED',
      next: 'Read `build.receipt` for the create door’s answer; fix it and press again with the same requestId.',
      build
    }
  }
}

function buildExists(build) {
  return {
    status: 409,
    body: {
      code: 'BUILD_EXISTS',
      next: 'This revision already has a demo site: read `build`. For a second site, create a new revision.',
      build
    }
  }
}

/** A create call answers within minutes; a `requesting` build this old with no site was never asked for. */
const REQUEST_LOST_MS = 10 * 60_000

/** The states a press of the same request id asks the create door again from. */
const RETRIED = ['requesting', 'refused', 'failed']

/** The first line worth showing of a host's failed-job answer: its error output, else its detail, else its reason. */
export function failureReason(detail) {
  const output = typeof detail?.output === 'string' ? detail.output : ''
  const line = output.split('\n').find((l) => l.trim()) ?? ''
  const text = [line, detail?.detail, detail?.reason, detail?.error].find(
    (v) => typeof v === 'string' && v.trim()
  )
  return String(text ?? 'failed')
    .trim()
    .slice(0, 300)
}

/**
 * Write the endings the create door's book already holds onto the builds still waiting (one build, a revision's, or a
 * batch for the sweep in `cron.js`). Database only: no host is asked, so it runs with nobody's cookie.
 * @param {import('pg').Pool} pool
 * @param {{id?: string, revisionId?: string}} [which]
 * @returns {Promise<number>} how many builds were settled
 */
export async function settleEndedBuilds(pool, { id = null, revisionId = null } = {}) {
  let settled = 0
  for (const ended of await endedBuilds(pool, { id, revisionId })) {
    const failure =
      ended.ending === 'failed'
        ? {
            code: 'PROVISION_FAILED',
            reason: failureReason(ended.job_detail),
            jobId: ended.job_id,
            at: new Date().toISOString()
          }
        : null
    if (await endBuild(pool, ended.id, { state: ended.ending, failure })) settled++
  }
  return settled
}

/**
 * A build as it stands now. While it provisions, the create door's job poll (`GET /api/sites/:key/jobs/:id`, the
 * caller's own cookie, as the Add site form polls it) is asked: that door asks the host and writes the ending into
 * `site_creation`, which no sweep may have reached yet. Then the book's ending is written onto the build.
 */
export async function settleBuild({ pool, request, origin, cookie, build }) {
  let row = await reconcileBuild(pool, build)
  if (row.state === 'requesting') row = (await loseStaleRequest(pool, row.id, REQUEST_LOST_MS)) ?? row
  if (row.state === 'provisioning' && row.site_key && row.site_job_id) {
    const job = await readJson(
      request,
      `/api/sites/${encodeURIComponent(row.site_key)}/jobs/${encodeURIComponent(row.site_job_id)}`,
      { headers: { cookie, origin } }
    )
    if (job.ok && job.body?.state === 'failed')
      row =
        (await endBuild(pool, row.id, {
          state: 'failed',
          failure: {
            code: 'PROVISION_FAILED',
            reason: failureReason(job.body),
            jobId: row.site_job_id,
            at: new Date().toISOString()
          }
        })) ?? row
  }
  await settleEndedBuilds(pool, { id: row.id })
  const { rows } = await pool.query('select * from wo_build where id = $1', [row.id])
  return rows[0] ?? row
}

/**
 * The create door's own Site questions answered from the revision (`answersFromBrief`), with the page plan that
 * answered its pages; the one-line `about` alone when the questions cannot be read, so a build never waits on them.
 * Either way the revision's contact facts ride beside them (`contactFacts`).
 */
async function siteBrief({ request, origin, cookie, revision, domain }) {
  const { brief, pagePlan } = await siteAnswers({ request, origin, cookie, revision, domain })
  // The restaurant's phone, email, address and hours, each with its source: the create door's identity writers read them.
  const facts = typeof domain?.contactFacts === 'function' ? domain.contactFacts(revision.brief ?? {}) : {}
  return { brief: Object.keys(facts).length ? { ...brief, facts } : brief, pagePlan }
}

/** `siteBrief` without the contact facts. */
async function siteAnswers({ request, origin, cookie, revision, domain }) {
  const fallback = { brief: { about: aboutOf(revision) }, pagePlan: null }
  if (typeof domain?.answersFromBrief !== 'function') return fallback
  const query = new URLSearchParams({
    platform: revision.cms,
    design: revision.template.design,
    quickstart: revision.template.quickstart,
    lang: 'en'
  })
  const served = await readJson(request, `/api/sites/questions?${query}`, { headers: { cookie, origin } })
  if (!served.ok || !Array.isArray(served.body?.questions)) return fallback
  const { answers, questionnaire, pagePlan } = domain.answersFromBrief(revision.brief ?? {}, served.body, {
    now: new Date().toISOString()
  })
  return questionnaire && Object.keys(answers).length
    ? { brief: { answers, questionnaire }, pagePlan: pagePlan ?? null }
    : fallback
}

async function readJson(request, path, init) {
  try {
    const res = await request(path, init)
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { raw: text.slice(0, 500) }
    }
    return { ok: res.ok, status: res.status, body }
  } catch (error) {
    return {
      ok: false,
      status: 503,
      body: { code: 'FORWARD_FAILED', message: String(error?.message ?? error) }
    }
  }
}
