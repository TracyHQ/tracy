import { randomUUID } from 'node:crypto'
import { SOURCE_NAMESPACE, SOURCE_COVERAGE_KEY, SOURCE_POLICY } from '../src/invitations/source-contract.js'

export async function sourceCampaign(pool, data = {}) {
  const scope = (
    await pool.query(
      `insert into invitations_source_scope(id,namespace,coverage_key,policy) values($1,$2,$3,$4) on conflict(namespace,coverage_key) do update set namespace=excluded.namespace returning id`,
      [randomUUID(), SOURCE_NAMESPACE, SOURCE_COVERAGE_KEY, SOURCE_POLICY]
    )
  ).rows[0]
  const id = randomUUID()
  await pool.query(
    `insert into invitations_sandbox_campaign(id,name,data) values($1,'Synthetic source test',$2)`,
    [
      id,
      {
        recipients: [],
        audit: [],
        ...data,
        sourceCheck: { scopeId: scope.id, policyVersion: SOURCE_POLICY.version }
      }
    ]
  )
  return { id, scopeId: scope.id, revision: 0 }
}

export async function sourceDump(pool, scopeId) {
  const scope = (await pool.query('select * from invitations_source_scope where id=$1', [scopeId])).rows
  const observations = (
    await pool.query('select * from invitations_source_observation order by source,source_version')
  ).rows
  const current = (await pool.query('select * from invitations_source_current order by source,subject_key'))
    .rows
  const pages = (await pool.query('select * from invitations_source_page order by id')).rows
  const suppressions = (await pool.query('select * from invitations_sandbox_suppression order by identity'))
    .rows
  return { scope, observations, current, pages, suppressions }
}
