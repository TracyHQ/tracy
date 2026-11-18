/**
 * The progress of a step chain demo build on the list and Details doors (#516, spec #512): each demo action whose build
 * runs (or will run) the step chain gets `run`, read from the measurement the run frame keeps on the site's brief row
 * (`site_brief.timings.chain`) and the estimate measured from past chain builds (`lib/wo-chain-builds.js`). An action of
 * any other build gets nothing, and its card keeps its own steps.
 */
import { AGENT_DEMO } from './agent-demo.js'
import { CURRENT_BRIEF } from '../lib/site-brief-row.js'
import { chainTemplateOf, STEP_CHAIN_WORKFLOW, stepChainEnabled } from '../lib/step-chain-switch.js'
import { chainEstimates, chainRunOpen, chainRunView } from '../lib/wo-chain-builds.js'

/**
 * Set `run` on each shaped demo action (`demoActionShape`) of a chain build, in place.
 * @param {import('pg').Pool} pool
 * @param {Array<{ id: string } | null | undefined>} actions
 * @param {{ now: number }} at
 */
export async function withChainRuns(pool, actions, { now }) {
  const shaped = actions.filter((a) => a && typeof a.id === 'string')
  if (!shaped.length) return
  const { rows } = await pool.query(
    `select a.id, a.accepted_at, a.selection, w.id as build_id, w.receipt ->> 'workflow' as workflow,
            b.state as brief_state, b.created_at as brief_at, b.quickstart, b.timings -> 'chain' as chain
       from wo_demo_action a
       left join wo_build w on w.account_id = a.account_id and w.request_id = a.build_request_id
       left join site s on s.site_key = w.site_key
       left join site_brief b on b.site_key = w.site_key and ${CURRENT_BRIEF}
      where a.id = any($1::uuid[])`,
    [shaped.map((a) => a.id)]
  )
  // A pressed action with no build yet runs the chain when its template is on it now (`builds.js` `startBuild`).
  const chained = rows.filter((r) =>
    r.build_id
      ? r.workflow === STEP_CHAIN_WORKFLOW
      : r.selection?.workflow === AGENT_DEMO && stepChainEnabled({ quickstart: r.selection?.quickstart })
  )
  if (!chained.length) return
  const estimateOf = await chainEstimates(pool)
  const byId = new Map(chained.map((r) => [r.id, r]))
  for (const action of shaped) {
    const r = byId.get(action.id)
    if (!r) continue
    const open = r.brief_state ? chainRunOpen(r.brief_state) : action.state === 'queued'
    const template = chainTemplateOf(r.quickstart ?? r.selection?.quickstart)
    action.run = chainRunView({
      chain: r.chain,
      open,
      startedAt: r.brief_at ?? r.accepted_at,
      now,
      estimate: estimateOf(template),
      stepEstimates: estimateOf.steps(template)
    })
  }
}

/**
 * The Build form's choices (`templateChoices`) with each chain template's estimate: `{minutes, usd}`, or null when no
 * chain build was measured yet. A template the chain does not build carries none.
 * @param {import('pg').Pool} pool
 * @param {any} choices
 */
export async function withTemplateEstimates(pool, choices) {
  if (!choices || 'error' in choices) return choices
  const templates = Object.values(choices).flatMap((c) => c?.templates ?? [])
  if (!templates.some((t) => stepChainEnabled({ quickstart: t.quickstart }))) return choices
  const estimateOf = await chainEstimates(pool)
  for (const t of templates)
    if (stepChainEnabled({ quickstart: t.quickstart })) t.estimate = estimateOf(chainTemplateOf(t.quickstart))
  return choices
}
