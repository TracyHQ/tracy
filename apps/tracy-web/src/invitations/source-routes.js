/** Explicit synthetic source controls. No credentials, URLs or client-supplied facts. */
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { body, writable } from './sandbox-guards.js'
import { SOURCE_NAMESPACE, SOURCE_COVERAGE_KEY, SOURCE_POLICY, sourceError } from './source-contract.js'
import { sourceTransaction, scopeView } from './source-store.js'
import { syncSourceFixture } from './source-sync.js'
import { invalidateSourceApprovals } from './source-approval.js'

const exact = (input, allowed) => {
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw sourceError('source_input_invalid')
  if (!Number.isSafeInteger(input.revision) || input.revision < 0)
    throw sourceError('source_revision_invalid')
}
function campaignId(c) {
  const id = c.req.param('id')
  if (!/^[a-f0-9-]{36}$/.test(id)) throw sourceError('not_found', 404)
  return id
}
export function invitationsSourceRoutes({ pool, config, admit }) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    const who = c.get('invitationsActor') ?? (await admit(c))
    if (who === 'sign-in') return json(c, { code: 'not_signed_in' }, 401)
    if (!who) return json(c, { code: 'forbidden' }, 403)
    if (!config.invitationsSandbox) return json(c, { code: 'not_found' }, 404)
    c.set('invitationsActor', who)
    if (c.req.method !== 'GET' && !writable(who)) return json(c, { code: 'forbidden' }, 403)
    await next()
  })
  app.post('/:id/source-check', async (c) => {
    const input = await body(c, config)
    exact(input, ['revision', 'fixtureSetId'])
    if (input.fixtureSetId !== SOURCE_COVERAGE_KEY) throw sourceError('source_fixture_unknown')
    const result = await sourceTransaction(pool, async (db, now) => {
      const row = (
        await db.query('select * from invitations_sandbox_campaign where id=$1 for update', [campaignId(c)])
      ).rows[0]
      if (!row) throw sourceError('not_found', 404)
      if (row.revision !== input.revision) throw sourceError('stale_revision', 409)
      if (
        row.data.sourceCheck ||
        row.revision !== 0 ||
        row.data.recipients.length ||
        row.data.content?.length
      )
        throw sourceError('source_new_campaign_required', 409)
      const scope = (
        await db.query(
          'insert into invitations_source_scope(id,namespace,coverage_key,policy) values($1,$2,$3,$4) on conflict(namespace,coverage_key) do update set namespace=excluded.namespace returning *',
          [randomUUID(), SOURCE_NAMESPACE, SOURCE_COVERAGE_KEY, SOURCE_POLICY]
        )
      ).rows[0]
      const enrolled = Number(
        (
          await db.query(
            "select count(*) from invitations_sandbox_campaign where data->'sourceCheck'->>'scopeId'=$1",
            [scope.id]
          )
        ).rows[0].count
      )
      if (enrolled >= 100) throw sourceError('source_transaction_limit', 409)
      row.data.sourceCheck = { scopeId: scope.id, policyVersion: SOURCE_POLICY.version, enabledAt: now }
      row.revision++
      row.data.audit.push({
        id: randomUUID(),
        action: 'source-check',
        actor: c.get('invitationsActor').email,
        revision: row.revision,
        createdAt: now
      })
      await db.query('update invitations_sandbox_campaign set data=$2,revision=$3 where id=$1', [
        row.id,
        row.data,
        row.revision
      ])
      return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        ...row.data,
        counts: { recipients: 0, drafts: 0, approved: 0, simulated: 0, suppressed: 0 }
      }
    })
    return json(c, result)
  })
  app.post('/:id/sources/sync', async (c) => {
    const input = await body(c, config)
    exact(input, ['revision', 'fixtureId', 'requestKey'])
    return json(
      c,
      await syncSourceFixture({
        pool,
        campaignId: campaignId(c),
        actor: c.get('invitationsActor').email,
        ...input,
        onFactsChanged: invalidateSourceApprovals
      })
    )
  })
  app.get('/:id/sources', async (c) => {
    const result = await sourceTransaction(
      pool,
      async (db) => {
        const row = (
          await db.query('select * from invitations_sandbox_campaign where id=$1', [campaignId(c)])
        ).rows[0]
        if (!row) throw sourceError('not_found', 404)
        if (!row.data.sourceCheck) throw sourceError('source_check_required', 409)
        const scope = (
          await db.query('select * from invitations_source_scope where id=$1', [row.data.sourceCheck.scopeId])
        ).rows[0]
        const observations = Number(
          (
            await db.query('select count(*) from invitations_source_observation where scope_id=$1', [
              scope.id
            ])
          ).rows[0].count
        )
        const invalidations = (
          await db.query(
            'select recipient_id,draft_revision,reasons,created_at from invitations_source_invalidation where campaign_id=$1 order by created_at desc limit 200',
            [row.id]
          )
        ).rows
        const aggregate = {
          status: scope.status,
          reasons: scope.reasons,
          counts: { observations, invalidations: invalidations.length }
        }
        if (!writable(c.get('invitationsActor'))) return aggregate
        const decisions = (
          await db.query(
            'select recipient_id,checked_at,payload from invitations_source_decision where campaign_id=$1 order by checked_at desc limit 200',
            [row.id]
          )
        ).rows
        return { ...aggregate, scope: scopeView(scope), decisions, invalidations }
      },
      { readOnly: true }
    )
    return json(c, result)
  })
  return app
}
