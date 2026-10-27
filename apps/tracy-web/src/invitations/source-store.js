import { createHash, randomUUID } from 'node:crypto'
import { sourceError, validateSourcePage, safeSourceVersion } from './source-contract.js'
import { SOURCE_FIXTURE_IDS } from './source-fixtures.js'

export function sourceDigest(value) {
  const canonical = (entry) =>
    Array.isArray(entry)
      ? `[${entry.map(canonical).join(',')}]`
      : entry && typeof entry === 'object'
        ? `{${Object.keys(entry)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(entry[key])}`)
            .join(',')}}`
        : JSON.stringify(entry)
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function scopeView(row) {
  return {
    scopeId: row.id,
    revision: Number(row.revision),
    status: row.status,
    reasons: row.reasons,
    fenceCursor: row.fence_cursor,
    cursor: row.cursor,
    completedAt: row.completed_at?.toISOString() ?? null
  }
}

/** Shared program lock first. No source adapter is ever called in this transaction. */
export async function sourceTransaction(pool, action, { readOnly = false } = {}) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(
      "set local statement_timeout='10000'; set local lock_timeout='5000'; set local idle_in_transaction_session_timeout='15000'"
    )
    await db.query(
      readOnly ? 'select pg_advisory_xact_lock_shared(7243080)' : 'select pg_advisory_xact_lock(7243080)'
    )
    const now = (await db.query('select clock_timestamp() as now')).rows[0].now.toISOString()
    const result = await action(db, now)
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}

export async function lockSourceCampaigns(db, scopeId) {
  const rows = (
    await db.query(
      `select * from invitations_sandbox_campaign where data->'sourceCheck'->>'scopeId'=$1 order by id for update`,
      [scopeId]
    )
  ).rows
  if (rows.length > 100 || rows.reduce((sum, row) => sum + row.data.recipients.length, 0) > 20000)
    throw sourceError('source_transaction_limit', 409)
  return rows
}

export async function beginSourceRun({
  pool,
  campaignId,
  actor,
  revision,
  fixtureId,
  requestKey,
  requestDigest
}) {
  if (!SOURCE_FIXTURE_IDS.includes(fixtureId)) throw sourceError('source_fixture_unknown')
  if (
    typeof requestKey !== 'string' ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(requestKey) ||
    typeof requestDigest !== 'string'
  )
    throw sourceError('source_request_invalid')
  return sourceTransaction(pool, async (db, now) => {
    const campaign = (await db.query('select * from invitations_sandbox_campaign where id=$1', [campaignId]))
      .rows[0]
    if (!campaign) throw sourceError('not_found', 404)
    const scopeId = campaign.data.sourceCheck?.scopeId
    if (!scopeId) throw sourceError('source_check_required', 409)
    const scope = (await db.query('select * from invitations_source_scope where id=$1 for update', [scopeId]))
      .rows[0]
    await lockSourceCampaigns(db, scopeId)
    const replay = (
      await db.query(
        'select * from invitations_source_run where campaign_id=$1 and actor=$2 and request_key=$3',
        [campaignId, actor, requestKey]
      )
    ).rows[0]
    if (replay) {
      if (replay.request_digest !== requestDigest || replay.fixture_id !== fixtureId)
        throw sourceError('source_request_conflict', 409)
      if (replay.status === 'superseded') throw sourceError('source_run_superseded', 409)
      return replay
    }
    if (
      (
        await db.query(
          "select 1 from invitations_source_run where scope_id=$1 and status in ('pending','failed') and terminal=false limit 1",
          [scopeId]
        )
      ).rowCount
    )
      throw sourceError('source_sync_busy', 409)
    if (campaign.revision !== revision) throw sourceError('stale_revision', 409)
    const versionBase = Number(
      (
        await db.query(
          'select coalesce(max(source_version),0)+1 as version from invitations_source_observation where scope_id=$1',
          [scopeId]
        )
      ).rows[0].version
    )
    if (!safeSourceVersion(versionBase)) throw sourceError('source_version_invalid', 409)
    await db.query(
      "update invitations_source_run set status='superseded' where scope_id=$1 and terminal=true and status='failed'",
      [scopeId]
    )
    const state =
      scope.completed_at && scope.status === 'ready'
        ? {
            phase: 'changes',
            token: scope.cursor,
            fenceCursor: scope.fence_cursor,
            coverage: [],
            visited: [],
            snapshotComplete: true
          }
        : {
            phase: 'snapshot',
            token: null,
            fenceCursor: null,
            coverage: [],
            visited: [],
            snapshotComplete: false
          }
    return (
      await db.query(
        `insert into invitations_source_run(id,scope_id,campaign_id,actor,request_key,request_digest,fixture_id,anchor,version_base,state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [
          randomUUID(),
          scopeId,
          campaignId,
          actor,
          requestKey,
          requestDigest,
          fixtureId,
          now,
          versionBase,
          state
        ]
      )
    ).rows[0]
  })
}

