/**
 * Website Opportunities operations (`/ops/wo`):
 * 1. Live Queue across all accounts (`wo_opportunity`, `wo_job`, `wo_source`, `wo_media`,
 *    `wo_revision`, `wo_build`, `ops_wo_read`) shaped for the `/ops/wo` high-density table and
 *    right-hand execution inspector.
 * 2. Sealed provider credentials in `wo_ops_setting` (sealed by `lib/secret-box.js`, AES-256-GCM derived from
 *    `SESSION_SECRET`), their live tests, and each provider's state and numbers: the open layer's operator
 *    functions (`website-opportunities/src/ops/provider-keys.js`, `provider-states.js`) with Tracy's seal and rate
 *    table. The standalone server's operator page calls the same functions.
 * 3. Deployment-wide discovery, web enrichment, picture curation, daily budget, and CMS template
 *    pinning settings: their shape and storage live in the open layer (`website-opportunities/src/wo-settings.js`).
 */

import { readReleases, templateCards } from './quickstart-releases.js'
import { bornSiteAddress } from './site-address.js'
import { rateCountsOf } from './rate.js'
import { openSecret, sealSecret } from './secret-box.js'
import { saveUiSwitches, uiSwitchOn } from './ui-setting.js'
import { FENCED_ACTIONS, runFencedResearchAction } from './wo-operator-fence.js'
import { demoJourneySql } from '../opportunities-build/journey-sql.js'
import { customerStatus, journeySql } from 'website-opportunities/src/wo-journey.js'
import { menuVisionDoorFor } from 'website-opportunities/src/menu-photo-reading.js'
import { createTracyWoHost } from '../wo-host.js'
import {
  DEFAULT_WO_OPS_SETTINGS,
  pinOf,
  readWoOpsSettings,
  readWoRuntime,
  WO_CMS_ORDER,
  WO_PROVIDERS
} from 'website-opportunities/src/wo-settings.js'
import {
  providerKeyFacts,
  readProviderKeys,
  saveProviderKey,
  testProviderKey
} from 'website-opportunities/src/ops/provider-keys.js'
import { capabilityGroups, providerStates } from 'website-opportunities/src/ops/provider-states.js'

/** Tracy's half of the open layer's operator functions: its seal and its rate table (`wo-host.js` has the same). */
const OPERATOR_HOST = Object.freeze({ openSecret, sealSecret, rateCountsOf })

/**
 * What the Website Opportunities pipeline runs with (`readWoRuntime`), its sealed keys opened by Tracy's secret box.
 * `keys.menuVision` resolves, only when called, the vision model menu photos are read with (`menuVisionDoorFor`): a
 * Research again preview needs it to say which photos it would read and what that may cost.
 */
export function woRuntime(pool, config, options = {}) {
  const menuVisionDoor =
    pool && config?.sessionSecret
      ? () => menuVisionDoorFor(pool, config.sessionSecret, createTracyWoHost({ pool, config }))
      : undefined
  return readWoRuntime(pool, config, { ...options, openSecret, menuVisionDoor })
}

/**
 * Read all provider keys for server-side execution.
 * Saved key in `wo_ops_setting` wins over the environment fallback.
 */
export function readWoProviderKeys(pool, config) {
  return readProviderKeys(pool, config, OPERATOR_HOST)
}

/**
 * Read a single provider key for server-side callers.
 */
export async function readWoProviderKey(pool, config, provider) {
  if (!WO_PROVIDERS.includes(provider)) return null
  const keys = await readWoProviderKeys(pool, config)
  return keys[provider] ?? null
}

/** Each capability provider's state for /ops/wo › Settings (`providerStates`), today's caps read from `rate_bucket`. */
export function woProviderStates(pool, { keys, settings, now = Date.now }) {
  return providerStates(pool, { keys, settings, now, rateCountsOf })
}

/** The Provider order block of /ops/wo › Settings (`capabilityGroups`). */
export function woCapabilities(pool, config, { now = Date.now } = {}) {
  return capabilityGroups(pool, config, OPERATOR_HOST, { now })
}

/** Facts safe to display on `/ops/wo` › `Settings` about each provider key; never the plaintext key. */
export function woProviderKeyFacts(pool, config) {
  return providerKeyFacts(pool, config, OPERATOR_HOST)
}

/** Seal and store or clear one provider's API key in `wo_ops_setting`. */
export function saveWoProviderKey(pool, config, provider, rawKey, updatedBy) {
  return saveProviderKey(pool, config, OPERATOR_HOST, provider, rawKey, updatedBy)
}

/** Live connectivity test for a configured provider key. */
export function testWoProviderKey(pool, config, provider, fetchImpl = fetch) {
  return testProviderKey(pool, config, OPERATOR_HOST, provider, fetchImpl)
}

/**
 * Each CMS pin as `/ops/wo` warns about it: `found` — a release carries that tag; `offered` — Design
 * inspiration offers it for that CMS (`templateCards`, the cards a revision chooses from), so a
 * revision can build it; `inspirationHidden` — an operator unpublished its card.
 */
