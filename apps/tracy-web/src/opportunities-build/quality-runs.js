/** Durable quality attempts. Once dispatch is committed, an uncertain provider call is never replayed. */
import { randomUUID } from 'node:crypto'
import { qualityHash } from './quality-dossier.js'
import { validateQualityExecutionProfile } from './quality-execution-profile.js'

const refusal = (code) => Object.assign(new Error(code), { code })

export function qualityRunStore({
  pool,
  now = Date.now,
  leaseMs = 240_000,
  externalScope = null,
  retryWindow = null
}) {
  if (externalScope !== null && typeof externalScope !== 'function')
    throw new TypeError('quality-runs: externalScope must be a trusted function')
  if (retryWindow !== null && typeof retryWindow !== 'function')
    throw new TypeError('quality-runs: retryWindow must be a trusted function')
  const checkDeadline = async (db, root, run = null, attempt = null) => {
    if (new Date(root.deadline).getTime() > now()) return
    const window = await retryWindow?.({ db, root, run, attempt })
    if (!window || new Date(window.deadline).getTime() <= now()) throw refusal('QUALITY_RUN_DEADLINE')
  }
  const at = () => new Date(now())
  const transaction = async (fn) => {
    const db = await pool.connect()
    try {
      await db.query('begin')
      const answer = await fn(db)
      await db.query('commit')
      return answer
    } catch (e) {
      await db.query('rollback').catch(() => {})
      throw e
    } finally {
      db.release()
    }
  }
  async function prepare({
    accountId,
    opportunityId,
    revisionId,
    actionId = null,
    parentRunId = null,
    intentId,
    input,
    policy
  }) {
    if (
      !Number.isInteger(policy?.maxAttempts) ||
      policy.maxAttempts < 1 ||
      policy.maxAttempts > 64 ||
      !Number.isInteger(policy?.accountDailyCapCents) ||
      policy.accountDailyCapCents < 0
    )
      throw refusal('QUALITY_POLICY_INVALID')
    const root = (
      await pool.query(
        'select * from wo_quality_intent where id=$1 and account_id=$2 and opportunity_id=$3',
        [intentId, accountId, opportunityId]
      )
    ).rows[0]
    if (!root) throw refusal('QUALITY_INTENT_NOT_FOUND')
    // Limits are frozen by the first accepted input. A settings refresh can only reduce access
    // through checkAllowed; it cannot give this intent another allowance.
    if (qualityHash(root.policy) !== qualityHash(policy)) throw refusal('QUALITY_POLICY_CHANGED')
    const inputHash = qualityHash(input)
    const { rows } = await pool.query(
      `insert into wo_quality_run
      (account_id,opportunity_id,revision_id,action_id,parent_run_id,input_hash,input,policy,intent_id)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
      on conflict (account_id,revision_id) do nothing returning *`,
      [
        accountId,
        opportunityId,
        revisionId,
        actionId,
        parentRunId,
        inputHash,
        JSON.stringify(input),
        JSON.stringify(policy),
        intentId
      ]
    )
    const row =
      rows[0] ??
      (
        await pool.query('select * from wo_quality_run where account_id=$1 and revision_id=$2', [
          accountId,
          revisionId
        ])
      ).rows[0]
    if (
      !row ||
      row.input_hash !== inputHash ||
      qualityHash(row.policy) !== qualityHash(policy) ||
      row.opportunity_id !== opportunityId ||
      row.action_id !== actionId ||
      row.intent_id !== intentId ||
      row.parent_run_id !== parentRunId
    )
      throw refusal('QUALITY_INPUT_CHANGED')
    return row
  }
  async function claim({ runId, accountId, stage, input, modelConfig, actionId = null, buildId = null }) {
    const attemptLeaseMs = modelConfig.executionProfile
      ? (validateQualityExecutionProfile(modelConfig.executionProfile).attemptLeaseMs ?? leaseMs)
      : leaseMs
    return transaction(async (db) => {
      // intent_id is immutable. Resolve it without locking the run, then use the same
      // intent-before-run lock order as cancellation and external dispatch.
      const reference = (
        await db.query('select intent_id from wo_quality_run where id=$1 and account_id=$2', [
          runId,
          accountId
        ])
      ).rows[0]
      if (!reference) throw refusal('QUALITY_RUN_NOT_FOUND')
      const root = (
        await db.query('select * from wo_quality_intent where id=$1 for update', [reference.intent_id])
      ).rows[0]
      if (!root) throw refusal('QUALITY_RUN_NOT_FOUND')
      if (['cancelled', 'failed'].includes(root.state)) throw refusal('QUALITY_RUN_CLOSED')
      await checkDeadline(db, root)
      const run = (
        await db.query('select * from wo_quality_run where id=$1 and account_id=$2 for update', [
          runId,
          accountId
        ])
      ).rows[0]
      if (!run || run.intent_id !== root.id) throw refusal('QUALITY_RUN_NOT_FOUND')
      if (['cancelled', 'failed'].includes(run.state)) throw refusal('QUALITY_RUN_CLOSED')
      const hash = qualityHash({ input, modelConfig })
      let scopeProof = null
      // An in-process authority may attest a separate consumer database. This hook replaces
      // only the two local business-table lookups, before any attempt or ledger mutation.
      if (externalScope) {
        const verified = await externalScope({
          db,
          run,
          root,
          actionId,
          buildId,
          stage,
          input,
          modelConfig,
          phase: 'claim'
        })
        if (verified !== true && verified?.allowed !== true) throw refusal('QUALITY_EXTERNAL_SCOPE')
        scopeProof = verified === true ? true : structuredClone(verified)
      } else if (actionId) {
        const link = (
          await db.query(
            'select 1 from wo_quality_action_link where action_id=$1 and run_id=$2 and account_id=$3',
            [actionId, run.id, accountId]
          )
        ).rows[0]
        if (!link) throw refusal('QUALITY_ATTEMPT_ACTION_SCOPE')
      }
      if (!externalScope && buildId) {
        const build = (
          await db.query('select 1 from wo_build where id=$1 and revision_id=$2 and account_id=$3', [
            buildId,
            run.revision_id,
            accountId
          ])
        ).rows[0]
        if (!build) throw refusal('QUALITY_ATTEMPT_BUILD_SCOPE')
      }
      if (stage === 'c-schema-repair') {
        const previous = (
          await db.query('select input_hash from wo_quality_attempt where intent_id=$1 and stage=$2', [
            root.id,
            stage
          ])
        ).rows[0]
        if (previous && previous.input_hash !== hash) throw refusal('QUALITY_SCHEMA_REPAIR_LIMIT')
      }
      const overdue = (
        await db.query(
          `update wo_quality_attempt set state='uncertain',error='PROVIDER_RECEIPT_MISSING',updated_at=$2
         where intent_id=$1 and state='running' and lease_until<=$2 returning reservation_id`,
          [root.id, at()]
        )
      ).rows
        .map((a) => a.reservation_id)
        .filter(Boolean)
      if (overdue.length)
        await db.query(
          "update wo_cost_ledger set state='unreconciled' where id=any($1::uuid[]) and account_id=$2 and job_id=$3 and state='reserved'",
          [overdue, run.account_id, root.id]
        )
      const uncertain = (
        await db.query("select * from wo_quality_attempt where intent_id=$1 and state='uncertain' limit 1", [
          root.id
        ])
      ).rows[0]
      if (uncertain) {
        const cached = (
          await db.query(
            "select * from wo_quality_attempt where intent_id=$1 and stage=$2 and input_hash=$3 and state in ('succeeded','failed')",
            [root.id, stage, hash]
          )
        ).rows[0]
        if (cached && Number.isFinite(cached.receipt?.costCents)) return { reused: true, attempt: cached }
        return { blocked: 'QUALITY_ATTEMPT_UNCERTAIN', attempt: uncertain }
      }
      await db.query(
        `insert into wo_quality_attempt (run_id,stage,input_hash,input,model_config,intent_id,action_id,build_id)
        values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) on conflict(intent_id,stage,input_hash) do nothing`,
        [runId, stage, hash, JSON.stringify(input), JSON.stringify(modelConfig), root.id, actionId, buildId]
      )
      const old = (
        await db.query(
          'select * from wo_quality_attempt where intent_id=$1 and stage=$2 and input_hash=$3 for update',
          [root.id, stage, hash]
        )
      ).rows[0]
      if (old.state === 'succeeded' || (old.state === 'failed' && Number.isFinite(old.receipt?.costCents)))
        return { reused: true, attempt: old }
      if (old.state !== 'pending')
        return {
          blocked: old.state === 'running' ? 'QUALITY_ATTEMPT_BUSY' : 'QUALITY_ATTEMPT_CLOSED',
          attempt: old
        }
      if (old.lease_until && new Date(old.lease_until).getTime() > now())
        return { blocked: 'QUALITY_ATTEMPT_BUSY', attempt: old }
      const used = (
        await db.query('select count(*)::int as n from wo_quality_attempt where intent_id=$1', [root.id])
      ).rows[0].n
      if (used > run.policy.maxAttempts) throw refusal('QUALITY_ATTEMPT_LIMIT')
      const { rows } = externalScope
        ? await db.query(
            `update wo_quality_attempt set lease_token=lease_token+1,lease_until=$2,updated_at=$3,
             action_id=$4,build_id=$5 where id=$1 returning *`,
            [old.id, new Date(now() + attemptLeaseMs), at(), actionId, buildId]
          )
        : await db.query(
            `update wo_quality_attempt set lease_token=lease_token+1,lease_until=$2,updated_at=$3 where id=$1 returning *`,
            [old.id, new Date(now() + attemptLeaseMs), at()]
          )
      if (
        externalScope &&
        (await externalScope({
          db,
          run,
          root,
          actionId,
          buildId,
          stage,
          input,
          modelConfig,
          attempt: rows[0],
          claimProof: scopeProof,
          phase: 'claimed'
        })) !== true
      )
        throw refusal('QUALITY_EXTERNAL_SCOPE')
      return { reused: false, attempt: rows[0] }
    })
  }
  async function writeDispatch(db, attempt, reservation) {
    const { rowCount } = await db.query(
      `update wo_quality_attempt set state='running',reservation_id=$4,updated_at=$5
      where id=$1 and lease_token=$2 and state='pending' and lease_until>$3
        and exists(select 1 from wo_cost_ledger l join wo_quality_run r on r.id=wo_quality_attempt.run_id
          where l.id=$4 and l.state='reserved' and l.account_id=r.account_id and l.job_id=r.intent_id
          and l.provider=wo_quality_attempt.model_config->>'providerId')`,
      [attempt.id, attempt.lease_token, at(), reservation.id, at()]
    )
    if (rowCount !== 1) throw refusal('QUALITY_ATTEMPT_LEASE_LOST')
  }
  async function dispatch(attempt, reservation) {
    if (!externalScope) return writeDispatch(pool, attempt, reservation)
    return transaction(async (db) => {
      // Cancellation locks this same intent before changing any of its runs. Keep the lock
      // through scope validation and dispatch so a Stop committed first cannot be rebased.
      const held = (
        await db.query(
          `select a.*,to_jsonb(r) as scope_run,to_jsonb(i) as scope_root
           from wo_quality_attempt a join wo_quality_run r on r.id=a.run_id
           join wo_quality_intent i on i.id=r.intent_id where a.id=$1 for update of i`,
          [attempt.id]
        )
      ).rows[0]
      if (
        !held ||
        held.state !== 'pending' ||
        String(held.lease_token) !== String(attempt.lease_token) ||
        new Date(held.lease_until).getTime() <= now()
      )
        throw refusal('QUALITY_ATTEMPT_LEASE_LOST')
      const run = held.scope_run,
        root = held.scope_root
      if (['cancelled', 'failed'].includes(run.state) || ['cancelled', 'failed'].includes(root.state))
        throw refusal('QUALITY_RUN_CLOSED')
      await checkDeadline(db, root, run, held)
      if (
        (await externalScope({
          db,
          run,
          root,
          actionId: held.action_id,
          buildId: held.build_id,
          stage: held.stage,
          attempt: held,
          phase: 'dispatch'
        })) !== true
      )
        throw refusal('QUALITY_EXTERNAL_SCOPE')
      await checkDeadline(db, root, run, held)
      await writeDispatch(db, attempt, reservation)
    })
  }
  async function finish(attempt, { state = 'succeeded', result = null, receipt = null, error = null }) {
    // A provider response can reconcile its OWN uncertain attempt, never a different attempt.
    const { rowCount } = await pool.query(
      `update wo_quality_attempt set state=$3,result=$4::jsonb,receipt=$5::jsonb,error=$6,lease_until=null,updated_at=$7
      where id=$1 and lease_token=$2 and state in ('running','uncertain')`,
      [attempt.id, attempt.lease_token, state, JSON.stringify(result), JSON.stringify(receipt), error, at()]
    )
    if (rowCount !== 1) throw refusal('QUALITY_ATTEMPT_LEASE_LOST')
  }
  async function artifact(runId, accountId, key, value) {
    if (!/^[a-z][a-z0-9:-]{0,150}$/.test(key)) throw refusal('QUALITY_ARTIFACT_KEY')
    const { rowCount } = await pool.query(
      `update wo_quality_run set artifacts=artifacts || jsonb_build_object($3::text,$4::jsonb),updated_at=$5
      where id=$1 and account_id=$2 and state not in ('cancelled','failed')
      and (not artifacts ? $3 or artifacts->$3 = $4::jsonb)`,
      [runId, accountId, key, JSON.stringify(value), at()]
    )
    if (rowCount !== 1) throw refusal('QUALITY_RUN_CLOSED')
  }
  async function takeRepair(runId, accountId, findingHash) {
    return transaction(async (db) => {
      const r = (
        await db.query(
          `select i.* from wo_quality_run r join wo_quality_intent i on i.id=r.intent_id
          where r.id=$1 and r.account_id=$2 and r.state not in ('cancelled','failed') for update of i`,
          [runId, accountId]
        )
      ).rows[0]
      if (!r || ['cancelled', 'failed'].includes(r.state)) throw refusal('QUALITY_RUN_CLOSED')
      await checkDeadline(db, r)
      const key = `repair:${findingHash}`
      if (r.repairs[key]) return r.repairs[key]
      if (r.repair_count >= 2) throw refusal('QUALITY_REPAIR_LIMIT')
      const repair = { id: randomUUID(), n: r.repair_count + 1, findingHash }
      await db.query(
        `update wo_quality_intent set repair_count=repair_count+1,repairs=repairs || jsonb_build_object($2::text,$3::jsonb) where id=$1`,
        [r.id, key, JSON.stringify(repair)]
      )
      return repair
    })
  }
  async function cancel(runId, accountId) {
    await transaction(async (db) => {
      const r = (
        await db.query('select intent_id from wo_quality_run where id=$1 and account_id=$2', [
          runId,
          accountId
        ])
      ).rows[0]
      if (!r) throw refusal('QUALITY_RUN_NOT_FOUND')
      await db.query("update wo_quality_intent set state='cancelled' where id=$1", [r.intent_id])
      await db.query("update wo_quality_run set state='cancelled',updated_at=$2 where intent_id=$1", [
        r.intent_id,
        at()
      ])
    })
  }
  return { prepare, claim, dispatch, finish, artifact, takeRepair, cancel }
}

