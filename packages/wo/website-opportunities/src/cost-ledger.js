/**
 * What Tracy pays for shared research (shared research plan P2, table
 * `wo_cost_ledger`, migration 135). Tracy pays for research, not the account (decided 19/10/2026), so
 * the base caps are deployment-wide: `/ops/wo` › researchDailyCapCents for the UTC day and
 * researchJobCapCents for one research job. Editorial attempts may additionally bind an account,
 * a frozen job cap and remaining-work headroom; Research receipt admission stays atomic.
 *
 * RESERVE BEFORE THE CALL (council 19/10): a billable call goes out only after a reservation of its
 * ceiling (`cost-prices.js`) was admitted with spent + held + ceiling <= cap. Every reserve runs under
 * ONE transaction-level advisory lock, so concurrent reserves are serialised and the cap holds exactly.
 * After the call: `settle` with what it cost; `release` only when the call PROVABLY never went out.
 * A call that threw, or a reservation nobody settled within `staleAfterMs`, becomes `unreconciled`
 * and keeps counting at its ceiling: a timeout may still have been billed. Nothing releases it
 * silently; a late `settle` (or an operator) reconciles it.
 *
 * The executor seam is `chargeable(spec, fn)` (`createChargeable`). The call sites P1 must wrap:
 *
 *   ./executor.js (line numbers as of 19/10)
 *   - :226 + :232  the `apifyDaySpent` check and `collectOne` of a paid social source (Apify actor run, `domain/apify.mjs` apifyCollect).
 *               provider 'apify', operation = APIFY_ACTORS[source], maxCents =
 *               apifyCeilingCents(actor, {items: offset + limit, maxChargeUsd: settings.maxChargeUsdPerRun}).
 *               Replaces `apifyDaySpent` (per-account quota) there; a refusal pauses the job with
 *               `reason: 'budget'` like `quota` today. A `blocked` result with `credential_missing`
 *               never sent the call: `notSent()`.
 *               Settle: no per-run cost in the sync dataset answer → ceiling (`actualCents` unset).
 *   - :297      `checkPageSpeed` (PageSpeed Insights). provider 'google', operation 'pagespeed' (0¢, counted).
 *   - :348      `placeFacts` (:341) → `domain.fetchPlaceDetails` (Places Details, Atmosphere mask). provider
 *               'google', operation 'place-details'. Only on a cache miss (the 30-day branch returns first).
 *   - :397      `upgradeFacebookStored` → `domain.upgradeFacebookPhotos`: public photo pages, NO paid
 *               provider. Not wrapped. (apifyCollect calls it too, inside the Apify run's reservation.)
 *   - :526      `placePhotos` (:517) → `domain.fetchPlacePhoto` (Place Photos media call), one per photo.
 *               provider 'google', operation 'place-photo'.
 *   - :463      `mediaRecord` → `domain.fetchLimited` of collected media: plain CDN downloads, not billed. Not wrapped.
 *   the host's demo builder (its site-pictures step)
 *   - :124      `vision.label(...)` (`lib/picture-vision.js` labelWithVision: one model call per batch of 8).
 *               provider 'vision', operation = door.model, maxCents = ceil(pictures / 8) ×
 *               ceilingCents('vision', model); settle at visionCostCents(model, usage).
 *               P1.6 moves this to `wo_media_analysis`; the wrap moves with it.
 *   In P1's place-executor the same calls appear again (Place Details, collectOne, PageSpeed, place
 *   photos): wrap them there, not twice.
 *   Not research, not wrapped here: discovery searches in `route.js` (per-account `searchRunsPerDay`)
 *   and `site-checks.js` PageSpeed (its own hourly cap).
 *
 *   requestKey: give one only when a retry of the SAME attempt must not reserve twice — include the
 *   job's lease token (`<placeJobId>:<leaseToken>:<source>:<offset>`), so a new worker after a lost
 *   lease reserves anew instead of riding a reservation the old worker may already have spent.
 */