export async function readWoTemplateStatuses(pool, pinnedTemplates) {
  const pins = WO_CMS_ORDER.map((cms) => [cms, pinOf(pinnedTemplates?.[cms], cms)])
  const status = (cms, slug, release, offered) => ({
    cms,
    slug,
    title: release?.setting?.label ?? slug,
    found: Boolean(release),
    inspirationHidden: Boolean(release?.inspirationHidden),
    published: Boolean(release),
    offered
  })
  if (!pool) return pins.map(([cms, slug]) => status(cms, slug, null, false))
  try {
    const releases = await readReleases(pool)
    const cards = templateCards(releases)
    return pins.map(([cms, slug]) =>
      status(
        cms,
        slug,
        releases.find((r) => r.tag === slug),
        cards.some((card) => card.platforms.some((p) => p.platform === cms && p.tag === slug))
      )
    )
  } catch {
    return pins.map(([cms, slug]) => status(cms, slug, null, false))
  }
}

function errorTextOf(lastError) {
  if (!lastError) return null
  if (typeof lastError === 'string') return lastError
  if (typeof lastError === 'object') {
    const code = lastError.code || lastError.reason || null
    const msg = lastError.message || lastError.detail || null
    if (code && msg) return `${code}: ${msg}`
    return msg || code || null
  }
  return null
}

/**
 * Derive the 0..7 lifecycle stage and attention state of a Website Opportunity row from its
 * latest job (`wo_job`), sources (`wo_source`), media (`wo_media`), revision (`wo_revision`),
 * and demo build (`wo_build`).
 */