/** The callback returns usage even when JSON validation fails: that call was still billed. */
export async function runQualityAttempt({
  store,
  ledger,
  run,
  stage,
  input,
  modelConfig,
  maxCents,
  checkAllowed,
  checkBudget = async () => {},
  onPaid = async () => {},
  call,
  actualCents,
  actionId = null,
  buildId = null
}) {
  await checkAllowed()
  const held = await store.claim({
    runId: run.id,
    accountId: run.account_id,
    stage,
    input,
    modelConfig,
    actionId,
    buildId
  })
  if (held.reused) {
    if (held.attempt.reservation_id && Number.isFinite(held.attempt.receipt?.costCents))
      await ledger.settle(
        { id: held.attempt.reservation_id },
        held.attempt.receipt.costCents,
        held.attempt.receipt.requestId ?? null
      )
    await onPaid(held.attempt)
    if (held.attempt.error) throw refusal(held.attempt.error)
    return { ...held.attempt.result, reused: true }
  }
  if (held.blocked) throw refusal(held.blocked)
  const attempt = held.attempt
  const budgetAdmission = await checkBudget({ attempt, maxCents, modelConfig })
  const reserved = await ledger.reserve({
    provider: modelConfig.providerId,
    operation: `quality:${stage}`,
    maxCents,
    ...(budgetAdmission?.minRemainingCents !== undefined
      ? { minRemainingCents: budgetAdmission.minRemainingCents }
      : {}),
    accountId: run.account_id,
    accountDailyCapCents: run.policy.accountDailyCapCents,
    jobCapCents: run.policy.jobCapCents,
    jobId: run.intent_id,
    opportunityId: run.opportunity_id,
    actionId: actionId ?? run.action_id,
    buildId,
    // A pre-dispatch cancellation can release a reservation. A new fence must reserve again,
    // including when it resumes on a new UTC budget day; it cannot spend a released old hold.
    requestKey: `quality:${attempt.id}:${attempt.lease_token}`
  })
  if (!reserved.ok) throw refusal(reserved.code)
  if (reserved.reservation.state !== 'reserved') throw refusal('QUALITY_RESERVATION_CLOSED')
  try {
    await checkAllowed()
    await store.dispatch(attempt, reserved.reservation)
  } catch (e) {
    await ledger.release(reserved.reservation)
    throw e
  }
  let answer
  try {
    answer = await call()
  } catch (e) {
    await ledger.unreconcile(reserved.reservation)
    await store.finish(attempt, { state: 'uncertain', error: e?.code ?? 'QUALITY_PROVIDER_UNCERTAIN' })
    throw e
  }
  const cost = actualCents(answer)
  if (!Number.isFinite(cost) || cost < 0) {
    await ledger.unreconcile(reserved.reservation)
    await store.finish(attempt, {
      state: 'uncertain',
      receipt: answer.receipt,
      error: 'QUALITY_USAGE_UNKNOWN'
    })
    throw refusal('QUALITY_USAGE_UNKNOWN')
  }
  // If the receipt fails to persist, the next worker reconciles; it never sends another call.
  const error = cost > maxCents ? 'QUALITY_COST_CEILING_EXCEEDED' : answer.error
  await store.finish(attempt, {
    state: error ? 'failed' : 'succeeded',
    result: answer,
    receipt: { ...answer.receipt, costCents: cost },
    error: error ?? null
  })
  await ledger.settle(reserved.reservation, cost, answer.receipt?.requestId ?? null)
  await onPaid({
    ...attempt,
    reservation_id: reserved.reservation.id,
    state: error ? 'failed' : 'succeeded',
    receipt: { ...answer.receipt, costCents: cost }
  })
  if (error) throw refusal(error)
  return answer
}