export const BUDGET_EXCEEDED = 'BUDGET_EXCEEDED'
/** `pg_advisory_xact_lock` id of the reserve (7_243_001…004, 017…020, 028, 040 are taken). */
const LEDGER_LOCK_ID = 7_243_041
/** An open reservation older than this is unreconciled: an Apify sync run lasts at most ~4.5 min. */
export const DEFAULT_STALE_MS = 30 * 60_000

/** A reserve the caps refused. `scope` is 'day' or 'job'. */
export class BudgetExceededError extends Error {
  /** @param {{scope: 'day' | 'job' | 'account' | 'campaign', capCents: number, committedCents: number, maxCents: number}} refusal */
  constructor(refusal) {
    super(
      `research budget exceeded (${refusal.scope}): ${refusal.committedCents} + ${refusal.maxCents} > ${refusal.capCents} cents`
    )
    this.code = BUDGET_EXCEEDED
    this.scope = refusal.scope
    this.capCents = refusal.capCents
    this.committedCents = refusal.committedCents
    this.maxCents = refusal.maxCents
  }
}

// What one row counts against a cap: a settled call its cost, a released one nothing, an open or
// unreconciled one its ceiling (or more, if a late settle reported more).
export const COMMITTED = `case state
  when 'released' then 0
  when 'settled' then coalesce(actual_cents, reserved_cents)
  else greatest(reserved_cents, coalesce(actual_cents, 0)) end`

/**
 * @typedef {{provider: string, operation: string, maxCents: number, placeId?: string | null,
 *   opportunityId?: string | null, jobId?: string | null, requestKey?: string | null,
 *   accountId?: string | null, accountDailyCapCents?: number, actionId?: string | null,
 *   buildId?: string | null, jobCapCents?: number, prefetchCampaignId?: string | null,
 *   prefetchRequireEnabled?: boolean, expectedLeaseToken?: string | number,
 *   minRemainingCents?: number | ((db: import('pg').PoolClient) => Promise<number>),
 *   purpose?: string | null, payer?: Payer | null}} ChargeSpec
 * @typedef {{kind: 'account' | 'public' | 'operator' | 'campaign' | 'none', accountId?: string | null}} Payer
 *   Who a charge COUNTS against on /ops › Usage (migration 167); never a cap, unlike `accountId`.
 * @typedef {{id: string, budgetDay: string, reservedCents: number, state: string, replayed: boolean}} Reservation
 * @typedef {{ok: true, reservation: Reservation} | {ok: false, code: 'BUDGET_EXCEEDED',
 *   scope: 'day' | 'job' | 'account' | 'campaign', capCents: number, committedCents: number, maxCents: number}} ReserveAnswer
 */

/**
 * @param {{pool: import('pg').Pool, caps: () => Promise<{dailyCapCents: number, jobCapCents: number}>,
 *   now?: () => number, staleAfterMs?: number,
 *   scope?: {accountIds: string[], jobIds: string[]} | null}} deps
 */