function deriveOpportunityLifecycle(opp, latestJob, sources, mediaStats, latestRevision, latestBuild) {
  const blockedSources = sources.filter(
    (s) => s.status === 'blocked' || s.status === 'failed' || s.status === 'paused'
  )
  const runningSources = sources.filter((s) => s.status === 'running')
  const doneSources = sources.filter(
    (s) => s.status === 'done' || s.status === 'completed' || s.status === 'complete'
  )

  const leaseExpired =
    latestJob?.state === 'running' &&
    latestJob?.lease_until &&
    new Date(latestJob.lease_until).getTime() < Date.now()

  const jobErrText = errorTextOf(latestJob?.last_error)

  // Stage 7: Live demo site (handoff written or build state is ready/live or site_key provisioned with handoff)
  if (
    latestBuild?.state === 'done' ||
    latestBuild?.state === 'completed' ||
    latestBuild?.state === 'live' ||
    latestBuild?.state === 'ready' ||
    latestBuild?.handoff ||
    opp.status === 'built'
  ) {
    const partialWarning = blockedSources.length > 0
    const qa = latestBuild?.qa && typeof latestBuild.qa === 'object' ? latestBuild.qa : null
    const qaState = qa?.state ?? null
    const handoffState = latestBuild?.handoff?.state ?? null
    const qaFailed = qaState === 'failed' || handoffState === 'needs-review'
    const qaRunning = qaState === 'baseline' || qaState === 'pending' || qaState === 'retry'
    const qaRepairs = Number(qa?.repairs ?? 0)

    let attentionReason = null
    if (qaFailed) {
      attentionReason =
        qa?.reason || `Demo QA gate failed after ${qaRepairs} repair round${qaRepairs === 1 ? '' : 's'}`
    } else if (partialWarning) {
      attentionReason = `${blockedSources.map((s) => s.source).join(', ')} skipped (${blockedSources[0]?.reason || 'partial'})`
    }

    let currentStep = 'Demo built · QA not recorded'
    let statusText = 'Demo built · QA not recorded'
    let queueState = 'IDLE'
    if (qaFailed) {
      currentStep = `Demo QA failed (${qaRepairs} repair${qaRepairs === 1 ? '' : 's'}) · Needs review`
      statusText = 'Demo QA needs review'
      queueState = 'BLOCKED'
    } else if (qaRunning) {
      currentStep =
        qaState === 'retry' ? `Demo QA repair #${qaRepairs || 1} in progress` : 'Waiting for Demo QA gate'
      statusText = qaState === 'retry' ? `QA repair #${qaRepairs || 1}` : 'Demo QA pending'
      queueState = 'LEASED'
    } else if (qaState === 'passed') {
      currentStep = `All collectors & Demo QA passed${qaRepairs > 0 ? ` (${qaRepairs} repair${qaRepairs === 1 ? '' : 's'})` : ''}`
      statusText = 'Demo site live · QA passed'
      queueState = 'DONE'
    }

    return {
      stage: '7-live',
      stepNum: 7,
      needsAttention: qaFailed,
      attentionReason,
      researchRollup: 'success',
      currentStep,
      queueState,
      statusText
    }
  }

  // Stage 6: Uploading curated pictures / applying site content
  if (
    latestBuild &&
    (latestBuild.state === 'uploading' ||
      latestBuild.state === 'applying' ||
      (latestBuild.site_key && latestBuild.pictures && !latestBuild.handoff))
  ) {
    return {
      stage: '6-uploading',
      stepNum: 6,
      needsAttention: false,
      attentionReason: null,
      researchRollup: 'success',
      currentStep: `Uploading ${mediaStats.storedCount || mediaStats.totalCount || 0} curated photos`,
      queueState: 'LEASED',
      statusText: 'Uploading photos to site'
    }
  }

  // Stage 5: Provisioning demo site container
  if (
    latestBuild &&
    (latestBuild.state === 'requesting' ||
      latestBuild.state === 'provisioning' ||
      latestBuild.state === 'building' ||
      latestBuild.state === 'failed')
  ) {
    const failed = latestBuild.state === 'failed'
    const receiptErr = latestBuild.receipt?.error || latestBuild.receipt?.code || null
    return {
      stage: '5-provisioning',
      stepNum: 5,
      needsAttention: failed,
      attentionReason: failed ? `Demo site build failed${receiptErr ? ` (${receiptErr})` : ''}` : null,
      researchRollup: 'success',
      currentStep: failed ? 'Demo container provisioning failed' : 'Provisioning CMS container',
      queueState: failed ? 'BLOCKED' : 'LEASED',
      statusText: failed ? 'Build failed' : 'Provisioning demo site'
    }
  }

  // Stage 4: Brief ready (revision synthesized, waiting to build demo site)
  if (latestRevision || latestJob?.state === 'completed' || opp.status === 'ready') {
    const pausedOrFailed =
      latestJob?.state === 'paused' || latestJob?.state === 'blocked' || latestJob?.state === 'failed'
    return {
      stage: '4-brief-ready',
      stepNum: 4,
      needsAttention: pausedOrFailed,
      attentionReason: pausedOrFailed ? jobErrText || 'Partial source failure while refreshing brief' : null,
      researchRollup: pausedOrFailed ? 'failure' : 'success',
      currentStep: `Brief v${latestRevision?.n ?? 1} ready · Can build demo site`,
      queueState: 'IDLE',
      statusText: 'Brief ready · Can build demo'
    }
  }

  // Stage 3: Researching (running/paused/blocked/failed job or active source collection)
  if (
    latestJob?.state === 'running' ||
    latestJob?.state === 'paused' ||
    latestJob?.state === 'blocked' ||
    latestJob?.state === 'failed' ||
    opp.status === 'collecting' ||
    opp.status === 'failed'
  ) {
    const isPaused = latestJob?.state === 'paused'
    const isFailed =
      latestJob?.state === 'failed' ||
      latestJob?.state === 'blocked' ||
      opp.status === 'failed' ||
      leaseExpired
    const activeSource = runningSources[0]
    const blockedSource = blockedSources[0]

    let currentStep = `Stage: ${latestJob?.stage || 'collection'} (${doneSources.length}/${Math.max(1, sources.length)} sources)`
    if (activeSource) {
      currentStep = `Collecting ${activeSource.source} (${doneSources.length}/${sources.length || 1} done)`
    } else if (leaseExpired) {
      currentStep = `Worker lease expired on ${latestJob?.lease_owner || 'worker'}`
    } else if (blockedSource) {
      currentStep = `Stopped at ${blockedSource.source}: ${blockedSource.reason || 'source error'}`
    } else if (isPaused || isFailed) {
      currentStep = jobErrText ? `Stopped: ${jobErrText}` : 'Collection paused'
    }

    let attentionReason = null
    if (leaseExpired) {
      attentionReason = `Worker lease expired (${latestJob?.lease_owner || 'worker'}) without heartbeat.`
    } else if (isPaused || isFailed || blockedSources.length > 0) {
      attentionReason =
        jobErrText || blockedSource?.reason || 'Research job stopped before completing brief synthesis.'
    }

    return {
      stage: '3-researching',
      stepNum: 3,
      needsAttention: Boolean(isPaused || isFailed || leaseExpired || blockedSources.length > 0),
      attentionReason,
      researchRollup: isFailed || leaseExpired ? 'failure' : isPaused ? 'paused' : 'pending',
      currentStep,
      queueState: isPaused ? 'PAUSED' : isFailed || leaseExpired ? 'BLOCKED' : 'LEASED',
      statusText: leaseExpired
        ? 'Lease expired · Stuck'
        : isPaused
          ? `Paused (${jobErrText || 'quota'})`
          : isFailed
            ? `Failed (${jobErrText || 'blocked'})`
            : `Researching (${doneSources.length}/${Math.max(1, sources.length)})`
    }
  }

  // Stage 1 & 2: Queued / Waiting for worker lease
  if (latestJob?.state === 'queued') {
    const ageMs = Date.now() - new Date(latestJob.created_at).getTime()
    if (ageMs > 15_000) {
      return {
        stage: '2-waiting',
        stepNum: 2,
        needsAttention: false,
        attentionReason: null,
        researchRollup: 'pending',
        currentStep: 'Waiting for available worker lease',
        queueState: 'QUEUED',
        statusText: 'Waiting for worker slot'
      }
    }
    return {
      stage: '1-queued',
      stepNum: 1,
      needsAttention: false,
      attentionReason: null,
      researchRollup: 'pending',
      currentStep: 'Queued for collection',
      queueState: 'QUEUED',
      statusText: 'Queued'
    }
  }

  // Stage 0: Saved pin on map (discovered, not yet queued for deep research)
  return {
    stage: '0-pin',
    stepNum: 0,
    needsAttention: false,
    attentionReason: null,
    researchRollup: 'none',
    currentStep: 'Not started (Map pin saved)',
    queueState: 'IDLE',
    statusText: 'Saved pin on map'
  }
}

/** How many of the sweep's unresolved items the QA row lists; the rest are a count. */
export const SWEEP_UNRESOLVED_SHOWN = 8
const SWEEP_WHY_MAX = 140

/**
 * What the residue sweep left unresolved on the build's latest client check (`qa.clientCheck.result.sweep`,
 * written by `client-demo.js`), as the QA row lists it: field, page and a short reason, capped at
 * {@link SWEEP_UNRESOLVED_SHOWN} with the rest counted. Nothing unresolved → no keys at all.
 * @param {any} qa
 * @returns {{ unresolved?: { field: string, page: string | null, why: string }[], unresolvedMore?: number }}
 */