export async function readSourceState(db, scopeId, subjectKeys) {
  const scope = (await db.query('select * from invitations_source_scope where id=$1', [scopeId])).rows[0]
  if (!scope) throw sourceError('source_scope_missing', 409)
  const current = (
    await db.query(
      `select o.payload from invitations_source_current c join invitations_source_observation o on o.id=c.observation_id where c.scope_id=$1 and ($2::text[] is null or c.subject_key=any($2::text[])) order by c.source,c.subject_key`,
      [scopeId, subjectKeys ?? null]
    )
  ).rows.map((row) => row.payload)
  return { scope: scopeView(scope), current, factsRevision: Number(scope.revision) }
}

export async function linkedSourceKeys(db, identities) {
  return (
    await db.query(
      `with recursive linked(identity) as (select unnest($1::text[]) union select case when a.a=l.identity then a.b else a.a end from linked l join invitations_sandbox_alias a on a.a=l.identity or a.b=l.identity) select identity from linked order by identity`,
      [identities]
    )
  ).rows.map((row) => row.identity)
}

function negative(observation) {
  const fact = observation.fact
  if (fact?.status !== 'known') return false
  return (
    (observation.source === 'marketingBasis' && fact.value === 'denied') ||
    (observation.source === 'amember' && fact.value?.globalUnsubscribed === true) ||
    (observation.source === 'sendy' &&
      ['unsubscribed', 'bounced', 'complained'].includes(fact.value?.state)) ||
    (observation.source === 'tracy' && fact.value?.suppressed === true)
  )
}