export function createCostLedger({
  pool,
  caps,
  now = Date.now,
  staleAfterMs = DEFAULT_STALE_MS,
  scope = null
}) {
  if (
    scope &&
    [scope.accountIds, scope.jobIds].some(
      (ids) =>
        !Array.isArray(ids) ||
        !ids.length ||
        ids.some((id) => !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    )
  )
    throw new TypeError('cost-ledger: invalid mutation scope')
  const accountIds = scope?.accountIds ?? null,
    jobIds = scope?.jobIds ?? null
  const at = () => new Date(now()).toISOString()
  const staleBefore = () => new Date(now() - staleAfterMs).toISOString()

  async function assertLease(db, spec) {
    // Editorial job IDs identify quality intents, not place jobs. Fence only an explicit place lease.
    if (spec.expectedLeaseToken == null) return
    const live = await db.query(
      `select 1 from wo_place_job
      where id=$1 and state='running' and lease_token=$2 and lease_until>clock_timestamp() for share`,
      [spec.jobId, String(spec.expectedLeaseToken)]
    )
    if (!live.rowCount)
      throw Object.assign(new Error('Research lease is no longer active'), { code: 'STALE_LEASE' })
  }

  /** Open reservations past the stale age become unreconciled; never released. */
  async function markStale(db = pool) {
    const { rowCount } = await db.query(
      `update wo_cost_ledger set state = 'unreconciled' where state = 'reserved' and created_at < $1
       and ($2::uuid[] is null or account_id=any($2)) and ($3::uuid[] is null or job_id=any($3))`,
      [staleBefore(), accountIds, jobIds]
    )
    return rowCount ?? 0
  }

  /** @param {ChargeSpec} spec @returns {Promise<ReserveAnswer>} */
  async function reserve(spec, { onAdmitted = null } = {}) {
    if (scope && (!accountIds.includes(spec.accountId) || !jobIds.includes(spec.jobId)))
      throw Object.assign(new Error('cost-ledger: charge outside the allowed scope'), {
        code: 'CHARGE_SCOPE_CONFLICT'
      })
    const { provider, operation, maxCents } = spec
    if (typeof provider !== 'string' || !provider) throw new TypeError('cost-ledger: provider is required')
    if (typeof operation !== 'string' || !operation) throw new TypeError('cost-ledger: operation is required')
    if (!Number.isInteger(maxCents) || maxCents < 0)
      throw new TypeError('cost-ledger: maxCents must be a whole number of cents >= 0')
    const currentCaps = await caps(),
      dailyCapCents = currentCaps.dailyCapCents
    if (spec.jobCapCents !== undefined && (!Number.isInteger(spec.jobCapCents) || spec.jobCapCents < 0))
      throw new TypeError('cost-ledger: invalid frozen job cap')
    const jobCapCents = Math.min(currentCaps.jobCapCents, spec.jobCapCents ?? currentCaps.jobCapCents)
    const accountId = spec.accountId ?? null,
      accountCap = spec.accountDailyCapCents ?? null
    if (accountId && (!Number.isInteger(accountCap) || accountCap < 0))
      throw new TypeError('cost-ledger: an account reservation requires an account cap')
    if (spec.minRemainingCents !== undefined && (!accountId || !spec.jobId || !spec.requestKey))
      throw new TypeError('cost-ledger: remaining-work admission requires account, job and request key')
    const day = utcDay(now())
    const jobId = spec.jobId ?? null
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock($1)', [LEDGER_LOCK_ID])
      await markStale(client)
      if (spec.requestKey) {
        const { rows } = await client.query('select * from wo_cost_ledger where request_key = $1', [
          spec.requestKey
        ])
        if (rows[0]) {
          const previous = rows[0]
          const same =
            previous.provider === provider &&
            previous.operation === operation &&
            previous.reserved_cents === maxCents &&
            (previous.job_id ?? null) === jobId &&
            (previous.account_id ?? null) === accountId &&
            (previous.place_id ?? null) === (spec.placeId ?? null) &&
            (previous.opportunity_id ?? null) === (spec.opportunityId ?? null) &&
            (previous.prefetch_campaign_id ?? null) === (spec.prefetchCampaignId ?? null) &&
            (previous.action_id ?? null) === (spec.actionId ?? null) &&
            (previous.build_id ?? null) === (spec.buildId ?? null)
          if (!same)
            throw Object.assign(new Error('cost-ledger: request key belongs to another charge'), {
              code: 'CHARGE_SCOPE_CONFLICT'
            })
          await assertLease(client, spec)
          if (onAdmitted) await onAdmitted(client, reservationOf(rows[0], true))
          await assertLease(client, spec)
          await client.query('commit')
          return { ok: true, reservation: reservationOf(rows[0], true) }
        }
      }
      // This is an admission forecast, not a reservation for the rest of the workflow.
      const minRemainingCents =
        typeof spec.minRemainingCents === 'function'
          ? await spec.minRemainingCents(client)
          : (spec.minRemainingCents ?? 0)
      if (!Number.isInteger(minRemainingCents) || minRemainingCents < 0)
        throw new TypeError('cost-ledger: minRemainingCents must be a whole number of cents >= 0')
      const admissionCents = maxCents + minRemainingCents
      if (spec.prefetchCampaignId) {
        const campaign = (
          await client.query('select enabled,budget_cents from wo_prefetch_campaign where id=$1 for share', [
            spec.prefetchCampaignId
          ])
        ).rows[0]
        const userJoined =
          spec.jobId &&
          (
            await client.query(
              `select 1 where exists(select 1 from wo_job where place_job_id=$1 and result_snapshot_id is null
            and state in ('queued','running','paused','blocked'))
            or exists(select 1 from wo_place_public_request where place_job_id=$1)`,
              [spec.jobId]
            )
          ).rowCount
        if (!campaign || (!campaign.enabled && spec.prefetchRequireEnabled !== false && !userJoined))
          throw Object.assign(new Error('Prefetch campaign is stopped'), { code: 'PREFETCH_STOPPED' })
        const total = (
          await client.query(
            `select coalesce(sum(${COMMITTED}),0)::int as committed from wo_cost_ledger where prefetch_campaign_id=$1`,
            [spec.prefetchCampaignId]
          )
        ).rows[0].committed
        if (total + admissionCents > campaign.budget_cents) {
          await client.query('commit')
          return {
            ok: false,
            code: BUDGET_EXCEEDED,
            scope: 'campaign',
            capCents: campaign.budget_cents,
            committedCents: total,
            maxCents,
            ...(minRemainingCents ? { minRemainingCents } : {})
          }
        }
      }
      await assertLease(client, spec)
      const { rows: sums } = await client.query(
        `select coalesce(sum(${COMMITTED}) filter (where budget_day = $1), 0)::int as day,
                coalesce(sum(${COMMITTED}) filter (where job_id = $2), 0)::int as job,
                coalesce(sum(${COMMITTED}) filter (where account_id = $3 and budget_day = $1), 0)::int as account
         from wo_cost_ledger where budget_day = $1 or job_id = $2`,
        [day, jobId, accountId]
      )
      const refusal =
        sums[0].day + admissionCents > dailyCapCents
          ? { scope: 'day', capCents: dailyCapCents, committedCents: sums[0].day }
          : jobId && sums[0].job + admissionCents > jobCapCents
            ? { scope: 'job', capCents: jobCapCents, committedCents: sums[0].job }
            : accountId && sums[0].account + admissionCents > accountCap
              ? { scope: 'account', capCents: accountCap, committedCents: sums[0].account }
              : null
      if (refusal) {
        await client.query('commit')
        return {
          ok: false,
          code: BUDGET_EXCEEDED,
          ...refusal,
          maxCents,
          ...(minRemainingCents ? { minRemainingCents } : {})
        }
      }
      const usage = usageColumns(spec)
      const { rows } = await client.query(
        `insert into wo_cost_ledger
           (budget_day, place_id, opportunity_id, job_id, provider, operation, reserved_cents, request_key, created_at,account_id,action_id,build_id${usage.names}${spec.prefetchCampaignId != null ? ',prefetch_campaign_id' : ''})
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9,$10,$11,$12${usage.places(13)}${spec.prefetchCampaignId != null ? `,$${13 + usage.values.length}` : ''}) returning *`,
        [
          day,
          spec.placeId ?? null,
          spec.opportunityId ?? null,
          jobId,
          provider,
          operation,
          maxCents,
          spec.requestKey ?? null,
          at(),
          accountId,
          spec.actionId ?? null,
          spec.buildId ?? null,
          ...usage.values,
          ...(spec.prefetchCampaignId != null ? [spec.prefetchCampaignId] : [])
        ]
      )
      if (onAdmitted) await onAdmitted(client, reservationOf(rows[0], false))
      await assertLease(client, spec)
      await client.query('commit')
      return { ok: true, reservation: reservationOf(rows[0], false) }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * The call happened: count what it cost (its ceiling when `actualCents` is null). Also reconciles
   * an unreconciled one. False when it was already settled or released.
   * @param {Reservation} reservation @param {number | null} [actualCents] @param {string | null} [providerRunId]
   * @param {object | null} [tokens] the provider-reported snapshot (`opportunities/wo-model-tokens.js`); null = none reported
   */
  async function settle(reservation, actualCents = null, providerRunId = null, tokens = null) {
    // Tokens go in the same statement as the cost; a charge without any leaves the column out (older tables too).
    const cost =
      typeof actualCents === 'number' && Number.isFinite(actualCents) && actualCents >= 0
        ? Math.ceil(actualCents)
        : null
    const { rowCount } = await pool.query(
      `update wo_cost_ledger
       set state = 'settled', actual_cents = coalesce($2, reserved_cents),
           provider_run_id = coalesce($3, provider_run_id), settled_at = $4${tokens ? ', tokens = $7::jsonb' : ''}
       where id = $1 and state in ('reserved', 'unreconciled')
         and ($5::uuid[] is null or account_id=any($5)) and ($6::uuid[] is null or job_id=any($6))`,
      [
        reservation.id,
        cost,
        providerRunId,
        at(),
        accountIds,
        jobIds,
        ...(tokens ? [JSON.stringify(tokens)] : [])
      ]
    )
    if (rowCount === 1 && cost !== null) await markReported(reservation.id)
    return rowCount === 1
  }

  /** A cost the provider reported, not a ceiling (`provider-report.js`). A ledger table older than
   *  migration 163 has no such column: the cost still counts, it is only not compared. */
  async function markReported(id) {
    try {
      await pool.query('update wo_cost_ledger set cost_reported = true where id = $1', [id])
    } catch (error) {
      if (error?.code !== '42703') throw error
    }
  }

  /**
   * The call provably never went out: the reservation counts nothing. Refused once it is settled,
   * unreconciled, or past the stale age (by then nobody can prove the call did not happen).
   * @param {Reservation} reservation
   */
  async function release(reservation) {
    const { rowCount } = await pool.query(
      `update wo_cost_ledger set state = 'released', settled_at = $2
       where id = $1 and state = 'reserved' and created_at >= $3
         and ($4::uuid[] is null or account_id=any($4)) and ($5::uuid[] is null or job_id=any($5))`,
      [reservation.id, at(), staleBefore(), accountIds, jobIds]
    )
    return rowCount === 1
  }

  /** The call threw after it may have gone out: keep counting its ceiling until reconciled. */
  async function unreconcile(reservation) {
    const { rowCount } = await pool.query(
      `update wo_cost_ledger set state = 'unreconciled' where id = $1 and state = 'reserved'
         and ($2::uuid[] is null or account_id=any($2)) and ($3::uuid[] is null or job_id=any($3))`,
      [reservation.id, accountIds, jobIds]
    )
    return rowCount === 1
  }

  /**
   * One UTC day's research cost, of the whole deployment or of one place.
   * @param {{day?: string, placeId?: string | null}} [query] - `day` as YYYY-MM-DD, today by default
   */
  async function summary({ day = utcDay(now()), placeId = null } = {}) {
    await markStale()
    const { rows } = await pool.query(
      `select
         coalesce(sum(coalesce(actual_cents, reserved_cents)) filter (where state = 'settled'), 0)::int as spent,
         coalesce(sum(reserved_cents) filter (where state = 'reserved'), 0)::int as reserved,
         coalesce(sum(${COMMITTED}) filter (where state = 'unreconciled'), 0)::int as unreconciled,
         count(*) filter (where state <> 'released')::int as calls
       from wo_cost_ledger where budget_day = $1 and ($2::uuid is null or place_id = $2)`,
      [day, placeId]
    )
    const { dailyCapCents } = await caps()
    const r = rows[0]
    return {
      day,
      placeId,
      spentCents: r.spent,
      reservedCents: r.reserved,
      unreconciledCents: r.unreconciled,
      totalCents: r.spent + r.reserved + r.unreconciled,
      calls: r.calls,
      capCents: dailyCapCents
    }
  }

  /** Global money remains shared even when this instance can mutate only one pilot's receipts. */
  async function headroom({ jobId, accountId, accountDailyCapCents, jobCapCents }) {
    const limits = await caps(),
      day = utcDay(now())
    const r = (
      await pool.query(
        `select
      coalesce(sum(${COMMITTED}) filter(where budget_day=$1),0)::float8 as day,
      coalesce(sum(${COMMITTED}) filter(where job_id=$2),0)::float8 as job,
      coalesce(sum(${COMMITTED}) filter(where budget_day=$1 and account_id=$3),0)::float8 as account
      from wo_cost_ledger where budget_day=$1 or job_id=$2`,
        [day, jobId, accountId]
      )
    ).rows[0]
    const effectiveJobCap = Math.min(limits.jobCapCents, jobCapCents ?? limits.jobCapCents)
    return {
      day,
      committedCents: r,
      limits: { ...limits, jobCapCents: effectiveJobCap, accountDailyCapCents },
      availableCents: Math.max(
        0,
        Math.min(limits.dailyCapCents - r.day, effectiveJobCap - r.job, accountDailyCapCents - r.account)
      )
    }
  }

  return { reserve, settle, release, unreconcile, summary, markStale, headroom }
}

/**
 * Reserve, call, settle. `fn` gets a handle whose `notSent()` says the call never went out (a missing
 * credential, a refused URL): if `fn` then throws, the reservation is released; any other throw
 * keeps it as unreconciled. The settled cost is `spec.actualCents(result)`, or the ceiling when that
 * is absent or answers null. Over a cap: throws `BudgetExceededError` and `fn` is never called.
 *
 * @template T
 * @param {ReturnType<typeof createCostLedger>} ledger
 * @param {ChargeSpec & {actualCents?: (result: T) => number | null | undefined,
 *   providerRunId?: (result: T) => string | null | undefined, tokens?: (result: T) => object | null}} spec
 * @param {(charge: {notSent: () => void}) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withCharge(ledger, spec, fn) {
  const answer = await ledger.reserve(spec)
  if (!answer.ok) throw new BudgetExceededError(answer)
  const { reservation } = answer
  if (reservation.replayed && reservation.state !== 'reserved')
    throw Object.assign(
      new Error(`cost-ledger: reservation ${spec.requestKey} is already ${reservation.state}`),
      {
        code: 'CHARGE_SPENT'
      }
    )
  let sent = true
  let result
  try {
    result = await fn({ notSent: () => (sent = false) })
  } catch (error) {
    await (sent ? ledger.unreconcile(reservation) : ledger.release(reservation))
    throw error
  }
  if (!sent) {
    await ledger.release(reservation)
    return result
  }
  await ledger.settle(
    reservation,
    spec.actualCents?.(result) ?? null,
    spec.providerRunId?.(result) ?? null,
    spec.tokens?.(result) ?? null
  )
  return result
}

/**
 * The executor seam: `chargeable(spec, fn)` = `withCharge` bound to one ledger. With no ledger (a
 * deployment without a database, a test that does not measure cost) calls go out uncounted.
 * @param {ReturnType<typeof createCostLedger> | null} ledger
 */
export function createChargeable(ledger) {
  if (!ledger) return (_spec, fn) => fn({ notSent: () => {} })
  return (spec, fn) => withCharge(ledger, spec, fn)
}

/** The caps a ledger reads, from `woRuntime`'s settings (`/ops/wo`), read on every reserve. */
export function capsFromRuntime(runtime) {
  return async () => {
    const { settings } = await runtime()
    return { dailyCapCents: settings.researchDailyCapCents, jobCapCents: settings.researchJobCapCents }
  }
}

/** The migration-167 columns of a charge that names its payer or purpose; none for the others (older tables too). */
function usageColumns(spec) {
  const payer = spec.payer ?? null
  if (!payer && !spec.purpose) return { names: '', values: [], places: () => '' }
  const values = [spec.purpose ?? null, payer?.kind ?? null, payer?.accountId ?? null]
  return {
    names: ',purpose,payer,payer_account_id',
    values,
    places: (from) => values.map((_, i) => `,$${from + i}`).join('')
  }
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function reservationOf(row, replayed) {
  return {
    id: row.id,
    budgetDay: typeof row.budget_day === 'string' ? row.budget_day : utcDayOfDate(row.budget_day),
    reservedCents: row.reserved_cents,
    state: row.state,
    replayed
  }
}

// node-postgres parses `date` into a local-midnight Date; read its calendar fields back, not UTC.
function utcDayOfDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