export function sweepUnresolvedOf(qa) {
  const list = qa?.clientCheck?.result?.sweep?.unresolved
  if (!Array.isArray(list)) return {}
  const items = list.filter((item) => item && typeof item === 'object')
  if (items.length === 0) return {}
  const shown = items.slice(0, SWEEP_UNRESOLVED_SHOWN).map((item) => {
    const why = typeof item.why === 'string' ? item.why.trim() : ''
    return {
      field: typeof item.field === 'string' && item.field ? item.field : 'item',
      page: typeof item.page === 'string' && item.page ? item.page : null,
      why: why.length > SWEEP_WHY_MAX ? `${why.slice(0, SWEEP_WHY_MAX - 1)}…` : why
    }
  })
  const more = items.length - shown.length
  return { unresolved: shown, ...(more > 0 ? { unresolvedMore: more } : {}) }
}

export function buildCollectorItems(opp, sources, mediaStats, latestRevision, latestBuild) {
  const candidate = opp.candidate && typeof opp.candidate === 'object' ? opp.candidate : {}
  const items = [
    {
      name: '1. Google Maps Place Discovery',
      provider: `apify · ${opp.provider || 'google-maps'}`,
      status: 'success',
      durationSec: 4,
      detail: opp.provider_id
        ? `ID ${String(opp.provider_id).slice(0, 18)}… · ${candidate.rating ? `${candidate.rating}★` : 'verified'}`
        : 'Map pin recorded'
    }
  ]

  const sourceOrder = ['website', 'facebook', 'instagram', 'tiktok', 'youtube']
  const byType = new Map(sources.map((s) => [s.source, s]))

  for (const stype of sourceOrder) {
    const row = byType.get(stype)
    if (!row && stype !== 'website' && stype !== 'facebook' && stype !== 'instagram') continue
    const labelMap = {
      website: '2. Official Website Discovery & Crawl',
      facebook: '3. Facebook Page Collector',
      instagram: '4. Instagram Profile Collector',
      tiktok: '5. TikTok Profile Collector',
      youtube: '6. YouTube Channel Collector'
    }
    const providerMap = {
      website: 'crawl + jina + firecrawl + deepseek',
      facebook: 'apify · facebook-pages-scraper',
      instagram: 'apify · instagram-profile-scraper',
      tiktok: 'apify · tiktok-scraper',
      youtube: 'apify · youtube-scraper'
    }
    if (!row) {
      items.push({
        name: labelMap[stype],
        provider: providerMap[stype],
        status: 'skipped',
        durationSec: 0,
        detail: 'Not scheduled for this opportunity'
      })
      continue
    }
    const statusMap = {
      done: 'success',
      complete: 'success',
      completed: 'success',
      partial: 'success',
      running: 'running',
      pending: 'pending',
      queued: 'pending',
      paused: 'failure',
      blocked: 'failure',
      failed: 'failure',
      skipped: 'skipped'
    }
    items.push({
      name: labelMap[stype] || `Source: ${stype}`,
      provider: providerMap[stype] || stype,
      status: statusMap[row.status] || 'pending',
      durationSec:
        row.status === 'done' ||
        row.status === 'completed' ||
        row.status === 'complete' ||
        row.status === 'partial'
          ? 8
          : 0,
      detail: row.reason || (row.ref ? `${row.status} · ${row.ref}` : `Status: ${row.status}`)
    })
  }

  items.push({
    name: '5. Vision Picture Curation & Hero Plan',
    provider: 'tracy-vision + picture-draw',
    status: mediaStats.totalCount > 0 ? 'success' : latestRevision ? 'skipped' : 'pending',
    durationSec: mediaStats.totalCount > 0 ? 9 : 0,
    detail:
      mediaStats.totalCount > 0
        ? `${mediaStats.storedCount || mediaStats.totalCount} stored of ${mediaStats.totalCount} media items`
        : 'Waiting for media harvest'
  })

  items.push({
    name: '6. Auto-Brief Synthesis & Handoff',
    provider: 'tracy-wo-domain · synthesizeBrief',
    status: latestRevision ? 'success' : 'pending',
    durationSec: latestRevision ? 5 : 0,
    detail: latestRevision ? `Revision #${latestRevision.n}` : 'Waiting for source collectors'
  })

  if (latestBuild) {
    items.push({
      name: '7. Demo Site Provisioning',
      provider: `tracy-fleet · ${latestBuild.cms || 'cms'}`,
      status:
        latestBuild.state === 'live' || latestBuild.state === 'ready' || latestBuild.handoff
          ? 'success'
          : latestBuild.state === 'failed'
            ? 'failure'
            : 'running',
      durationSec: 25,
      detail: latestBuild.site_key || latestBuild.receipt?.error || `State: ${latestBuild.state}`
    })

    if (latestBuild.qa && typeof latestBuild.qa === 'object') {
      const qaState = latestBuild.qa.state || 'pending'
      const rounds = Array.isArray(latestBuild.qa.rounds) ? latestBuild.qa.rounds.length : 0
      const repairs = Number(latestBuild.qa.repairs ?? 0)
      items.push({
        name: '8. Demo QA Gate',
        provider: 'tracy-host · demo-qa',
        status: qaState === 'passed' ? 'success' : qaState === 'failed' ? 'failure' : 'running',
        durationSec: rounds > 0 ? rounds * 12 : 4,
        detail: `${qaState} · ${rounds} round${rounds === 1 ? '' : 's'}, ${repairs} repair${repairs === 1 ? '' : 's'}${latestBuild.qa.reason ? ` (${latestBuild.qa.reason})` : ''}`,
        ...sweepUnresolvedOf(latestBuild.qa)
      })
    }
  }

  return items
}