export async function applySourcePage({ pool, runId, page, onFactsChanged = async () => {} }) {
  validateSourcePage(page)
  const digest = sourceDigest(page)
  return sourceTransaction(pool, async (db, now) => {
    const run = (await db.query('select * from invitations_source_run where id=$1 for update', [runId]))
      .rows[0]
    if (!run) throw sourceError('source_run_missing', 404)
    if (run.status === 'superseded') throw sourceError('source_run_superseded', 409)
    const scope = (
      await db.query('select * from invitations_source_scope where id=$1 for update', [run.scope_id])
    ).rows[0]
    const affectedCampaigns = await lockSourceCampaigns(db, scope.id)
    const tokenKey = JSON.stringify(page.inputToken)
    const replay = (
      await db.query(
        'select * from invitations_source_page where run_id=$1 and phase=$2 and input_token=$3',
        [run.id, page.phase, tokenKey]
      )
    ).rows[0]
    if (replay) {
      if (replay.digest !== digest) throw sourceError('source_page_conflict', 409)
      return { replayed: true, scope: scopeView(scope) }
    }
    if (run.terminal || run.status === 'ready') throw sourceError('source_run_closed', 409)
    const state = run.state
    if (
      state.phase !== page.phase ||
      state.token !== page.inputToken ||
      (state.fenceCursor !== null && page.phase === 'snapshot' && state.fenceCursor !== page.fenceCursor)
    )
      throw sourceError('source_cursor_invalid', 409)
    const checkpointKey = JSON.stringify([page.phase, page.inputToken])
    if (
      state.visited.includes(checkpointKey) ||
      (!page.complete &&
        (page.nextToken === null ||
          page.nextToken === page.inputToken ||
          state.visited.includes(JSON.stringify([page.phase, page.nextToken]))))
    )
      throw sourceError('source_cursor_loop', 409)
    const previous = (await readSourceState(db, scope.id)).current
    const factsRevision = Number(scope.revision) + 1
    for (const observation of page.observations) {
      const observationDigest = sourceDigest(observation)
      let stored = (
        await db.query(
          'select * from invitations_source_observation where scope_id=$1 and source=$2 and subject_key=$3 and source_version=$4',
          [scope.id, observation.source, observation.subjectKey, observation.sourceVersion]
        )
      ).rows[0]
      if (stored && stored.digest !== observationDigest) throw sourceError('source_version_conflict', 409)
      if (!stored)
        stored = (
          await db.query(
            `insert into invitations_source_observation(id,scope_id,source,subject_key,source_version,digest,payload,observed_at) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
            [
              randomUUID(),
              scope.id,
              observation.source,
              observation.subjectKey,
              observation.sourceVersion,
              observationDigest,
              observation,
              now
            ]
          )
        ).rows[0]
      await db.query(
        `insert into invitations_source_current(scope_id,source,subject_key,observation_id,facts_revision) values($1,$2,$3,$4,$5) on conflict(scope_id,source,subject_key) do update set observation_id=excluded.observation_id,facts_revision=excluded.facts_revision where (select source_version from invitations_source_observation where id=invitations_source_current.observation_id)<$6`,
        [
          scope.id,
          observation.source,
          observation.subjectKey,
          stored.id,
          factsRevision,
          observation.sourceVersion
        ]
      )
      const [first, ...rest] = observation.identities
      for (const identity of rest)
        await db.query('insert into invitations_sandbox_alias(a,b) values($1,$2) on conflict do nothing', [
          first,
          identity
        ])
      if (negative(observation)) {
        for (const identity of await linkedSourceKeys(db, observation.identities))
          await db.query(
            'insert into invitations_sandbox_suppression(identity) values($1) on conflict do nothing',
            [identity]
          )
      }
    }
    await db.query(
      "update invitations_source_scope set revision=$2,status='pending',reasons='[\"SOURCE_PENDING\"]' where id=$1",
      [scope.id, factsRevision]
    )
    const current = (await readSourceState(db, scope.id)).current
    await onFactsChanged({ db, scopeId: scope.id, previous, current, affectedCampaigns, now })
    for (const campaign of affectedCampaigns)
      await db.query('update invitations_sandbox_campaign set data=$2,revision=revision+1 where id=$1', [
        campaign.id,
        campaign.data
      ])
    state.visited.push(checkpointKey)
    state.coverage = [...new Set([...state.coverage, ...page.coverage])]
    state.fenceCursor ??= page.fenceCursor
    if (page.phase === 'snapshot' && page.complete) {
      state.snapshotComplete = true
      state.phase = 'changes'
      state.token = state.fenceCursor
    } else {
      state.token = page.nextToken
      state.checkpointComplete = page.phase === 'changes' && page.complete
    }
    await db.query(
      'insert into invitations_source_page(id,run_id,phase,input_token,digest,committed_at) values($1,$2,$3,$4,$5,$6)',
      [randomUUID(), run.id, page.phase, tokenKey, digest, now]
    )
    await db.query(
      "update invitations_source_run set state=$2,status='pending',error_code=null where id=$1",
      [run.id, state]
    )
    return { replayed: false, scope: (await readSourceState(db, scope.id)).scope }
  })
}
