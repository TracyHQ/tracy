// The rounds of a brand run (brand step trial bench, #320): where a run stands from its saved rounds, one agent
// conversation per round over runAgent, and the gate on the file the agent saved. A rejection goes back to the SAME
// conversation as the next user turn listing only the rejected fields; at most two fix rounds (MAX_FIX_ROUNDS); each
// rejection is tagged agent fault or gate fault. After the last fix round, or at the cost cap, the worker builds the
// safe version (brand-safe-version.js).
import { AgentError, runAgent } from '../lib/agent-over-door.js'
import { agentTools } from './brand-tool-adapter.js'
import { saveTurn, saveTurnProgress, turnCountOf, turnsOf } from './brand-call-store.js'
import { savedToolResult, saveToolResult } from './brand-tool-result-store.js'
import { firstUserMessage, fixMessage } from './brand-first-message.js'
import { costOfTurn } from './brand-prices.js'
import { harnessOf, MAX_FIX_ROUNDS } from './brand-harness.js'
import { brandFileInAnswer, saveBrandFileTool } from './brand-save-tool.js'
import { CostCapReached, createSpend } from './brand-spend.js'
import { roundsOf, saveRound } from './brand-round-store.js'
import { cancelAsked, setProgress } from './brand-store.js'
import { withCmsLine } from '../lib/cms-line.js'
import { checkBrandFile } from './save-brand-file.js'

export const NO_FILE = {
  field: '(file)',
  why: 'no brand file was saved: call save_brand_file with the whole brand file'
}

/**
 * Whom a rejection is blamed on. Fields in parentheses that are not the agent's file ('(kit)', '(files)', '(brief)',
 * '(brand file)': the gate could not check) are the gate's; a gate that cannot check its own inputs is a bug to fix in
 * code, not something the agent can repair. Everything else is the agent's.
 */
export function faultOf(rejected) {
  const gateOnly =
    rejected.length > 0 && rejected.every((r) => /^\((kit|files|brief|brand file)\)$/.test(r.field))
  return gateOnly ? 'gate' : 'agent'
}

/** Where the run stands, from its saved rounds: a round to play, the safe version to build, or the verdict. */
export async function nextRound(pool, runId) {
  const rounds = await roundsOf(pool, runId)
  const last = rounds.at(-1)
  if (!last) return { round: 0, opening: true }
  if (last.state === 'working') {
    const fresh = last.round > 0 && (await turnCountOf(pool, runId, last.round)) === 0
    return { round: last.round, ...(fresh ? { followUp: fixMessage(rounds[last.round - 1].sentBack) } : {}) }
  }
  if (last.state === 'cancelled') return { end: ['cancelled'] }
  if (last.state === 'accepted')
    return { end: ['succeeded', null, { outcome: 'brand-file', brand_file: JSON.stringify(last.attempt) }] }
  if (last.state === 'failed') {
    if (last.error?.startsWith('BRAND_COST_CAP')) return { safe: 'cost-cap' }
    return { end: ['failed', last.error] }
  }
  if (last.round >= MAX_FIX_ROUNDS) return { safe: 'gate' }
  return { round: last.round + 1, opening: true, followUp: fixMessage(last.sentBack) }
}

