/** A paid social run outlives its queue lease. Starting without a receipt is never retried. */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from './domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from './wo-settings.js'
import { createCostLedger } from './cost-ledger.js'
import { startSocialAttempt } from './social-alias.js'

const API = 'https://api.apify.com/v2'
const ID = /^[a-zA-Z0-9]{10,32}$/
const ACTIVE = new Set(['planned', 'reserved', 'starting', 'running', 'start_uncertain', 'publishing'])
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'])
const MAX_BYTES = 2 * 1024 * 1024

export const hasSocialApifyAttempt = (row) => ACTIVE.has(row?.apify_attempt?.phase)
export const uncertainSocialApifyAttempt = (row) =>
  ['starting', 'start_uncertain'].includes(row?.apify_attempt?.phase)

/** Transport is fixed-host, bounded, nonredirecting; provider error bodies never enter our logs. */
async function request(fetchImpl, path, token, { method = 'GET', body } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    redirect: 'error',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok || res.redirected) throw new Error(`APIFY_HTTP_${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('APIFY_BODY')
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('APIFY_SIZE')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/**
 * One step of the existing shared profile queue. `reserveStart` holds the provider/account start
 * quota; `budgetRefused` tells the caller to defer the whole chain. Polls do not spend start units.
 */
export async function fetchSocialApify({
  row,
  lease,
  pool,
  runtime,
  dom,
  fetchImpl,
  now,
  reserveStart,
  budgetRefused,
  admitAlias = async () => true,
  aliasKey = null,
  refundStart = async () => {}
}) {
  const { SOCIAL_APIFY } = await import(
    pathToFileURL(`${WO_DOMAIN_DIR}/social-stats/apify-profiles.mjs`).href
  )
  const spec = SOCIAL_APIFY[row.network]
  const budget = `${row.network}-apify`
  const fail = (code = 'provider_error') =>
    new dom.SocialStatsError(code, 'apify: social stats unavailable', { provider: 'apify' })
  const pending = () => Object.assign(fail(), { apifyPending: true })
  const lost = () => Object.assign(fail(), { apifyLeaseLost: true })
  const { keys, settings } = await runtime()
  if (!keys?.apify) throw fail('credential_missing')
  if (!((settings?.socialStatsProviderDailyCap?.[budget] ?? 0) > 0)) {
    budgetRefused()
    throw fail()
  }
  if (!spec) throw fail('schema_error')
  const ledger = createCostLedger({
    pool,
    now,
    caps: async () => {
      const { settings: current } = await runtime()
      return {
        dailyCapCents: current?.researchDailyCapCents ?? DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents,
        jobCapCents: current?.researchJobCapCents ?? DEFAULT_WO_OPS_SETTINGS.researchJobCapCents
      }
    }
  })
  let attempt = row.apify_attempt
  const checkpoint = async (next, phase = attempt.phase) => {
    const { rowCount } = await pool.query(
      `update wo_social_stat set apify_attempt = $3
       where stat_key = $1 and lease_token = $2 and status = 'queued' and lease_until > $4
         and apify_attempt->>'id' = $5 and apify_attempt->>'phase' = $6`,
      [row.stat_key, lease.token, next, new Date(now()), attempt.id, phase]
    )
    if (rowCount !== 1) throw lost()
    attempt = next
  }
  if (!hasSocialApifyAttempt(row)) {
    const input = spec.input(row.url)
    attempt = {
      id: randomUUID(),
      phase: 'planned',
      actor: spec.actor,
      build: spec.build,
      input,
      url: row.url,
      requestedBy: row.requested_by,
      at: now(),
      maxCents: Math.ceil(spec.maxChargeUsd * 100)
    }
    const { rowCount } = await pool.query(
      `update wo_social_stat set apify_attempt = $3
       where stat_key = $1 and lease_token = $2 and status = 'queued' and lease_until > $4
         and (apify_attempt is null or apify_attempt->>'phase' in ('done', 'failed', 'not_sent'))`,
      [row.stat_key, lease.token, attempt, new Date(now())]
    )
    if (rowCount !== 1) throw lost()
  }
  const target = dom.parseSocialUrl(attempt.url ?? '', { network: row.network })
  const current = dom.parseSocialUrl(row.url ?? '', { network: row.network })
  if (
    !target ||
    target.url.toLowerCase() !== current?.url.toLowerCase() ||
    attempt.actor !== spec.actor ||
    attempt.build !== spec.build ||
    attempt.maxCents !== Math.ceil(spec.maxChargeUsd * 100) ||
    !isDeepStrictEqual(attempt.input, spec.input(attempt.url))
  )
    throw fail('schema_error')

  if (attempt.phase === 'planned') {
    const answer = await ledger.reserve({
      provider: 'apify',
      operation: `social-stats:${spec.actor}`,
      maxCents: attempt.maxCents,
      jobId: attempt.id,
      requestKey: `social-apify:${attempt.id}`
    })
    if (!answer.ok) {
      budgetRefused()
      await checkpoint({ ...attempt, phase: 'not_sent' })
      throw fail()
    }
    await checkpoint({ ...attempt, phase: 'reserved', reservationId: answer.reservation.id })
  }
  const reservation = { id: attempt.reservationId }
  if (!reservation.id) throw fail('schema_error')

  // A late response may have saved the immutable receipt after its worker lost the lease.
  const { rows: receipts } = await pool.query(
    `select provider_run_id, state, budget_day::text as budget_day
     from wo_cost_ledger where id = $1 and request_key = $2`,
    [reservation.id, `social-apify:${attempt.id}`]
  )
  if (!receipts[0]) throw fail()
  if (['starting', 'start_uncertain'].includes(attempt.phase)) {
    const runId = receipts[0].provider_run_id
    if (!ID.test(runId ?? '')) {
      await ledger.unreconcile(reservation)
      await checkpoint({ ...attempt, phase: 'start_uncertain' })
      throw fail()
    }
    await checkpoint({ ...attempt, phase: 'running', runId })
  }
  if (attempt.phase === 'reserved') {
    // A reservation released before a crash is not money held. Yesterday's reservation also
    // cannot pay for a start today. Retire this provably unsent attempt before releasing funds.
    if (
      !['reserved', 'unreconciled'].includes(receipts[0].state) ||
      receipts[0].provider_run_id ||
      receipts[0].budget_day !== new Date(now()).toISOString().slice(0, 10)
    ) {
      await checkpoint({ ...attempt, phase: 'not_sent' })
      if (!receipts[0].provider_run_id) await ledger.release(reservation)
      throw pending()
    }
    if (!(await admitAlias())) {
      await checkpoint({ ...attempt, phase: 'not_sent' })
      await ledger.release(reservation)
      throw Object.assign(fail(), { aliasReused: true })
    }
    if (!(await reserveStart(attempt.requestedBy))) {
      await checkpoint({ ...attempt, phase: 'not_sent' })
      await ledger.release(reservation)
      budgetRefused()
      throw fail()
    }
    const next = { ...attempt, phase: 'starting' }
    if (aliasKey) {
      const admission = await startSocialAttempt({ pool, row, lease, attempt, next, aliasKey, clock: now })
      if (admission === 'lost') throw lost()
      if (admission === 'alias') {
        await checkpoint({ ...attempt, phase: 'not_sent' })
        await ledger.release(reservation)
        await refundStart()
        throw Object.assign(fail(), { aliasReused: true })
      }
      attempt = next
    } else await checkpoint(next)
    let run
    try {
      const q = new URLSearchParams({
        build: spec.build,
        timeout: String(spec.runSecs),
        memory: '512',
        maxTotalChargeUsd: String(spec.maxChargeUsd)
      })
      run = (
        await request(fetchImpl, `/acts/${spec.actor}/runs?${q}`, keys.apify, {
          method: 'POST',
          body: attempt.input
        })
      ).data
      if (!ID.test(run?.id ?? '') || run.actId !== spec.actorId || run.buildId !== spec.buildId)
        throw fail('schema_error')
    } catch {
      await ledger.unreconcile(reservation)
      await checkpoint({ ...attempt, phase: 'start_uncertain' })
      throw fail()
    }
    // A receipt is a fact, not a snapshot write: retain it even if this worker's lease expired.
    const { rowCount } = await pool.query(
      `update wo_cost_ledger set provider_run_id = $2
       where id = $1 and request_key = $3 and (provider_run_id is null or provider_run_id = $2)`,
      [reservation.id, run.id, `social-apify:${attempt.id}`]
    )
    if (rowCount !== 1) throw fail()
    await checkpoint({ ...attempt, phase: 'running', runId: run.id })
  }
  if (attempt.phase !== 'running' || !ID.test(attempt.runId ?? '')) throw fail('schema_error')
  // 0 stops this tier, including reads; the global feature switch also prevents queue claims.
  if (!((settings?.socialStatsProviderDailyCap?.[budget] ?? 0) > 0)) {
    budgetRefused()
    throw fail()
  }
  const run = (await request(fetchImpl, `/actor-runs/${attempt.runId}`, keys.apify)).data
  if (run?.id !== attempt.runId || run.actId !== spec.actorId || run.buildId !== spec.buildId)
    throw fail('schema_error')
  if (!TERMINAL.has(run.status)) {
    if (!['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) throw fail('schema_error')
    if (now() - attempt.at > 10 * 60_000) throw fail('timeout')
    throw pending()
  }
  // Terminal cost can still be provisional. Count the whole provider-side ceiling conservatively.
  await ledger.settle(reservation, null, attempt.runId)
  if (run.status !== 'SUCCEEDED') {
    await checkpoint({ ...attempt, phase: 'failed' })
    throw fail(run.status === 'TIMED-OUT' ? 'timeout' : 'provider_error')
  }
  if (!ID.test(run.defaultDatasetId ?? '')) throw fail('schema_error')
  const items = await request(
    fetchImpl,
    `/datasets/${run.defaultDatasetId}/items?format=json&limit=${spec.datasetLimit}`,
    keys.apify
  )
  let stat
  try {
    stat = spec.map(items, attempt.url, { now: attempt.at })
  } catch (error) {
    await checkpoint({ ...attempt, phase: 'failed' })
    throw error
  }
  // The caller publishes snapshot + done atomically through lease.finish. A crash before that
  // leaves phase=running, so the next lease rereads this dataset instead of paying for another run.
  return { stat, attempt: { ...attempt, phase: 'done' } }
}

// Kept for callers that already imported the original Facebook runner.
export const fetchFacebookApify = fetchSocialApify
