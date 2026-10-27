/** Owner-only evidence and Stop doors remain available when the feature switch is off. */
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { renderQualityPage } from './quality-page.js'
import { qualityRunStore } from './quality-runs.js'

const BASE = '/api/website-opportunities/quality/runs'
const PAGE = '/website-opportunities/quality/runs'
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const safeModel = (config) =>
  config &&
  Object.fromEntries(
    ['role', 'providerId', 'model', 'reasoning', 'hash', 'capabilities', 'price']
      .filter((k) => Object.hasOwn(config, k))
      .map((k) => [k, config[k]])
  )

export async function qualityEvidenceOf(pool, { id, accountId }) {
  if (!UUID.test(id ?? '') || !accountId) return null
  const run = (
    await pool.query('select * from wo_quality_run where id=$1 and account_id=$2', [id, accountId])
  ).rows[0]
  if (!run) return null
  const [intent, attempts, operations, ledger, site] = await Promise.all([
    pool.query(
      'select state,deadline,repair_count,(select count(*)::int from wo_quality_attempt a where a.intent_id=i.id) as attempt_count from wo_quality_intent i where id=$1 and account_id=$2',
      [run.intent_id, accountId]
    ),
    pool.query(
      'select id,stage,state,created_at,updated_at,error,receipt,model_config from wo_quality_attempt where run_id=$1 order by created_at,id',
      [id]
    ),
    pool.query(
      'select id,state,operation,before_image,after_image,receipt,created_at,updated_at from wo_quality_operation where run_id=$1 and account_id=$2 order by created_at,id',
      [id, accountId]
    ),
    pool.query(
      `select coalesce(sum(actual_cents) filter(where state='settled'),0)::int as spent,
      coalesce(sum(reserved_cents) filter(where state='reserved'),0)::int as reserved,
      coalesce(sum(reserved_cents) filter(where state='unreconciled'),0)::int as unreconciled
      from wo_cost_ledger where job_id=$1 and account_id=$2`,
      [run.intent_id, accountId]
    ),
    pool.query(
      'select b.site_key,s.address from wo_build b left join site s on s.site_key=b.site_key where b.revision_id=$1 and b.account_id=$2 order by b.created_at desc limit 1',
      [run.revision_id, accountId]
    )
  ])
  const i = intent.rows[0],
    cost = ledger.rows[0]
  return {
    run: {
      id,
      intentId: run.intent_id,
      accountId,
      opportunityId: run.opportunity_id,
      revisionId: run.revision_id,
      actionId: run.action_id,
      state: run.state,
      error: run.error,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      policy: run.policy,
      release: run.input.manifest?.release,
      modelConfigs: Object.fromEntries(
        Object.entries(run.input.models ?? {}).map(([role, model]) => [role, safeModel(model)])
      )
    },
    intent: i && {
      state: i.state,
      deadline: i.deadline,
      attemptCount: i.attempt_count,
      repairCount: i.repair_count
    },
    artifacts: run.artifacts,
    attempts: attempts.rows.map((a) => ({
      id: a.id,
      stage: a.stage,
      state: a.state,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      error: a.error,
      model: safeModel(a.model_config),
      receipt:
        a.receipt &&
        Object.fromEntries(
          ['usage', 'costCents', 'requestId', 'durationMs', 'usageBasis', 'completeness']
            .filter((k) => Object.hasOwn(a.receipt, k))
            .map((k) => [k, a.receipt[k]])
        )
    })),
    operations: operations.rows.map((o) => ({
      id: o.id,
      state: o.state,
      kind: o.operation?.kind,
      target: o.operation?.key ?? o.operation?.menuId,
      expectedBefore: o.before_image,
      actualAfter: o.after_image,
      receipt: o.receipt,
      createdAt: o.created_at,
      updatedAt: o.updated_at
    })),
    cost: {
      spentCents: cost.spent,
      reservedCents: cost.reserved,
      unreconciledCents: cost.unreconciled,
      jobCapCents: run.policy.jobCapCents,
      accountDailyCapCents: run.policy.accountDailyCapCents,
      costBasis: 'Settled ledger cents; model usage uses the frozen verified price upper bound.'
    },
    links: {
      json: `${BASE}/${id}`,
      cancel: `${BASE}/${id}/cancel`,
      page: `${PAGE}/${id}`,
      opportunity: `/new/?tab=website-opportunities&opportunity=${run.opportunity_id}`,
      ...(site.rows[0]?.address ? { site: site.rows[0].address } : {})
    }
  }
}

export function qualityEvidenceRoutes({
  pool,
  config,
  now = Date.now,
  readEvidence = (identity) => qualityEvidenceOf(pool, identity),
  cancelRun = (id, accountId) => qualityRunStore({ pool, now }).cancel(id, accountId)
}) {
  const app = new Hono()
  const find = async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const accountId = (await pool.query('select id from account where lower(email)=lower($1)', [email]))
      .rows[0]?.id
    const data = await readEvidence({ id: c.req.param('id'), accountId })
    return data ?? json(c, { code: 'NOT_FOUND', next: 'This editorial run is gone or is not yours.' }, 404)
  }
  app.get(`${BASE}/:id`, async (c) => {
    const data = await find(c)
    c.header('cache-control', 'private, no-store')
    return data instanceof Response ? data : json(c, data)
  })
  app.get(`${PAGE}/:id`, async (c) => {
    const data = await find(c)
    c.header('cache-control', 'private, no-store')
    return data instanceof Response
      ? data
      : c.html(renderQualityPage(data, { t: translator(requestLanguage(c)) }))
  })
  app.post(`${BASE}/:id/cancel`, async (c) => {
    if (c.req.header('origin') !== String(config.origin).replace(/\/+$/, ''))
      return json(c, { code: 'ORIGIN_REQUIRED', next: 'Stop this run from its own Tracy page.' }, 403)
    const data = await find(c)
    if (data instanceof Response) return data
    await cancelRun(data.run.id, data.run.accountId)
    c.header('cache-control', 'private, no-store')
    return c.req.header('accept')?.includes('text/html')
      ? c.redirect(data.links.page, 303)
      : json(c, { state: 'cancelled', runId: data.run.id })
  })
  return app
}