/** Play one round. Returns the run's verdict when the round ends the run in failure or cancel, else null. */
export async function playRound(deps, { row, ready, round, followUp, leaseToken, must }) {
  const { pool } = deps
  const runId = row.id
  const save = (state, fields = {}) => must(saveRound(pool, { runId, round, state, leaseToken, ...fields }))
  // A call that was dispatched and never answered is NOT sent again (unlike the planner bench): the provider may have
  // answered and charged, and a second call could double the cost or fork the conversation. runAgent refuses to
  // resume past it (AGENT_TURN_UNANSWERED) and the run fails with that reason.
  const history = await turnsOf(pool, runId)
  const result = await ask(deps, { row, ready, round, history, followUp, leaseToken, must })
  if (result.ended) {
    const [state, error] = result.ended
    await save(state, error ? { error } : {})
    // A cost cap ends the agent's work, not the run: the next step builds the safe version.
    return error?.startsWith('BRAND_COST_CAP') ? null : result.ended
  }
  await must(setProgress(pool, { runId, step: 'gate', round, leaseToken }))
  const saved = (await roundsOf(pool, runId)).find((r) => r.round === round)?.attempt
  const attempt = saved ?? brandFileInAnswer(result.answer)
  const gate = attempt
    ? await checkBrandFile({
        brandFile: attempt,
        brief: row.brief,
        kit: ready.kit.doc,
        files: ready.ctx.files,
        spotCheck: row.harness.brandSpotCheck ?? null
      })
    : { ok: false, rejected: [NO_FILE] }
  if (gate.ok) {
    await save('accepted', { attempt, answer: result.answer, gateResult: { ok: true } })
    return null
  }
  await save('rejected', {
    ...(attempt ? { attempt } : {}),
    answer: result.answer,
    gateResult: { ok: false, rejected: gate.rejected },
    sentBack: gate.rejected,
    fault: faultOf(gate.rejected)
  })
  return null
}

// One runAgent call over the saved conversation: { answer, turns }, or { ended } with the round's end state. A cost cap
// reached before a call is { ended: ['failed', 'BRAND_COST_CAP: ...'] }: the next step builds the safe version.
async function ask(deps, { row, ready, round, history, followUp, leaseToken, must }) {
  const { pool } = deps
  const runId = row.id
  const stop = new AbortController()
  const current = { tool: null }
  const capHit = { error: null }
  const spend = createSpend({ pool, runId, capUsd: row.harness.capUsd, round: () => round, leaseToken })
  const ctx = { ...ready.ctx, spend, review: ready.reviewFor({ spend, tool: () => current.tool }) }
  const { tools, resolveImage } = agentTools({
    tools: ready.tools,
    ctx,
    imageEdge: row.harness.imageLongEdge,
    onTool: (name) => {
      current.tool = name
    },
    // Every tool answer is saved before the loop gets it; a call that has one is not made again on a resume.
    results: {
      get: (key) => savedToolResult(pool, { runId, ...key }),
      put: (key, result) => must(saveToolResult(pool, { runId, ...key, result, leaseToken }))
    },
    // A cap reached inside a tool ends the run: the loop is told to stop, and the cap is the round's end below.
    onCapReached: (error) => {
      capHit.error ??= error
      stop.abort()
    },
    extra: [saveBrandFileTool({ pool, runId, round: () => round, leaseToken })]
  })
  try {
    return await runAgent({
      door: ready.agent.door,
      system: withCmsLine(ready.prompt.text, ready.kit?.platform),
      firstUser: firstUserMessage({ kit: ready.kit, brief: row.brief }),
      tools,
      resolveImage,
      history,
      followUp,
      fetchImpl: deps.fetchImpl,
      signal: stop.signal,
      ...harnessOf(row.harness),
      ...(deps.retry ? { retry: deps.retry } : {}),
      onProgress: ({ n, ...progress }) => saveTurnProgress(pool, { runId, n, progress, leaseToken }),
      onTurn: async (turn) => {
        // The cap is checked before every call goes out, and nothing is saved for a call that never goes out.
        if (turn.state === 'dispatched') await spend.check()
        // An answer with no cost figure is counted at the model's price and saved as estimated, never as 0.
        const unpriced = turn.state === 'answered' && turn.cost == null
        const saved = unpriced ? { ...turn, cost: costOfTurn(turn.usage, ready.agentPrice) } : turn
        const model = ready.agent.door.model
        await must(saveTurn(pool, { runId, round, turn: saved, model, leaseToken, costEstimated: unpriced }))
        if (turn.state === 'answered' && (await cancelAsked(pool, runId))) stop.abort()
      }
    })
  } catch (error) {
    if (capHit.error) return { ended: ['failed', capHit.error.message] }
    if (error instanceof CostCapReached) return { ended: ['failed', error.message] }
    if (!(error instanceof AgentError)) throw error
    if (error.code === 'AGENT_ABORTED') return { ended: ['cancelled'] }
    return { ended: ['failed', error.message] }
  }
}