function extractCityAndArea(opp) {
  const cand = opp?.candidate && typeof opp.candidate === 'object' ? opp.candidate : {}
  const rawAddr =
    (typeof cand.address === 'string' && cand.address.trim()) ||
    (typeof opp?.profile_address === 'string' && opp.profile_address.trim()) ||
    ''
  const nameAndAddr = `${opp?.name || ''} ${opp?.branch || ''} ${rawAddr}`

  let city = typeof cand.city === 'string' && cand.city.trim() ? cand.city.trim() : null
  let area = typeof cand.area === 'string' && cand.area.trim() ? cand.area.trim() : null

  if (!city) {
    if (/hội\s*an|hoi\s*an/i.test(nameAndAddr)) {
      city = 'Hoi An'
    } else if (/đà\s*nẵng|da\s*nang/i.test(nameAndAddr)) {
      city = 'Da Nang'
    } else if (rawAddr.includes(' - ')) {
      const parts = rawAddr
        .split(' - ')
        .map((s) => s.trim())
        .filter(Boolean)
      if (parts.length >= 2) {
        city = parts[parts.length - 2]
        if (parts.length >= 3 && !area) {
          area = parts[parts.length - 3]
        }
      }
    } else if (rawAddr.includes(',')) {
      const parts = rawAddr
        .split(',')
        .map((s) => s.replace(/\b\d{4,6}\b/g, '').trim())
        .filter(Boolean)
      if (parts.length >= 3) {
        city = parts[parts.length - 2]
        if (!area) area = parts[parts.length - 3]
      } else if (parts.length === 2) {
        city = parts[0]
      }
    } else if (/dubai/i.test(nameAndAddr)) {
      city = 'Dubai'
    } else if (opp?.branch && opp.branch.trim()) {
      city = opp.branch.trim()
    }
  }

  if (!area && rawAddr.includes(',')) {
    const parts = rawAddr
      .split(',')
      .map((s) => s.replace(/\b\d{4,6}\b/g, '').trim())
      .filter(Boolean)
    if (parts.length >= 3) {
      area = parts[1]
    }
  }

  return {
    city: city || 'Unspecified',
    area: area || null,
    address: rawAddr || null
  }
}

/**
 * List Website Opportunities across all accounts for `/ops/wo`.
 */
export async function listWoQueue(pool, config, viewerAccount = null) {
  const [{ settings, updatedBy, updatedAt }, keyFacts, uiEnabled] = await Promise.all([
    readWoOpsSettings(pool),
    woProviderKeyFacts(pool, config),
    pool ? uiSwitchOn(pool, 'website-opportunities').catch(() => false) : Promise.resolve(false)
  ])

  const templateStatuses = await readWoTemplateStatuses(pool, settings.pinnedTemplates)

  if (!pool) {
    return {
      origin: config?.origin ?? '',
      uiEnabled,
      viewer: viewerAccount
        ? {
            accountId: viewerAccount.id,
            login: viewerAccount.email?.split('@')[0] ?? 'operator',
            name: viewerAccount.name || viewerAccount.email || 'Operator',
            email: viewerAccount.email ?? ''
          }
        : null,
      members: [],
      cities: [],
      opportunities: [],
      settings,
      settingsMeta: { updatedBy, updatedAt },
      providers: keyFacts.providers,
      templateStatuses
    }
  }

  // /ops stays in Tracy, so it reads the builder's tables directly.
  const journey = journeySql({ allAccounts: true }, demoJourneySql)
  try {
    const [oppRes, jobRes, sourceRes, mediaRes, revRes, buildRes, prefRes, readRes] = await Promise.all([
      pool.query(
        `select o.id, o.account_id, o.name, o.branch, o.provider, o.provider_id,
                  o.candidate, o.status, o.created_at, o.updated_at,
                  ${journey.stage} as customer_stage, ${journey.attention} as customer_attention,
                  lj.state as customer_job_state, da.status as customer_action_state,
                  case when dm.id is not null then jsonb_build_object('state', dm.state,
                    'qa', dm.qa->>'state', 'done', exists(select 1 from site_creation sc
                      where sc.account_id = dm.account_id and sc.build_id = dm.build_id::text
                        and sc.state = 'done' and dm.state <> 'deleted')) end as customer_build,
                  a.email as account_email, a.display_name as account_name,
                  p.profile->>'address' as profile_address,
                  p.profile->'pageSpeed' as page_speed,
                  case when jsonb_typeof(p.profile->'googlePlace') = 'object' then jsonb_build_object(
                    'amenities', case when jsonb_typeof(p.profile->'googlePlace'->'amenities') = 'object'
                      then (select count(*) from jsonb_each(p.profile->'googlePlace'->'amenities') e
                             where e.value = 'true'::jsonb) else 0 end,
                    'reviews', case when jsonb_typeof(p.profile->'googlePlace'->'reviews') = 'array'
                      then jsonb_array_length(p.profile->'googlePlace'->'reviews') else 0 end,
                    'fetchedAt', p.profile->'googlePlace'->>'fetchedAt'
                  ) end as google_place
             from wo_opportunity o
             left join account a on a.id = o.account_id
             left join wo_profile p on p.opportunity_id = o.id
             ${journey.joins}
            order by o.updated_at desc
            limit 250`
      ),
      pool.query(
        `select distinct on (opportunity_id)
                  id, opportunity_id, account_id, kind, request_id, state, stage,
                  progress, lease_owner, lease_token, lease_until, heartbeat_at,
                  attempt, last_error, created_at, updated_at
             from wo_job
            order by opportunity_id, created_at desc, id desc`
      ),
      pool.query(
        `select opportunity_id, source, ref, status, reason, coverage, updated_at
             from wo_source
            order by opportunity_id, source`
      ),
      pool.query(
        `select opportunity_id,
                  count(*)::int as total_count,
                  count(*) filter (where status = 'stored')::int as stored_count,
                  count(*) filter (where status = 'stored' and source = 'google-places')::int as google_photo_count
             from wo_media
            group by opportunity_id`
      ),
      pool.query(
        `select distinct on (opportunity_id)
                  id, opportunity_id, account_id, n, asset_manifest, created_at
             from wo_revision
            order by opportunity_id, n desc`
      ),
      pool.query(
        `select distinct on (r.opportunity_id)
                  b.id, r.opportunity_id, b.revision_id, b.site_key, b.site_job_id,
                  b.state, b.receipt, b.handoff, b.pictures, b.qa, b.qa_lease_until,
                  b.created_at, b.updated_at, b.choice->>'cms' as cms, b.choice->'template' as template
             from wo_build b
             join wo_revision r on r.id = b.revision_id
            order by r.opportunity_id, b.created_at desc, b.id desc`
      ),
      pool.query(`select account_id, cms from wo_preference`),
      viewerAccount?.id
        ? pool.query(
            `select opportunity_id, read_at
                 from ops_wo_read
                where account_id = $1 and read_at is not null`,
            [viewerAccount.id]
          )
        : Promise.resolve({ rows: [] })
    ])

    const jobsByOpp = new Map(jobRes.rows.map((r) => [r.opportunity_id, r]))
    const sourcesByOpp = new Map()
    for (const s of sourceRes.rows) {
      const list = sourcesByOpp.get(s.opportunity_id) ?? []
      list.push(s)
      sourcesByOpp.set(s.opportunity_id, list)
    }
    const mediaByOpp = new Map(
      mediaRes.rows.map((r) => [
        r.opportunity_id,
        { totalCount: r.total_count, storedCount: r.stored_count, googlePhotos: r.google_photo_count ?? 0 }
      ])
    )
    const revByOpp = new Map(revRes.rows.map((r) => [r.opportunity_id, r]))
    const buildByOpp = new Map(buildRes.rows.map((r) => [r.opportunity_id, r]))
    const prefByAccount = new Map(prefRes.rows.map((r) => [r.account_id, r.cms]))
    const readSet = new Set(readRes.rows.map((r) => r.opportunity_id))

    const memberMap = new Map()
    const cityMap = new Map()
    const totalRows = oppRes.rows.length

    const opportunities = oppRes.rows.map((opp, idx) => {
      const latestJob = jobsByOpp.get(opp.id) ?? null
      const sources = sourcesByOpp.get(opp.id) ?? []
      const mediaStats = mediaByOpp.get(opp.id) ?? { totalCount: 0, storedCount: 0 }
      const latestRev = revByOpp.get(opp.id) ?? null
      const latestBuild = buildByOpp.get(opp.id) ?? null
      const candidate = opp.candidate && typeof opp.candidate === 'object' ? opp.candidate : {}

      const lifecycle = deriveOpportunityLifecycle(
        opp,
        latestJob,
        sources,
        mediaStats,
        latestRev,
        latestBuild
      )
      const customer = customerStatus({
        stage: opp.customer_stage,
        jobState: opp.customer_job_state,
        actionState: opp.customer_action_state,
        build: opp.customer_build
      })

      const locationInfo = extractCityAndArea(opp)
      const isRunning = lifecycle.queueState === 'LEASED' || lifecycle.queueState === 'QUEUED'

      const email = opp.account_email || 'unknown'
      const login = email.split('@')[0] || 'user'
      const displayName = opp.account_name || login.charAt(0).toUpperCase() + login.slice(1)

      const memberEntry = memberMap.get(opp.account_id) ?? {
        accountId: opp.account_id,
        login,
        name: displayName,
        email,
        count: 0,
        attentionCount: 0,
        runningCount: 0
      }
      memberEntry.count += 1
      if (opp.customer_attention) memberEntry.attentionCount += 1
      if (isRunning) memberEntry.runningCount += 1
      memberMap.set(opp.account_id, memberEntry)

      const cityEntry = cityMap.get(locationInfo.city) ?? {
        city: locationInfo.city,
        count: 0,
        attentionCount: 0,
        runningCount: 0
      }
      cityEntry.count += 1
      if (opp.customer_attention) cityEntry.attentionCount += 1
      if (isRunning) cityEntry.runningCount += 1
      cityMap.set(locationInfo.city, cityEntry)

      const cms =
        latestBuild?.cms ||
        prefByAccount.get(opp.account_id) ||
        settings.defaultCms ||
        DEFAULT_WO_OPS_SETTINGS.defaultCms
      const templateSlug =
        latestBuild?.template?.quickstart ||
        settings.pinnedTemplates?.[cms] ||
        DEFAULT_WO_OPS_SETTINGS.pinnedTemplates.joomla

      const durationSec = latestJob
        ? Math.max(
            1,
            Math.round(
              (new Date(latestJob.updated_at || Date.now()).getTime() -
                new Date(latestJob.created_at).getTime()) /
                1000
            )
          )
        : 0

      const shortId = opp.id.slice(0, 6)
      const displayNumber = totalRows - idx

      let demoStatus = 'none'
      if (
        latestBuild?.state === 'done' ||
        latestBuild?.state === 'completed' ||
        latestBuild?.state === 'live' ||
        latestBuild?.state === 'ready' ||
        latestBuild?.handoff ||
        opp.status === 'built'
      ) {
        demoStatus = 'live'
      } else if (
        latestBuild?.state === 'uploading' ||
        latestBuild?.state === 'applying' ||
        (latestBuild?.site_key && latestBuild?.pictures && !latestBuild?.handoff)
      ) {
        demoStatus = 'uploading'
      } else if (
        latestBuild?.state === 'requesting' ||
        latestBuild?.state === 'provisioning' ||
        latestBuild?.state === 'building'
      ) {
        demoStatus = 'provisioning'
      } else if (latestBuild?.state === 'failed') {
        demoStatus = 'failed'
      }

      const siteKey = latestBuild?.site_key ?? null
      // `site_key` is the full host (`<label>.<siteDomain>`), so it is the demo's name as it stands.
      const demoSlug = siteKey
      const demoLabel =
        siteKey && config?.siteDomain && siteKey.endsWith(`.${config.siteDomain}`)
          ? siteKey.slice(0, -config.siteDomain.length - 1)
          : null

      const notesParts = []
      if (mediaStats.totalCount > 0) {
        notesParts.push(`${mediaStats.storedCount || mediaStats.totalCount}/${mediaStats.totalCount} photos`)
      }
      if (candidate.rating) {
        notesParts.push(`${candidate.rating}★ (${candidate.reviewCount || candidate.userRatingsTotal || 0})`)
      }
      if (lifecycle.attentionReason) {
        notesParts.unshift(lifecycle.attentionReason)
      }

      const attentionCommand = lifecycle.needsAttention
        ? `Investigate Website Opportunity "${opp.name}" (id: ${opp.id}, user: ${email}, stage: ${lifecycle.stage}): ${lifecycle.attentionReason || lifecycle.statusText}. Check /ops/wo and resolve or force-complete the brief.`
        : null

      const jobErrText = errorTextOf(latestJob?.last_error)

      return {
        id: opp.id,
        number: displayNumber,
        shortId,
        slug: siteKey || shortId,
        name: opp.name,
        city: locationInfo.city,
        area: locationInfo.area,
        address: locationInfo.address,
        branch:
          opp.branch ||
          (locationInfo.area ? `${locationInfo.area}, ${locationInfo.city}` : locationInfo.city),
        placeId: opp.provider_id || null,
        websiteUrl: candidate.website || candidate.websiteUrl || null,
        pageSpeed: opp.page_speed ?? null,
        // Amenities offered, reviews kept and listing photos stored, from the research job's Place Details.
        googlePlace: opp.google_place
          ? { ...opp.google_place, photos: mediaByOpp.get(opp.id)?.googlePhotos ?? 0 }
          : null,
        cms,
        template: templateSlug,
        stage: lifecycle.stage,
        stepNum: lifecycle.stepNum,
        customerStage: opp.customer_stage,
        customerStatus: customer.label,
        customerAttention: opp.customer_attention,
        needsAttention: lifecycle.needsAttention,
        attentionReason: lifecycle.attentionReason,
        attentionCommand,
        researchRollup: lifecycle.researchRollup,
        currentStep: lifecycle.currentStep,
        worker: latestJob?.lease_owner || '—',
        durationSec,
        user: {
          accountId: opp.account_id,
          login,
          name: displayName,
          email
        },
        revId: latestRev ? `rev-${latestRev.id.slice(0, 6)}` : '—',
        revisionNumber: latestRev?.n ?? 0,
        demoSite: demoStatus === 'none' ? null : demoSlug,
        demoUrl: demoLabel ? bornSiteAddress(demoLabel, config) : demoSlug ? `https://${demoSlug}` : null,
        demoStatus,
        queueState: lifecycle.queueState,
        statusText: lifecycle.statusText,
        notes: notesParts.join(' · ') || 'Saved on map',
        read: readSet.has(opp.id),
        createdAt: opp.created_at?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: opp.updated_at?.toISOString?.() ?? new Date().toISOString(),
        builtAt:
          demoStatus === 'live'
            ? (latestBuild?.updated_at?.toISOString?.() ?? opp.updated_at?.toISOString?.() ?? null)
            : null,
        collectors: buildCollectorItems(opp, sources, mediaStats, latestRev, latestBuild),
        execution: latestJob
          ? {
              jobId: latestJob.id,
              kind: latestJob.kind,
              state: latestJob.state,
              stage: latestJob.stage,
              attempt: latestJob.attempt,
              maxAttempts: 3,
              workerId: latestJob.lease_owner,
              leaseUntil: latestJob.lease_until?.toISOString?.() ?? null,
              heartbeatAt: latestJob.heartbeat_at?.toISOString?.() ?? null,
              errorCode: latestJob.last_error?.code ?? null,
              errorMessage: jobErrText
            }
          : null
      }
    })

    const members = [...memberMap.values()].sort(
      (a, b) => b.attentionCount - a.attentionCount || b.runningCount - a.runningCount || b.count - a.count
    )
    const cities = [...cityMap.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))

    return {
      origin: config?.origin ?? '',
      uiEnabled,
      viewer: viewerAccount
        ? {
            accountId: viewerAccount.id,
            login: viewerAccount.email?.split('@')[0] ?? 'operator',
            name: viewerAccount.name || viewerAccount.email || 'Operator',
            email: viewerAccount.email ?? ''
          }
        : null,
      members,
      cities,
      opportunities,
      settings,
      settingsMeta: { updatedBy, updatedAt },
      providers: keyFacts.providers,
      templateStatuses
    }
  } catch {
    return {
      origin: config?.origin ?? '',
      uiEnabled,
      viewer: null,
      members: [],
      cities: [],
      opportunities: [],
      settings,
      settingsMeta: { updatedBy, updatedAt },
      providers: keyFacts.providers,
      templateStatuses
    }
  }
}

/**
 * Mark a Website Opportunity row read or unread for the signed-in operator on `/ops/wo`.
 */
export async function markWoRead(pool, accountId, opportunityId, read) {
  if (!pool || !accountId || !opportunityId) return
  if (read) {
    await pool.query(
      `insert into ops_wo_read (account_id, opportunity_id, read_at)
       values ($1, $2, now())
       on conflict (account_id, opportunity_id) do update set read_at = now()`,
      [accountId, opportunityId]
    )
  } else {
    await pool.query(`delete from ops_wo_read where account_id = $1 and opportunity_id = $2`, [
      accountId,
      opportunityId
    ])
  }
}

/**
 * Toggle the master `website-opportunities` customer surface switch from `/ops/wo` › `Settings`.
 */
export async function saveWoSurfaceSwitch(pool, enabled, updatedBy) {
  await saveUiSwitches(pool, { 'website-opportunities': Boolean(enabled) }, updatedBy)
  return uiSwitchOn(pool, 'website-opportunities')
}

/**
 * Execute an operator recovery action on a Website Opportunity from `/ops/wo`.
 * Supported actions (the first three in `wo-operator-fence.js`: lease first, through the place when shared):
 * - `force-complete-brief`: marks blocked/paused sources `skipped`, completes any stuck job,
 *   creates a synthesized revision if missing, and transitions the opportunity to `ready`.
 * - `reset-cap-resume`: clears today's `wo:apify:*` and `wo:search:*` rate buckets for the owner's
 *   account and re-queues the job.
 * - `reclaim-retry`: clears an expired/failed worker lease and re-queues the job immediately.
 * - `bump-queue`: moves a queued job to the front of the claim order (`updated_at = now() - interval '1 hour'`).
 * - `cancel-job`: cancels an active job and returns the opportunity to `ready`.
 */
export async function runWoOperatorAction(pool, opportunityId, action, operatorEmail) {
  const { rows: oppRows } = await pool.query('select * from wo_opportunity where id = $1 limit 1', [
    opportunityId
  ])
  const opp = oppRows[0]
  if (!opp) {
    return { ok: false, status: 404, error: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found.' }
  }

  // The three that touch research take the job's lease first, and go through the place when shared.
  if (FENCED_ACTIONS.has(action)) return runFencedResearchAction(pool, opp, action, operatorEmail)

  if (action === 'bump-queue') {
    await pool.query(
      `update wo_job
          set updated_at = now() - interval '1 hour'
        where opportunity_id = $1
          and state = 'queued'`,
      [opportunityId]
    )
    return { ok: true, action, opportunityId, status: opp.status }
  }

  if (action === 'cancel-job') {
    await pool.query(
      `update wo_job
          set state = 'cancelled',
              lease_owner = null,
              lease_until = null,
              lease_token = lease_token + 1,
              updated_at = now()
        where opportunity_id = $1
          and state in ('queued', 'running', 'paused', 'blocked')`,
      [opportunityId]
    )
    await pool.query(`update wo_opportunity set status = 'ready', updated_at = now() where id = $1`, [
      opportunityId
    ])
    return { ok: true, action, opportunityId, status: 'ready' }
  }

  return { ok: false, status: 400, error: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` }
}

/** Demo sites by retention state (`opportunities-build/demo-retention.js`); `/ops/settings/wo` counts them. */
export async function readDemoSummary(pool, { now }) {
  const { rows } = await pool.query(
    `select
       count(*) filter (where demo_deleted_at is null and demo_frozen_at is null)::int as live,
       count(*) filter (where demo_deleted_at is null and demo_frozen_at is not null)::int as frozen,
       count(*) filter (where demo_deleted_at is null and demo_frozen_at is null
                          and demo_expires_at > $1 and demo_expires_at <= $2)::int as "expiringSoon",
       count(*) filter (where demo_deleted_at is not null)::int as deleted
     from wo_build where site_key is not null`,
    [new Date(now), new Date(now + 86_400_000)]
  )
  return rows[0]
}
